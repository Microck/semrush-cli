import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Effect, ManagedRuntime, Schema } from 'effect';
import { reports, version, previewMutation } from './report-parameters.js';
import { Semrush } from './browser-service.js';
import { semrushLive } from './browser-layer.js';
import { sessionsLive } from './session-layer.js';
import { Layer } from 'effect';
import { parseReport } from './validation.js';
import { UsageError } from './errors.js';

export const appLayer = semrushLive.pipe(Layer.provide(sessionsLive));

/** Protocol-only stdout; validation and auth failures become ordinary MCP tool errors. */
export async function serveMcp(): Promise<void> {
  const runtime = ManagedRuntime.make(appLayer);
  const server = new Server({ name: 'semrush-cli', version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: Object.entries(reports).map(([name, report]) => ({ name, description: report.description, inputSchema: report.schema, annotations: { readOnlyHint: !report.mutation, destructiveHint: report.destructive, idempotentHint: !report.mutation, openWorldHint: true } })) }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const program = Effect.gen(function* () {
      const parsed = yield* parseReport(request.params.name, yield* Schema.decodeUnknownEffect(Schema.JsonObject)(request.params.arguments ?? {}).pipe(Effect.mapError(() => new UsageError({ message: 'Tool arguments must be a JSON object.' }))));
      return parsed;
    });
    const validated = await Effect.runPromise(program.pipe(Effect.match({ onSuccess: value => ({ ok: true as const, value }), onFailure: error => ({ ok: false as const, message: error.message }) })));
    if (!validated.ok) return { isError: true, content: [{ type: 'text', text: validated.message }] };
    const preview = previewMutation(validated.value.name, validated.value.definition, validated.value.query);
    if (preview) return { content: [{ type: 'text', text: JSON.stringify(preview) }] };
    const outcome = await runtime.runPromise(Effect.gen(function* () {
      return yield* (yield* Semrush).report(validated.value);
    }).pipe(Effect.match({ onSuccess: value => ({ ok: true as const, text: JSON.stringify(value) }), onFailure: error => ({ ok: false as const, text: error.message }) }))).catch(() => ({ ok: false as const, text: 'Semrush session or browser unavailable. Run semrush-cli doctor, then reconnect this MCP server.' }));
    return { isError: !outcome.ok, content: [{ type: 'text', text: outcome.text }] };
  });
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await runtime.dispose(); await server.close(); };
  server.onclose = () => { void close(); };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  await server.connect(new StdioServerTransport());
}
