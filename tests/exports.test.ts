import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
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
