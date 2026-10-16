import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { ReportError } from '../src/errors.js';
import { Effect, Fiber } from 'effect';
import { expect, test } from 'vitest';
import { Exports, exportsLive } from '../src/exports.js';

const contents = Buffer.from('url,title\nhttps://example.com/,café\n'.repeat(4000));

test('exports preserve bytes across resource chunks, save exclusively and clean up their private store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semrush-export-test-'));
  const destination = join(directory, 'report.csv');
  const existing = join(directory, 'existing.csv');
  await writeFile(existing, 'keep this file');
  let privatePath = '';
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const exports = yield* Exports;
      let failedPath = '';
      yield* exports.create('failed.csv', 'text/csv', async path => {
        failedPath = path;
        await writeFile(path, 'partial download');
        throw new Error('Download interrupted');
      }).pipe(Effect.flip);
      yield* Effect.promise(() => expect(readFile(failedPath)).rejects.toMatchObject({ code: 'ENOENT' }));
      const artifact = yield* exports.create('report.csv', 'text/csv', async path => {
        privatePath = path; await writeFile(path, contents);
      });
      expect(artifact.size_bytes).toBe(contents.length);
      expect(artifact.uri).toMatch(/^semrush-export:\/\/[a-f0-9-]+$/);
      const first = yield* exports.read(artifact.uri);
      expect(Buffer.from(first.blob, 'base64')).toEqual(contents.subarray(0, 65536));
      const rest = yield* exports.read(artifact.uri + '?offset=65536&limit=1048576');
      expect(Buffer.concat([Buffer.from(first.blob, 'base64'), Buffer.from(rest.blob, 'base64')])).toEqual(contents);
      expect((yield* exports.read(artifact.uri + '?offset=' + contents.length)).blob).toBe('');
      yield* exports.saveAs(artifact.uri, destination);
      const refused = yield* exports.saveAs(artifact.uri, existing).pipe(Effect.flip);
      expect(refused.message).toContain('already exists');
      expect(yield* exports.list()).toEqual([artifact]);
      for (const uri of ['file:///etc/passwd', artifact.uri + '?offset=-1', artifact.uri + '?limit=1048577', artifact.uri + '?path=../outside']) {
        expect((yield* exports.read(uri).pipe(Effect.flip))).toHaveProperty('message');
      }
    }).pipe(Effect.provide(exportsLive))));
    expect(await readFile(destination)).toEqual(contents);
    expect(await readFile(existing, 'utf8')).toBe('keep this file');
    if (process.platform !== 'win32') expect((await stat(destination)).mode & 0o777).toBe(0o600);
    await expect(readFile(privatePath)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('archives publish one resource with untouched files and clean up private staging', async () => {
  const paths: string[] = [];
  const manifest = { files: ['pages.csv', 'binary.dat'], omitted: [] };
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const exports = yield* Exports;
    const archive = yield* exports.archive('reports.zip', writer => Effect.gen(function* () {
      const entries = [];
      for (const [filename, bytes] of [['pages.csv', contents], ['binary.dat', Buffer.from([0, 255, 128, 13, 10])]] satisfies [string, Buffer][]) {
        const file = yield* writer.create(filename, 'application/octet-stream', async path => { paths.push(path); await writeFile(path, bytes); });
        entries.push({ uri: file.uri, filename });
        expect(yield* exports.list()).toEqual([]);
      }
      return { files: entries, manifest };
    }));
    expect(archive.manifest).toEqual(manifest);
    expect(archive.artifact.mime_type).toBe('application/zip');
    expect(yield* exports.list()).toEqual([archive.artifact]);
    const bytes = Buffer.from((yield* exports.read(archive.artifact.uri + '?limit=1048576')).blob, 'base64');
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['binary.dat', 'manifest.json', 'pages.csv']);
    expect(Buffer.from(entries['pages.csv'] ?? [])).toEqual(contents);
    expect(Buffer.from(entries['binary.dat'] ?? [])).toEqual(Buffer.from([0, 255, 128, 13, 10]));
    expect(JSON.parse(Buffer.from(entries['manifest.json'] ?? []).toString('utf8'))).toEqual(manifest);
    for (const path of paths) yield* Effect.promise(() => expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' }));
  }).pipe(Effect.provide(exportsLive))));
});

test('failed collection or an unreadable staged file publishes no archive', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const exports = yield* Exports;
    let path = '';
    const collectFailure = yield* exports.archive('failed.zip', writer => Effect.gen(function* () {
      yield* writer.create('partial.csv', 'text/csv', async destination => { path = destination; await writeFile(destination, contents); });
      return yield* Effect.fail(new ReportError({ message: 'Provider download failed' }));
    })).pipe(Effect.flip);
    expect(collectFailure.message).toBe('Provider download failed');
    yield* Effect.promise(() => expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' }));
    yield* exports.archive('unreadable.zip', writer => Effect.gen(function* () {
      const file = yield* writer.create('gone.csv', 'text/csv', async destination => { path = destination; await writeFile(destination, contents); });
      yield* Effect.promise(() => rm(path));
      return { files: [{ uri: file.uri, filename: 'gone.csv' }], manifest: {} };
    })).pipe(Effect.flip);
    expect(yield* exports.list()).toEqual([]);
    yield* Effect.promise(() => expect(stat(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' }));
  }).pipe(Effect.provide(exportsLive))));
});

test('archive cancellation aborts its active writer before removing staging', async () => {
  let started = () => {};
  const ready = new Promise<void>(resolve => { started = resolve; });
  const paths: string[] = [];
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const exports = yield* Exports;
    const fiber = yield* Effect.forkChild(exports.archive('cancelled.zip', writer => Effect.gen(function* () {
      yield* writer.create('first.csv', 'text/csv', async path => { paths.push(path); await writeFile(path, contents); });
      yield* writer.create('pending.csv', 'text/csv', async (path, signal) => {
        paths.push(path); await writeFile(path, 'partial'); started();
        await new Promise<void>((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('Writer aborted')), { once: true }); });
      });
      return { files: [], manifest: {} };
    })));
    yield* Effect.promise(() => ready).pipe(Effect.timeout('5 seconds'));
    yield* Fiber.interrupt(fiber).pipe(Effect.timeout('5 seconds'));
    expect(yield* exports.list()).toEqual([]);
    for (const path of paths) yield* Effect.promise(() => expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' }));
    const path = paths[0];
    if (!path) throw new Error('Expected a staged file');
    yield* Effect.promise(() => expect(stat(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' }));
  }).pipe(Effect.provide(exportsLive))));
});
