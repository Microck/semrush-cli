import { createServer } from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ConfigProvider, Effect, Layer, Predicate } from 'effect';
import { Galleton } from '../src/vendor/galleton.js';
import { makeSessionsLayer } from '../src/session-layer.js';
import { makeSemrushLayer } from '../src/browser-layer.js';
import { Semrush } from '../src/browser-service.js';
import { parseReport } from '../src/validation.js';

const exec = promisify(execFile);
const binary = resolve(`dist/daemon/galleton-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`);
let directory: string;
let child: ChildProcess;
let daemonExited: Promise<void>;
let sdk: Galleton;
let daemonURL: string;
let fixtureURL: string;
let authenticated = true;
let failReport = false;
const observed: string[] = [];
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', fixtureURL);
  if (url.pathname === '/robots.txt') { response.end('User-agent: *\nDisallow: /'); return; }
  if (url.pathname === '/analytics/overview/') {
    response.end('<script>window.sm2.user={"api_key":"fixture-secret","id":123}</script>'); return;
  }
  if (url.pathname === '/home/') {
    if (!authenticated || !request.headers.cookie?.includes('session=authorized')) { response.writeHead(302, { Location: '/login/' }); }
    response.end(); return;
  }
  if (url.pathname === '/kwogw/v2/webapi') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const rpc = JSON.parse(body);
    observed.push(rpc.method);
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Set-Cookie', 'rotated=yes; Path=/; HttpOnly');
    if (failReport) { response.end('{"error":{"message":"fixture-secret access denied"}}'); return; }
    response.end(rpc.method === 'keywords.GetInfo' ? '{"result":{"keywords":[{"database":"us","volume":100,"id":9223372036854775807,"apiKey":"fixture-secret"}]}}' : '{"result":{"allowed":true}}'); return;
  }
  response.end('login');
});

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'semrush-cli-integration-'));
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address();
  if (!address || Predicate.isString(address)) throw new Error('No fixture address');
  fixtureURL = `http://127.0.0.1:${address.port}`;
  // Reserve an unused loopback port without touching the user's daemon.
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const daemonAddress = reservation.address();
  if (!daemonAddress || Predicate.isString(daemonAddress)) throw new Error('No daemon address');
  daemonURL = `http://127.0.0.1:${daemonAddress.port}`;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  await exec(binary, ['init', '--dir', directory]);
  await writeFile(join(directory, 'adapters.json'), JSON.stringify({ providers: [{ name: 'semrush', kind: 'static', origins: [fixtureURL], allow_http_loopback: true }] }));
  child = spawn(binary, ['serve', '--dir', directory, '--listen', `127.0.0.1:${daemonAddress.port}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  daemonExited = new Promise(resolve => child.once('exit', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Fixture daemon exited early')));
    child.stderr?.once('data', () => resolve());
  });
  sdk = new Galleton({ token: await readFile(join(directory, 'api.token'), 'utf8'), baseURL: daemonURL });
  await sdk.connect('test', { provider: 'semrush', cookie_origin: fixtureURL, cookie_header: 'session=authorized' });
}, 30000);

afterAll(async () => {
  try { if (child) { child.kill('SIGTERM'); await daemonExited; } }
  finally {
    await new Promise<void>((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

function fixtureLayer() {
  const config = ConfigProvider.layer(ConfigProvider.fromUnknown({ SEMRUSH_GALLETON_URL: daemonURL, SEMRUSH_GALLETON_TOKEN_FILE: join(directory, 'api.token'), SEMRUSH_SESSION: 'test' }));
  return makeSemrushLayer(fixtureURL).pipe(Layer.provide(makeSessionsLayer(fixtureURL)), Layer.provide(config));
}

test('real Chromium restores Galleton cookies, fetches reports, redacts and captures rotation', async () => {
  const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    return yield* (yield* Semrush).report(yield* parseReport('keyword_overview', { keyword: 'fixture' }));
  }).pipe(Effect.provide(fixtureLayer()))));
  expect(result).toEqual({ authenticated: true, report: 'keyword_overview', data: { database: 'us', volume: 100, id: '9223372036854775807' } });
  expect(observed).toContain('keywords.GetInfo');
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('rotated=yes');
}, 30000);

test('expired session fails before making a report request', async () => {
  authenticated = false;
  const count = observed.length;
  try {
    await expect(Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      return yield* (yield* Semrush).report(yield* parseReport('account_status', {}));
    }).pipe(Effect.provide(fixtureLayer()))))).rejects.toThrow('session expired');
    expect(observed).toHaveLength(count);
  } finally { authenticated = true; }
}, 30000);

test('provider failure remains an error and removes echoed secrets', async () => {
  failReport = true;
  try {
    await expect(Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      return yield* (yield* Semrush).report(yield* parseReport('account_status', {}));
    }).pipe(Effect.provide(fixtureLayer()))))).rejects.toThrow('[redacted] access denied');
  } finally { failReport = false; }
}, 30000);
