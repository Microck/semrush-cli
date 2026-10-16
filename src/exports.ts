import { randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { Context, Effect, Layer, Predicate, Schema } from 'effect';
import { ReportError, UsageError } from './errors.js';

export const ExportArtifact = Schema.Struct({
  uri: Schema.String,
  filename: Schema.String,
  mime_type: Schema.String,
  size_bytes: Schema.Number,
});
export interface ExportArtifact extends Schema.Schema.Type<typeof ExportArtifact> {}

export interface ExportWriter {
  readonly create: (filename: string, mimeType: string, write: (destination: string, signal: AbortSignal) => Promise<void>) => Effect.Effect<ExportArtifact, ReportError>;
}
export interface ArchiveContents {
  readonly files: readonly { readonly uri: string; readonly filename: string }[];
  readonly manifest: Schema.Json;
}
interface StoredExport { readonly artifact: ExportArtifact; readonly path: string; }

/** Export files live in a private runtime-owned directory, never at caller-supplied read paths. */
export class Exports extends Context.Service<Exports, ExportWriter & {
  readonly archive: (filename: string, collect: (writer: ExportWriter) => Effect.Effect<ArchiveContents, ReportError | UsageError>) => Effect.Effect<{ artifact: ExportArtifact; manifest: Schema.Json }, ReportError | UsageError>;
  readonly list: () => Effect.Effect<ExportArtifact[]>;
  readonly saveAs: (uri: string, destination: string) => Effect.Effect<ExportArtifact, ReportError | UsageError>;
  readonly read: (uri: string) => Effect.Effect<{ uri: string; mimeType: string; blob: string }, ReportError | UsageError>;
}>()('semrush/Exports') {}

const fileError = () => new ReportError({ message: 'Export file operation failed. Check free disk space and directory permissions.' });

/** The same writer serves public exports and private batch staging; only its owner sees the map. */
const createFile = (directory: string, files: Map<string, StoredExport>): ExportWriter['create'] => Effect.fn('Exports.create')(function* (filename, mimeType, write) {
  const id = randomUUID();
  const path = join(directory, id);
  let pending: Promise<number> | undefined;
  const size = yield* Effect.tryPromise({ try: signal => {
    pending = (async () => {
      try {
        await write(path, signal);
        await chmod(path, 0o600);
        return (await stat(path)).size;
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
    })();
    return pending;
  }, catch: fileError }).pipe(Effect.onInterrupt(() => Effect.promise(async () => {
    // AbortSignal stops cooperative writers; wait for file handles to close before scope cleanup.
    await pending?.catch(() => undefined);
  })));
  const artifact = ExportArtifact.make({ uri: `semrush-export://${id}`, filename, mime_type: mimeType, size_bytes: size });
  files.set(artifact.uri, { artifact, path });
  return artifact;
});

export const exportsLive = Layer.effect(Exports, Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.tryPromise({ try: () => mkdtemp(join(tmpdir(), 'semrush-exports-')), catch: fileError }),
    directory => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  );
  const files = new Map<string, StoredExport>();
  const create = createFile(directory, files);

  const find = Effect.fn('Exports.find')(function* (uri: string) {
    const stored = files.get(uri);
    if (!stored) return yield* Effect.fail(new UsageError({ message: 'Unknown export URI. Use an artifact returned by this MCP process.' }));
    return stored;
  });

  return Exports.of({
    create,
    archive: Effect.fn('Exports.archive')(function* (filename, collect) {
      return yield* Effect.scoped(Effect.gen(function* () {
        const staging = yield* Effect.acquireRelease(
          Effect.tryPromise({ try: () => mkdtemp(join(directory, 'batch-')), catch: fileError }),
          path => Effect.promise(() => rm(path, { recursive: true, force: true })),
        );
        const staged = new Map<string, StoredExport>();
        const contents = yield* collect({ create: createFile(staging, staged) });
        const selected = yield* Effect.forEach(contents.files, entry => {
          const stored = staged.get(entry.uri);
          return stored ? Effect.succeed({ ...entry, stored }) : Effect.fail(new UsageError({ message: 'Archive contains an unknown staged export.' }));
        });
        const artifact = yield* create(filename, 'application/zip', async (destination, interruption) => {
          // Output failures must close lazy input streams as well as the ZIP output.
          const cancellation = new AbortController();
          const signal = AbortSignal.any([interruption, cancellation.signal]);
          const zip = new ZipFile();
          zip.on('error', error => zip.outputStream.emit('error', error));
          try {
            zip.addBuffer(Buffer.from(JSON.stringify(contents.manifest, null, 2) + '\n'), 'manifest.json', { compress: false, mode: 0o100600 });
            for (const entry of selected) zip.addReadStreamLazy(entry.filename, { compress: false, size: entry.stored.artifact.size_bytes, mode: 0o100600 }, callback => {
              const input = createReadStream(entry.stored.path, { signal });
              // yazl's lazy-stream API leaves source errors to its caller.
              input.on('error', error => zip.emit('error', error));
              callback(null, input);
            });
            zip.end();
            await pipeline(zip.outputStream, createWriteStream(destination, { mode: 0o600 }), { signal });
          } finally { cancellation.abort(); }
        });
        return { artifact, manifest: contents.manifest };
      }));
    }),
    list: Effect.fn('Exports.list')(() => Effect.sync(() => [...files.values()].map(file => file.artifact))),
    saveAs: Effect.fn('Exports.saveAs')(function* (uri, destination) {
      const stored = yield* find(uri);
      yield* Effect.tryPromise({ try: () => copyFile(stored.path, destination, constants.COPYFILE_EXCL), catch: error =>
        Predicate.isObject(error) && 'code' in error && error.code === 'EEXIST'
          ? new UsageError({ message: 'Output file already exists. Choose a new --output path.' }) : fileError() });
      return stored.artifact;
    }),
    read: Effect.fn('Exports.read')(function* (uri) {
      const question = uri.indexOf('?');
      const base = question < 0 ? uri : uri.slice(0, question);
      const parameters = new URLSearchParams(question < 0 ? '' : uri.slice(question + 1));
      const stored = yield* find(base);
      const offset = parameters.has('offset') ? Number(parameters.get('offset')) : 0;
      const limit = parameters.has('limit') ? Number(parameters.get('limit')) : 65536;
      if ([...parameters.keys()].some(key => !['offset', 'limit'].includes(key)) || !Number.isSafeInteger(offset) || offset < 0 || offset > stored.artifact.size_bytes || !Number.isSafeInteger(limit) || limit < 1 || limit > 1048576) {
        return yield* Effect.fail(new UsageError({ message: 'Export reads require an offset within the file and a limit between 1 and 1048576 bytes.' }));
      }
      const blob = yield* Effect.tryPromise({ try: async () => {
        const file = await open(stored.path, 'r');
        try {
          const bytes = Buffer.alloc(Math.min(limit, stored.artifact.size_bytes - offset));
          const read = await file.read(bytes, 0, bytes.length, offset);
          return bytes.subarray(0, read.bytesRead).toString('base64');
        } finally { await file.close(); }
      }, catch: fileError });
      return { uri, mimeType: stored.artifact.mime_type, blob };
    }),
  });
}));
