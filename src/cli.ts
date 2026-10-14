#!/usr/bin/env node
import { Command, Option as CliOption, InvalidArgumentError, CommanderError } from 'commander';
import { Effect } from 'effect';
import type { Scope } from 'effect';
import { reports, version, type Query } from './report-parameters.js';
import { Sessions } from './session-service.js';
import { sessionsLive } from './session-layer.js';
import { initializeDaemon, startDaemon, stopDaemon, installBrowser } from './daemon.js';

const interruption = new AbortController();
const cli = new Command().name('semrush-cli').description('Semrush research through your signed-in account. CLI + MCP, powered by Effect and Galleton.').version(version).exitOverride().showHelpAfterError().option('--json', 'Emit compact JSON').option('--no-input', 'Never prompt for terminal input').option('--no-color', 'Disable terminal colors');
cli.addHelpText('after', '\nExamples:\n  semrush-cli setup\n  semrush-cli auth login\n  semrush-cli domain-overview --domain openai.com --json\n  semrush-cli keyword-magic --keyword "email marketing" --page-size 20 --json\n  semrush-cli mcp\n\nDocumentation: https://semrush.micr.dev\n');

function output<A>(value: A, command: Command): void {
  process.stdout.write(JSON.stringify(value, null, command.optsWithGlobals().json ? undefined : 2) + '\n');
}

async function execute<A, E extends { readonly message: string }>(program: Effect.Effect<A, E, Scope.Scope>, command: Command): Promise<void> {
  await Effect.runPromise(Effect.scoped(program).pipe(Effect.match({
    onSuccess: value => output(value, command),
    onFailure: error => { process.stderr.write(`semrush-cli: ${error.message}\n`); process.exitCode = 'name' in error && error.name === 'UsageError' ? 2 : 1; },
  })), { signal: interruption.signal });
}

cli.command('reports').description('List all 48 read-only research reports').action((_options, command: Command) => {
  output(Object.entries(reports).map(([name, report]) => ({ command: name.replaceAll('_', '-'), tool: name, description: report.description, schema: report.schema })), command);
});

interface Property { type?: string; default?: unknown; description?: string; anyOf?: { type?: string }[]; }
for (const [name, definition] of Object.entries(reports)) {
  const report = cli.command(name.replaceAll('_', '-')).description(definition.description);
  const schema: { properties: Record<string, Property>; required?: string[] } = definition.schema;
  for (const [key, property] of Object.entries(schema.properties)) {
    const flag = key.replaceAll('_', '-');
    const description = (property.description ?? key.replaceAll('_', ' ')) + (property.default === undefined ? '' : ` (default: ${JSON.stringify(property.default)})`);
    const type = property.type ?? property.anyOf?.find(candidate => candidate.type !== 'null')?.type;
    const option = new CliOption(type === 'boolean' ? `--${flag} [boolean]` : `--${flag} <${type === 'array' || type === 'object' ? 'json' : 'value'}>`, description);
    option.argParser((text: string) => {
      if (type === 'boolean') {
        if (!['true', 'false'].includes(text)) throw new InvalidArgumentError('Expected true or false.');
        return text === 'true';
      }
      if (type === 'integer' || type === 'number') {
        if (!text.trim() || !Number.isFinite(Number(text))) throw new InvalidArgumentError('Expected a number.');
        return Number(text);
      }
      if (type === 'array' || type === 'object') {
        try { return JSON.parse(text); } catch { throw new InvalidArgumentError('Expected valid JSON.'); }
      }
      return text;
    });
    if (schema.required?.includes(key)) option.makeOptionMandatory();
    report.addOption(option);
  }
  report.action(async (_options, command: Command) => {
    const { parseReport } = await import('./validation.js');
    const options = command.opts<Query>();
    const input = Object.fromEntries(Object.keys(schema.properties).map(key => [key, options[key.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())]]).filter(([, value]) => value !== undefined));
    // Parse before acquiring any credential-bearing browser resources.
    const parsed = await Effect.runPromise(parseReport(name, input).pipe(Effect.match({ onSuccess: value => ({ ok: true as const, value }), onFailure: error => ({ ok: false as const, error }) })));
    if (!parsed.ok) { process.stderr.write(`semrush-cli: ${parsed.error.message}\n`); process.exitCode = 2; return; }
    const { appLayer } = await import('./mcp.js');
    const { Semrush } = await import('./browser-service.js');
    await execute(Effect.gen(function* () { return yield* (yield* Semrush).report(parsed.value); }).pipe(Effect.provide(appLayer)), command);
  });
}

cli.command('setup').description('Install Chromium and initialize the private Galleton daemon').action((_options, command: Command) => execute(Effect.gen(function* () {
  yield* initializeDaemon();
  yield* installBrowser();
  return { ...(yield* startDaemon()), next: 'semrush-cli auth login' };
}), command));
const daemon = cli.command('daemon').description('Control the CLI-owned Galleton daemon');
daemon.command('start').description('Start the private daemon').action((_options, command: Command) => execute(startDaemon(), command));
daemon.command('stop').description('Gracefully stop the private daemon').action((_options, command: Command) => execute(stopDaemon(), command));
const auth = cli.command('auth').description('Store and inspect your Semrush session in Galleton');
auth.command('import').description('Import a signed-in local Chromium context').requiredOption('--cdp-url <url>', 'Loopback CDP URL, e.g. http://127.0.0.1:9234').action(async (options: { cdpUrl: string }, command: Command) => execute((await import('./auth.js')).importBrowser(options.cdpUrl).pipe(Effect.provide(sessionsLive)), command));
auth.command('login').description('Sign in through an isolated visible Chromium window').action(async (_options, command: Command) => execute((await import('./auth.js')).login().pipe(Effect.provide(sessionsLive)), command));
auth.command('status').description('Show session metadata without credentials').option('--check', 'Verify the stored session against Semrush').action((options: { check?: boolean }, command: Command) => execute(Effect.gen(function* () {
  const status = yield* (yield* Sessions).status();
  if (options.check) {
    const { appLayer } = yield* Effect.promise(() => import('./mcp.js'));
    const { Semrush } = yield* Effect.promise(() => import('./browser-service.js'));
    const { parseReport } = yield* Effect.promise(() => import('./validation.js'));
    yield* Effect.gen(function* () { return yield* (yield* Semrush).report(yield* parseReport('account_status', {})); }).pipe(Effect.provide(appLayer));
  }
  return { logged_in: status.status === 'ready', source: 'galleton', ...status, session_valid: options.check ? true : undefined };
}).pipe(Effect.provide(sessionsLive)), command));
auth.command('logout').description('Forget this CLI session from Galleton').action((_options, command: Command) => execute(Effect.gen(function* () { yield* (yield* Sessions).forget(); return { logged_in: false, forgotten: true }; }).pipe(Effect.provide(sessionsLive)), command));
cli.command('doctor').description('Check Galleton, browser and authenticated report access').action(async (_options, command: Command) => {
  const { appLayer } = await import('./mcp.js');
  const { Semrush } = await import('./browser-service.js');
  const { parseReport } = await import('./validation.js');
  await execute(Effect.gen(function* () { yield* (yield* Semrush).report(yield* parseReport('account_status', {})); return { ok: true, galleton: true, chromium: true, authenticated: true }; }).pipe(Effect.provide(appLayer)), command);
});
cli.command('mcp').description('Run the read-only MCP server over stdio').action(async () => (await import('./mcp.js')).serveMcp());

process.once('SIGINT', () => { if (process.argv.includes('mcp')) return; process.exitCode = 130; interruption.abort(); });
try { await cli.parseAsync(); }
catch (error) {
  // Commander writes usage details itself. Other defects must not expose browser payloads.
  if (interruption.signal.aborted) process.exitCode = 130;
  else if (error instanceof CommanderError) process.exitCode = error.exitCode === 0 ? 0 : 2;
  else { process.stderr.write('semrush-cli: Unexpected failure. Run semrush-cli doctor and report the failing command at https://github.com/Microck/semrush-cli/issues.\n'); process.exitCode = 1; }
}
