import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ConfigProvider, Effect, Layer, Predicate, type Schema } from 'effect';
import { Galleton } from 'galleton';
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
let auditConfigured = false;
let auditStarted = false;
let auditProtected = false;
const observed: string[] = [];
let keywordList: { BasketID: number; Owner: { ID: number }; Name: string } | undefined;
let listKeywords: { Phrase: string; Database: string; Tags: string[] }[] = [];
let deletedKeywords: typeof listKeywords = [];
const folderPath = '/apis/v4-raw/folders/api/v0/folders';
let savedProject: { id: string; name: string; domain?: string; tags?: { name: string }[] } | undefined;
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
  if (url.pathname.startsWith(folderPath)) {
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    const payload = encoded ? JSON.parse(encoded) : undefined;
    observed.push(`${request.method} ${url.pathname}`);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === folderPath && request.method === 'POST') {
      expect(payload).toEqual({ properties: [{ name: { value: 'Fixture project' } }, { domain: { value: 'example.com' } }] });
      savedProject = { id: '9223372036854775807', name: payload.properties[0].name.value, domain: payload.properties[1].domain.value };
      response.writeHead(201); response.end(JSON.stringify({ folder: { id: savedProject.id, properties: { name: savedProject.name, domain: savedProject.domain } } })); return;
    }
    if (url.pathname === folderPath + '/folder') {
      expect(url.searchParams.get('folder_id')).toBe('9223372036854775807');
      response.end(JSON.stringify({ folder: savedProject })); return;
    }
    if (request.method === 'PUT') {
      expect(payload).toEqual({ properties: [{ name: { value: 'Renamed fixture' } }] });
      if (savedProject) savedProject.name = payload.properties[0].name.value;
      response.end(JSON.stringify({ folder: savedProject })); return;
    }
    if (url.pathname.includes('/tags/')) {
      expect(payload).toEqual({ tags: [{ name: 'fixture' }] });
      if (savedProject) savedProject.tags = payload.tags;
      response.end(JSON.stringify({ tags: savedProject?.tags })); return;
    }
    if (request.method === 'DELETE') {
      expect(encoded).toBe(''); savedProject = undefined;
      response.writeHead(204); response.end(); return;
    }
    response.writeHead(404); response.end('{}'); return;
  }
  if (url.pathname === '/siteaudit/api/campaigns/seolist') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(auditConfigured ? [{ id: 789 }] : [])); return; }
  if (url.pathname.startsWith('/siteaudit/api/')) { await serveAuditFixture(request, response, url); return; }
  if (url.pathname === '/kwm/rpc') {
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    const rpc = JSON.parse(encoded);
    const params = rpc.params;
    observed.push(rpc.method);
    response.setHeader('Content-Type', 'application/json');
    expect(request.headers['api-key']).toBe('fixture-secret');
    expect(request.headers['user-id']).toBe('123');
    expect(params.APIKey).toBe('fixture-secret');
    expect(params.UserID).toBe(123);
    expect(params).not.toHaveProperty('confirm');
    expect(params).not.toHaveProperty('dry_run');
    let reply: Schema.Json = null;
    switch (rpc.method) {
      case 'baskets.BasketCreate':
        expect(params.Name).toBe('Fixture keyword list');
        expect(params.Clusterization).toBeNull();
        keywordList = { BasketID: 456, Owner: { ID: 123 }, Name: params.Name };
        reply = { BasketID: 456, Name: params.Name }; break;
      case 'baskets.BasketsGetAll':
        reply = { Summary: { MyOwn: keywordList ? 1 : 0 }, Lists: keywordList ? [keywordList] : [] }; break;
      case 'baskets.BasketsGetByShareID':
        expect(params.BasketID).toBe(456); expect(params.OwnerID).toBe(123); reply = keywordList ?? null; break;
      case 'baskets.BasketRename':
        if (keywordList) keywordList.Name = params.Name; break;
      case 'baskets.KeywordsImport':
        listKeywords.push(...params.Keywords); reply = { added_keywords_count: params.Keywords.length }; break;
      case 'baskets.KeywordsGetByFilter':
        expect(params.Filter.Phrase).toEqual([]); expect(params.Page.Number).toBe(1);
        reply = { Keywords: listKeywords }; break;
      case 'baskets.KeywordsAddTags':
        for (const keyword of listKeywords) if (params.KeywordIDs.some((id: { Phrase: string }) => id.Phrase === keyword.Phrase)) keyword.Tags.push(...params.Tags);
        reply = listKeywords; break;
      case 'baskets.KeywordsDeleteByIDs':
        deletedKeywords = listKeywords.filter(keyword => params.KeywordIDs.some((id: { Phrase: string }) => id.Phrase === keyword.Phrase));
        listKeywords = listKeywords.filter(keyword => !deletedKeywords.includes(keyword));
        reply = { UndoID: 'fixture-undo', DeletedKeywordIDs: params.KeywordIDs }; break;
      case 'baskets.KeywordsDeleteUndo':
        expect(params.UndoID).toBe('fixture-undo'); listKeywords.push(...deletedKeywords); deletedKeywords = [];
        reply = listKeywords; break;
      case 'baskets.BasketDelete':
        expect(params.BasketIDs).toEqual([456]); keywordList = undefined; listKeywords = []; break;
      default: response.end(JSON.stringify({ error: { code: -32601, message: 'Unsupported fixture method' } })); return;
    }
    response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: reply })); return;
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


test('real browser and Galleton complete the stateful project lifecycle with exact IDs', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const created = yield* semrush.report(yield* parseReport('project_create', { name: 'Fixture project', domain: 'example.com', confirm: true }));
    expect(created.data).toEqual({ folder: { id: '9223372036854775807', properties: { name: 'Fixture project', domain: 'example.com' } } });
    const beforeUpdate = observed.filter(entry => entry.startsWith('PUT ')).length;
    const refused = yield* semrush.report(yield* parseReport('project_update', { folder_id: '9223372036854775807', domain: 'other.example.com', confirm: true })).pipe(Effect.flip);
    expect(refused.message).toContain('already has a website');
    expect(observed.filter(entry => entry.startsWith('PUT '))).toHaveLength(beforeUpdate);
    yield* semrush.report(yield* parseReport('project_update', { folder_id: '9223372036854775807', name: 'Renamed fixture', confirm: true }));
    yield* semrush.report(yield* parseReport('project_set_tags', { folder_id: '9223372036854775807', tags: ['fixture'], confirm: true }));
    const current = yield* semrush.report(yield* parseReport('project_get', { folder_id: '9223372036854775807' }));
    expect(current.data).toEqual({ folder: { id: '9223372036854775807', name: 'Renamed fixture', domain: 'example.com', tags: [{ name: 'fixture' }] } });
    expect((yield* semrush.report(yield* parseReport('project_delete', { folder_id: '9223372036854775807', confirm: true }))).data).toBeNull();
    expect(savedProject).toBeUndefined();
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('real browser and Galleton manage keyword lists, import, tags, deletion and undo', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const target = { basket_id: 456, owner_id: 123 };
    const created = yield* semrush.report(yield* parseReport('keyword_list_create', { name: 'Fixture keyword list', confirm: true }));
    expect(created.data).toEqual({ BasketID: 456, Name: 'Fixture keyword list' });
    yield* semrush.report(yield* parseReport('keyword_list_rename', { ...target, name: 'Renamed list', confirm: true }));
    expect((yield* semrush.report(yield* parseReport('keyword_list_get', target))).data).toMatchObject({ Name: 'Renamed list' });
    yield* semrush.report(yield* parseReport('keyword_list_import', { ...target, keywords: ['fixture keyword'], tags: [], confirm: true }));
    yield* semrush.report(yield* parseReport('keyword_list_add_tags', { ...target, keywords: ['fixture keyword'], tags: ['fixture'], confirm: true }));
    expect((yield* semrush.report(yield* parseReport('keyword_list_keywords', target))).data).toEqual({ Keywords: [{ Phrase: 'fixture keyword', Database: 'us', Tags: ['fixture'] }] });
    const deleted = yield* semrush.report(yield* parseReport('keyword_list_delete_keywords', { ...target, keywords: ['fixture keyword'], confirm: true }));
    expect(deleted.data).toMatchObject({ UndoID: 'fixture-undo' }); expect(listKeywords).toHaveLength(0);
    yield* semrush.report(yield* parseReport('keyword_list_undo_delete', { undo_id: 'fixture-undo', confirm: true }));
    expect(listKeywords).toHaveLength(1);
    yield* semrush.report(yield* parseReport('keyword_list_delete', { basket_id: 456, confirm: true }));
    expect(keywordList).toBeUndefined(); expect(listKeywords).toHaveLength(0);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Site Audit settings save without launching; business status and authenticated GET query survive', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const settings = { campaign_id: 789, name: 'Fixture audit', domain: 'example.com', page_limit: 10, confirm: true };
    const savesBefore = observed.filter(entry => entry.endsWith('/save')).length;
    auditProtected = true;
    const protectedFailure = yield* semrush.report(yield* parseReport('audit_configure', settings)).pipe(Effect.flip);
    expect(protectedFailure.message).toContain('protected-site authentication');
    auditProtected = false;
    const domainFailure = yield* semrush.report(yield* parseReport('audit_configure', { ...settings, domain: 'other.example.com' })).pipe(Effect.flip);
    expect(domainFailure.message).toContain('must match');
    expect(observed.filter(entry => entry.endsWith('/save'))).toHaveLength(savesBefore);
    const configured = yield* semrush.report(yield* parseReport('audit_create', { campaign_id: 789, name: 'Fixture audit', domain: 'example.com', page_limit: 10, confirm: true }));
    expect(configured.data).toMatchObject({ status: 'FINISHED' });
    expect(auditStarted).toBe(false);
    const duplicate = yield* semrush.report(yield* parseReport('audit_create', settings)).pipe(Effect.flip);
    expect(duplicate.message).toContain('already has a Site Audit');
    yield* semrush.report(yield* parseReport('audit_configure', settings));
    yield* semrush.report(yield* parseReport('audit_snapshot', { campaign_id: 789, snapshot_id: '12' }));
    const started = yield* semrush.report(yield* parseReport('audit_start', { campaign_id: 789, confirm: true }));
    expect(started.data).toMatchObject({ status: 'RUNNING' });
    expect(auditStarted).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

async function serveAuditFixture(request: IncomingMessage, response: ServerResponse, url: URL) {
    expect(url.searchParams.get('key')).toBe('fixture-secret');
    observed.push(`${request.method} ${url.pathname}`);
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/save')) {
      const settings = JSON.parse(encoded);
      expect(settings.pageLimit).toBe(10); expect(settings.scheduleDay).toBe(0); expect(settings.notify).toBe(false);
      expect(settings.authEnabled).toBe(false); expect(settings).not.toHaveProperty('confirm');
      auditConfigured = true;
    } else if (url.pathname.endsWith('/launch')) {
      expect(auditConfigured).toBe(true); expect(encoded).toBe(''); auditStarted = true;
    } else if (url.pathname.endsWith('/snapshot')) {
      expect(url.searchParams.get('snapshot_id')).toBe('12');
    }
    response.end(JSON.stringify({ id: 789, status: auditStarted ? 'RUNNING' : 'FINISHED', projectDomain: 'example.com', authEnabled: auditProtected, gaSettings: {}, webBotAuthEnabled: false })); return;
}
