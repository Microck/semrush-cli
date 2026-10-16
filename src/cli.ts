#!/usr/bin/env node
import { Command, Option as CliOption, InvalidArgumentError, CommanderError } from 'commander';
import { Effect } from 'effect';
import type { Scope } from 'effect';
import { reports, version, previewMutation, type Query } from './report-parameters.js';
import { Sessions } from './session-service.js';
import { sessionsLive } from './session-layer.js';
import { initializeDaemon, startDaemon, stopDaemon, installBrowser } from './daemon.js';
import { Exports } from './exports.js';
import { UsageError } from './errors.js';
import { readFile } from 'node:fs/promises';
import { text as readText } from 'node:stream/consumers';
import { addAbortSignal } from 'node:stream';

const interruption = new AbortController();
const cli = new Command().name('semrush').description('Semrush research through your signed-in account. CLI + MCP, powered by Effect and Galleton.').version(version).exitOverride().showHelpAfterError().option('--json', 'Emit compact JSON').option('--no-input', 'Never prompt for terminal input').option('--no-color', 'Disable terminal colors');
cli.addHelpText('after', '\nExamples:\n  semrush setup\n  semrush auth login\n  semrush domain-overview --domain openai.com --json\n  semrush keyword-magic --keyword "email marketing" --page-size 20 --json\n  semrush mcp\n\nDocumentation: https://semrush.micr.dev\n');

function output<A>(value: A, command: Command): void {
  process.stdout.write(JSON.stringify(value, null, command.optsWithGlobals().json ? undefined : 2) + '\n');
}

async function execute<A, E extends { readonly message: string }>(program: Effect.Effect<A, E, Scope.Scope>, command: Command): Promise<void> {
  await Effect.runPromise(Effect.scoped(program).pipe(Effect.match({
    onSuccess: value => output(value, command),
    onFailure: error => { process.stderr.write(`semrush: ${error.message}\n`); process.exitCode = 'name' in error && error.name === 'UsageError' ? 2 : 1; },
  })), { signal: interruption.signal });
}

cli.command('reports').description('List research reports and project operations').action((_options, command: Command) => {
  output(Object.entries(reports).map(([name, report]) => ({ command: name.replaceAll('_', '-'), tool: name, description: report.description, read_only: !report.mutation, destructive: report.destructive, schema: report.schema })), command);
});

interface Property { type?: string; default?: unknown; description?: string; anyOf?: { type?: string }[]; writeOnly?: boolean; contentMediaType?: string; }
/** Convert CLI text at one boundary; schema validation still owns defaults and constraints. */
async function parseCliInput(properties: Record<string, Property>, options: Record<string, string | boolean | undefined>): Promise<Query> {
  const input: Query = {};
  for (const [key, property] of Object.entries(properties)) {
    const fileInput = property.writeOnly === true || Boolean(property.contentMediaType);
    const optionName = key.replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase());
    let value = options[optionName + (fileInput ? 'File' : '')];
    if (value === undefined) continue;
    if (fileInput) {
      try { value = value === '-' ? await readText(addAbortSignal(interruption.signal, process.stdin)) : await readFile(String(value), { encoding: 'utf8', signal: interruption.signal }); }
      catch { throw new InvalidArgumentError('--' + key.replaceAll('_', '-') + '-file could not be read. Check the path, or use - to read stdin.'); }
      if (property.writeOnly) value = value.replace(/\r?\n$/, '');
    }
    const type = property.type ?? property.anyOf?.find(candidate => candidate.type !== 'null')?.type;
    if (value === 'null' && property.anyOf?.some(candidate => candidate.type === 'null')) { input[key] = null; continue; }
    if (type === 'boolean') {
      if (![true, false, 'true', 'false'].includes(value)) throw new InvalidArgumentError('--' + key.replaceAll('_', '-') + ' expects true or false.');
      input[key] = value === true || value === 'true'; continue;
    }
    const text = String(value);
    if (type === 'integer' || type === 'number') {
      if (!text.trim() || !Number.isFinite(Number(text))) throw new InvalidArgumentError('--' + key.replaceAll('_', '-') + ' expects a number.');
      input[key] = Number(text); continue;
    }
    if (type === 'array' || type === 'object') {
      try { input[key] = JSON.parse(text); } catch { throw new InvalidArgumentError('--' + key.replaceAll('_', '-') + ' expects valid JSON.'); }
      continue;
    }
    input[key] = text;
  }
  return input;
}

for (const [name, definition] of Object.entries(reports)) {
  const report = cli.command(name.replaceAll('_', '-')).description(definition.description);
  if ('response_type' in definition && ['download', 'download_url', 'export_id'].includes(definition.response_type)) report.requiredOption('--output <path>', 'Save the export file; refuses an existing destination');
  const schema: { properties: Record<string, Property>; required?: string[] } = definition.schema;
  for (const [key, property] of Object.entries(schema.properties)) {
    const flag = key.replaceAll('_', '-');
    const description = (property.description ?? key.replaceAll('_', ' ')) + (property.default === undefined ? '' : ` (default: ${JSON.stringify(property.default)})`);
    const type = property.type ?? property.anyOf?.find(candidate => candidate.type !== 'null')?.type;
    const fileInput = property.writeOnly === true || Boolean(property.contentMediaType);
    const option = new CliOption(fileInput ? `--${flag}-file <path>` : type === 'boolean' ? `--${flag} [boolean]` : `--${flag} <${type === 'array' || type === 'object' ? 'json' : 'value'}>`, description);
    if (schema.required?.includes(key)) option.makeOptionMandatory();
    report.addOption(option);
  }
  report.action(async (_options, command: Command) => {
    const { parseReport } = await import('./validation.js');
    // Commander normalizes null parser returns to empty strings. Parse raw values once here.
    const parsed = await Effect.runPromise(Effect.tryPromise({
      try: () => parseCliInput(schema.properties, command.opts<Record<string, string | boolean | undefined>>()),
      catch: error => new UsageError({ message: error instanceof InvalidArgumentError ? error.message : 'Invalid command option value.' }),
    }).pipe(Effect.flatMap(input => parseReport(name, input)),
      Effect.match({ onSuccess: value => ({ ok: true as const, value }), onFailure: error => ({ ok: false as const, error }) })), { signal: interruption.signal });
    if (!parsed.ok) { process.stderr.write(`semrush: ${parsed.error.message}\n`); process.exitCode = 2; return; }
    const preview = previewMutation(parsed.value.name, parsed.value.definition, parsed.value.query);
    if (preview) { output(preview, command); return; }
    const { appLayer } = await import('./mcp.js');
    const { Semrush } = await import('./browser-service.js');
    await execute(Effect.gen(function* () {
      const response = yield* (yield* Semrush).report(parsed.value);
      if (!response.artifact) return response;
      const destination = command.opts<{ output: string }>().output;
      const artifact = yield* (yield* Exports).saveAs(response.artifact.uri, destination);
      return { authenticated: true, report: name, data: { saved: destination, bytes: artifact.size_bytes, mime_type: artifact.mime_type } };
    }).pipe(Effect.provide(appLayer)), command);
  });
}

cli.command('setup').description('Install Chromium and initialize the private Galleton daemon').action((_options, command: Command) => execute(Effect.gen(function* () {
  yield* initializeDaemon();
  yield* installBrowser();
  return { ...(yield* startDaemon()), next: 'semrush auth login' };
}), command));
const daemon = cli.command('daemon').description('Control the CLI-owned Galleton daemon');
daemon.command('start').description('Start the private daemon').action((_options, command: Command) => execute(startDaemon(), command));
daemon.command('stop').description('Gracefully stop the private daemon').action((_options, command: Command) => execute(stopDaemon(), command));
const auth = cli.command('auth').description('Store and inspect your Semrush session in Galleton');
auth.command('import').description('Import a signed-in local Chromium context').requiredOption('--cdp-url <url>', 'Loopback CDP URL, e.g. http://127.0.0.1:9234').action(async (options: { cdpUrl: string }, command: Command) => execute((await import('./auth.js')).importBrowser(options.cdpUrl).pipe(Effect.provide(sessionsLive)), command));
auth.command('login').description('Sign in through an isolated visible Chromium window').action(async (_options, command: Command) => execute((await import('./auth.js')).login().pipe(Effect.provide(sessionsLive)), command));
auth.command('status').description('Show session metadata without credentials').option('--check', 'Verify the stored session against Semrush').action((options: { check?: boolean }, command: Command) => execute(Effect.gen(function* () {
  const status = yield* (yield* Sessions).status();
  let account: { readonly email: string | null } | undefined;
  if (options.check) {
    const { appLayer } = yield* Effect.promise(() => import('./mcp.js'));
    const { Semrush } = yield* Effect.promise(() => import('./browser-service.js'));
    const { parseReport } = yield* Effect.promise(() => import('./validation.js'));
    account = yield* Effect.gen(function* () { const semrush = yield* Semrush; yield* semrush.report(yield* parseReport('account_status', {})); return semrush.account; }).pipe(Effect.provide(appLayer));
  }
  return { logged_in: status.status === 'ready', source: 'galleton', ...status, session_valid: options.check ? true : undefined, account };
}).pipe(Effect.provide(sessionsLive)), command));
auth.command('logout').description('Forget this CLI session from Galleton').action((_options, command: Command) => execute(Effect.gen(function* () { yield* (yield* Sessions).forget(); return { logged_in: false, forgotten: true }; }).pipe(Effect.provide(sessionsLive)), command));
cli.command('doctor').description('Check Galleton, browser and authenticated report access').action(async (_options, command: Command) => {
  const { appLayer } = await import('./mcp.js');
  const { Semrush } = await import('./browser-service.js');
  const { parseReport } = await import('./validation.js');
  await execute(Effect.gen(function* () { const semrush = yield* Semrush; yield* semrush.report(yield* parseReport('account_status', {})); return { ok: true, galleton: true, chromium: true, authenticated: true, account: semrush.account }; }).pipe(Effect.provide(appLayer)), command);
});
cli.command('mcp').description('Run the MCP server over stdio').action(async () => (await import('./mcp.js')).serveMcp());

process.once('SIGINT', () => { if (process.argv.includes('mcp')) return; process.exitCode = 130; interruption.abort(); });
try { await cli.parseAsync(); }
catch (error) {
  // Commander writes usage details itself. Other defects must not expose browser payloads.
  if (interruption.signal.aborted) process.exitCode = 130;
  else if (error instanceof CommanderError) process.exitCode = error.exitCode === 0 ? 0 : 2;
  else { process.stderr.write('semrush: Unexpected failure. Run semrush doctor and report the failing command at https://github.com/Microck/semrush-cli/issues.\n'); process.exitCode = 1; }
}
