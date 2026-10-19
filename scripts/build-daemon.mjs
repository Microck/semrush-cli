import { mkdir, writeFile, access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const exec = promisify(execFile);
// Pinned upstream daemon plus the documented storage-only provider extension.
const revision = 'efe7b742536d6c118c37a269bf626c5927e2a1b9';
const patchPath = resolve('patches/galleton-static-provider.patch');
const patchHash = createHash('sha256').update(await readFile(patchPath)).digest('hex').slice(0,12);
const cache = join(tmpdir(), `semrush-cli-galleton-${revision}-${patchHash}`);
await mkdir(cache, { recursive: true });
const source = join(cache, `galleton-${revision}`);
try { await access(join(cache, 'prepared')); }
catch {
  // Incomplete extraction, patching or tests never become a reusable build cache.
  await rm(cache, { recursive: true, force: true });
  await mkdir(cache, { recursive: true });
  const response = await fetch(`https://codeload.github.com/Microck/galleton/tar.gz/${revision}`, { headers: { 'User-Agent': 'OpenAI File Downloader, XaiImageApiFetch/1.0' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Galleton source download failed: HTTP ${response.status}`);
  const archive = join(cache, 'source.tar.gz');
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  await exec('tar', ['-xzf', archive, '-C', cache]);
  await exec('patch', ['-p1', '-i', patchPath], { cwd: source });
  await exec('gofmt', ['-w', 'internal/core/config.go', 'internal/core/manager.go', 'internal/core/static_test.go'], { cwd: source });
  await exec('go', ['test', './internal/core'], { cwd: source, timeout: 240000 });
  await writeFile(join(cache, 'prepared'), revision + '\n' + patchHash + '\n');
}
await mkdir('dist/daemon', { recursive: true });
const targets = [['linux', 'arm64', 'linux', 'arm64'], ['linux', 'amd64', 'linux', 'x64'], ['darwin', 'arm64', 'darwin', 'arm64'], ['darwin', 'amd64', 'darwin', 'x64'], ['windows', 'amd64', 'win32', 'x64']];
for (const [goos, goarch, platform, arch] of targets) {
  const name = `galleton-${platform}-${arch}${goos === 'windows' ? '.exe' : ''}`;
  const cachedBinary = join(cache, name);
  try { await access(cachedBinary); }
  catch { await exec('go', ['build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w', '-o', cachedBinary, './cmd/galleton'], { cwd: source, env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0' }, timeout: 240000 }); }
  const { copyFile, chmod, rename } = await import('node:fs/promises');
  await copyFile(cachedBinary, join('dist/daemon', name + '.tmp'));
  await rename(join('dist/daemon', name + '.tmp'), join('dist/daemon', name));
  await chmod(join('dist/daemon', name), 0o755);
  console.log(`Bundled Galleton ${platform}/${arch}`);
}
