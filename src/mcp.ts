import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Effect, ManagedRuntime, Schema } from 'effect';
import { reportResponseType, reports, version, previewMutation } from './report-parameters.js';
import { Semrush } from './browser-service.js';
import { semrushLive } from './browser-layer.js';
import { sessionsLive } from './session-layer.js';
import { Layer } from 'effect';
import { parseReport } from './validation.js';
import { UsageError } from './errors.js';
import { Exports, exportsLive } from './exports.js';

// CLI saves and MCP resource reads need the same export store as the report service.
export const appLayer = semrushLive.pipe(Layer.provide(sessionsLive), Layer.provideMerge(exportsLive));

/** Protocol-only stdout; validation and auth failures become ordinary MCP tool errors. */
export async function serveMcp(): Promise<void> {
  const runtime = ManagedRuntime.make(appLayer);
  let runtimeReady = false;
  const server = new Server({ name: 'semrush-cli', version }, { capabilities: { tools: {}, resources: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: Object.entries(reports).map(([name, report]) => ({ name, description: report.description, inputSchema: report.schema, annotations: { readOnlyHint: !report.mutation, destructiveHint: report.destructive, idempotentHint: !report.mutation && reportResponseType(report) !== 'download_job', openWorldHint: true } })) }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
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
    }).pipe(Effect.match({ onSuccess: value => { runtimeReady = true; return { ok: true as const, text: JSON.stringify(value) }; }, onFailure: error => ({ ok: false as const, text: error.message }) })), { signal: extra.signal }).catch(() => ({ ok: false as const, text: 'Semrush session or browser unavailable. Run semrush doctor, then reconnect this MCP server.' }));
    return { isError: !outcome.ok, content: [{ type: 'text', text: outcome.text }] };
  });
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [{
    uriTemplate: 'semrush-export://{export_id}{?offset,limit}', name: 'Semrush export file',
    description: 'Read a downloaded export in byte chunks. Default 65536 bytes; maximum 1048576 bytes per read.',
  }] }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    if (!runtimeReady) return { resources: [] };
    const files = await runtime.runPromise(Effect.gen(function* () { return yield* (yield* Exports).list(); }));
    return { resources: files.map(file => ({ uri: file.uri, name: file.filename, mimeType: file.mime_type, description: `${file.size_bytes} bytes` })) };
  });
  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    if (!runtimeReady) throw new McpError(ErrorCode.InvalidParams, 'Unknown export URI. Download an export first.');
    const outcome = await runtime.runPromise(Effect.gen(function* () { return yield* (yield* Exports).read(request.params.uri); }).pipe(Effect.match({
      onSuccess: value => ({ ok: true as const, value }),
      onFailure: error => ({ ok: false as const, message: error.message, code: error.name === 'UsageError' ? ErrorCode.InvalidParams : ErrorCode.InternalError }),
    })), { signal: extra.signal });
    if (!outcome.ok) throw new McpError(outcome.code, outcome.message);
    return { contents: [outcome.value] };
  });
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await runtime.dispose(); await server.close(); };
  server.onclose = () => { void close(); };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  await server.connect(new StdioServerTransport());
}
