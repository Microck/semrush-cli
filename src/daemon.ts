import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chmod, mkdir, open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Effect } from 'effect';
import { defaultStateDirectory, origin } from './session-layer.js';
import { SessionError } from './errors.js';

const exec = promisify(execFile);
const daemonPath = () => fileURLToPath(new URL(`./daemon/galleton-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url));
const failed = () => new SessionError({ message: 'Local daemon setup failed. Check semrush daemon start and the private daemon.log in the state directory.' });
const io = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failed });

/** Own daemon, state directory and port. Never edits a shared Galleton installation. */
export const initializeDaemon = Effect.fn('Daemon.initialize')(function* () {
  yield* io(() => mkdir(defaultStateDirectory, { recursive: true, mode: 0o700 }));
  yield* io(() => chmod(defaultStateDirectory, 0o700));
  yield* io(() => exec(daemonPath(), ['init', '--dir', defaultStateDirectory]));
  const adapter = { providers: [{ name: 'semrush', kind: 'static', origins: [origin] }] };
  yield* io(() => writeFile(join(defaultStateDirectory, 'adapters.json'), JSON.stringify(adapter, null, 2) + '\n', { mode: 0o600 }));
});

export const startDaemon = Effect.fn('Daemon.start')(function* () {
  // A successful authenticated list proves this is the existing owned daemon.
  const listed = yield* io(() => exec(daemonPath(), ['list', '--dir', defaultStateDirectory, '--api', 'http://127.0.0.1:8768'])).pipe(Effect.match({ onSuccess: () => true, onFailure: () => false }));
  if (listed) return { running: true, url: 'http://127.0.0.1:8768' };
  yield* io(async () => {
    const log = await open(join(defaultStateDirectory, 'daemon.log'), 'a', 0o600);
    try {
      const child = spawn(daemonPath(), ['serve', '--dir', defaultStateDirectory, '--listen', '127.0.0.1:8768'], { detached: true, stdio: ['ignore', log.fd, log.fd] });
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
    } finally { await log.close(); }
  });
  // Bounded startup readiness, without launching duplicate daemons on failure.
  yield* io(async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await exec(daemonPath(), ['list', '--dir', defaultStateDirectory, '--api', 'http://127.0.0.1:8768']); return; }
      catch { await delay(100); }
    }
    throw new Error('Daemon did not become ready');
  });
  return { running: true, url: 'http://127.0.0.1:8768' };
});

export const stopDaemon = Effect.fn('Daemon.stop')(function* () {
  yield* io(() => exec(daemonPath(), ['shutdown', '--dir', defaultStateDirectory, '--api', 'http://127.0.0.1:8768']));
  return { stopping: true };
});

export const installBrowser = Effect.fn('Browser.install')(() => io(async () => {
  const cli = fileURLToPath(new URL('./cli.js', import.meta.resolve('patchright')));
  await exec(process.execPath, [cli, 'install', 'chromium'], { timeout: 180000, maxBuffer: 1024 * 1024 });
  return { installed: true };
}));
