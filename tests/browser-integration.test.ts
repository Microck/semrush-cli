import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ConfigProvider, Effect, Fiber, Layer, Predicate, Schema } from 'effect';
import { Galleton } from 'galleton';
import { makeSessionsLayer } from '../src/session-layer.js';
import { makeSemrushLayer } from '../src/browser-layer.js';
import { Semrush } from '../src/browser-service.js';
import { Exports, exportsLive } from '../src/exports.js';
import { parseReport } from '../src/validation.js';
import type { Query } from '../src/report-parameters.js';
import { makeTrackingAlertsFixture } from './tracking-alerts-fixture.js';
import { makeTransferFixture } from './basket-transfer-fixture.js';
import { makeSeedFixture } from './seed-strategy-fixture.js';
import { makeDomainFixture } from './domain-strategy-fixture.js';
import { makeSavedFixture, savedPath } from './saved-keywords-fixture.js';

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
let delayedExportStarted = () => {};
let delayedExportClosed = () => {};
const observed: string[] = [];
let keywordList: { BasketID: number; Owner: { ID: number }; Name: string } | undefined;
let listKeywords: { Phrase: string; Database: string; Tags: string[] }[] = [];
let deletedKeywords: typeof listKeywords = [];
const folderPath = '/apis/v4-raw/folders/api/v0/folders';
let savedProject: { id: string; name: string; domain?: string; tags?: { name: string }[] } | undefined;
const serveSavedFixture = makeSavedFixture();
const serveDomainFixture = makeDomainFixture();
const serveSeedFixture = makeSeedFixture();
const serveTransferFixture = makeTransferFixture();
const serveTrackingAlertsFixture = makeTrackingAlertsFixture();
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
  if (url.pathname.startsWith(folderPath)) { await serveProjectFixture(request, response, url); return; }
  if (url.pathname.startsWith(savedPath)) { await serveSavedFixture(request, response, url); return; }
  if (url.pathname === '/siteaudit/api/campaigns/seolist') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(auditConfigured ? [{ id: 789 }] : [])); return; }
  if (url.pathname.startsWith('/siteaudit/export/')) {
    expect(url.searchParams.get('key')).toBe('fixture-secret');
    expect(url.searchParams.get('export')).toBe('csv');
    if (url.searchParams.get('snapshotId') === 'delayed_snapshot' || url.pathname.includes('delayed_snapshot')) {
      response.once('close', () => delayedExportClosed());
      delayedExportStarted(); return;
    }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename=fixture.csv');
    response.end('url,title\nhttps://example.com/,café\n'); return;
  }
  if (url.pathname === '/tracking/alerts/') { await serveTrackingAlertsFixture(request, response); return; }
  if (['/tracking/web-api/', '/tracking/hashes', '/positions/api/'].some(prefix => url.pathname.startsWith(prefix))) { await serveTrackingFixture(request, response, url); return; }
  if (url.pathname.startsWith('/siteaudit/api/') || url.pathname === '/siteaudit/private/polling') { await serveAuditFixture(request, response, url); return; }
  if (url.pathname.startsWith('/ksb/')) { await serveDomainFixture(request, response, url); return; }
  if (url.pathname === '/kwm/download-export-v2') { await serveSeedFixture(request, response, url); return; }
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
    if (serveTransferFixture(rpc, response)) return;
    if (await serveSeedFixture(request, response, url, rpc)) return;
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
  return makeSemrushLayer(fixtureURL).pipe(Layer.provide(makeSessionsLayer(fixtureURL)), Layer.provideMerge(exportsLive), Layer.provide(config));
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
    if (request.method === 'POST') expect(request.headers['content-type']).toBe('application/json');
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/siteaudit/private/polling') {
      expect(url.searchParams.get('campaignIds')).toBe('789');
      response.end(JSON.stringify([{ id: 789, status: auditStarted ? 'RUNNING' : 'FINISHED', is_allowed_stopping: auditStarted, run_pages_crawled: auditStarted ? 3 : 0 }])); return;
    }
    if (url.pathname.includes('/pageData/')) {
      expect(request.method).toBe('GET');
      response.end(JSON.stringify({ id: url.pathname.split('/').at(-1), status: 'FINISHED', issues: [] })); return;
    }
    if (url.pathname.endsWith('/save')) {
      const settings = JSON.parse(encoded);
      expect(settings.pageLimit).toBe(10); expect(settings.scheduleDay).toBe(0); expect(settings.notify).toBe(false);
      expect(settings.authEnabled).toBe(false); expect(settings).not.toHaveProperty('confirm');
      auditConfigured = true;
    } else if (url.pathname.endsWith('/launch')) {
      expect(auditConfigured).toBe(true); expect(encoded).toBe(''); auditStarted = true;
    } else if (url.pathname.endsWith('/abort') || url.pathname.endsWith('/stop')) {
      expect(request.method).toBe('POST'); expect(encoded).toBe(''); auditStarted = false;
      response.removeHeader('Content-Type'); response.end(); return;
    } else if (url.pathname.endsWith('/snapshot')) {
      expect(url.searchParams.get('snapshot_id')).toBe('12');
    }
    response.end(JSON.stringify({ id: 789, status: auditStarted ? 'RUNNING' : 'FINISHED', projectDomain: 'example.com', authEnabled: auditProtected, gaSettings: {}, webBotAuthEnabled: false })); return;
}

// The real HTTP fixture exercises cookie-only writes, legacy key queries and array payloads.
test('Position Tracking restores auth and completes incremental target updates', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const created = yield* service.report(yield* parseReport('position_create', { project_id: 789, domain: 'example.com', keywords: ['fixture'], location_id: 2840, confirm: true }));
    expect(created.data).toMatchObject({ status: 'ok', data: { campaign_ids: ['789_42'] } });
    const campaign = { campaign_id: '789_42' };
    yield* service.report(yield* parseReport('position_keywords_add', { ...campaign, keywords: ['second'], tags: ['initial'], confirm: true }));
    yield* service.report(yield* parseReport('position_keyword_tags', { ...campaign, keywords: ['second'], add_tags: ['checked'], remove_tags: ['initial'], confirm: true }));
    expect(trackingKeywords).toEqual([{ keyword: 'fixture', tags: [] }, { keyword: 'second', tags: ['checked'] }]);
    yield* service.report(yield* parseReport('position_competitors_set', { ...campaign, competitors: ['example.org'], confirm: true }));
    expect(trackingCompetitors).toEqual([{ domain: 'example.org', url: 'example.org' }]);
    yield* service.report(yield* parseReport('position_keywords_delete', { ...campaign, keywords: ['second'], confirm: true }));
    expect(trackingKeywords).toEqual([{ keyword: 'fixture', tags: [] }]);
    const limits = yield* service.report(yield* parseReport('position_limits', { project_id: 789 }));
    expect(limits.data).toMatchObject({ status: 'ok', data: { limits: { keywords: 1500 } } });
    const page = yield* service.report(yield* parseReport('audit_page', { campaign_id: 789, page_id: 'opaque_42' }));
    expect(page.data).toMatchObject({ id: 'opaque_42', status: 'FINISHED' });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

let trackingKeywords: { keyword: string; tags: string[] }[] = [];
let trackingCompetitors: { domain: string; url: string }[] = [];
let trackingEditable = true;
let trackingMalformedHashes = false;
let trackingHashReads = 0;
let trackingSettingWrites = 0;
let trackingSettingsState = { tracking_url: 'example.com', tracking_url_type: 'rootdomain', business_name: 'original business', brands: ['original brand'] };
let trackingVolume = 'national';
async function serveTrackingFixture(request: IncomingMessage, response: ServerResponse, url: URL) {
  expect(request.headers.cookie).toContain('session=authorized');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname.endsWith('/info')) {
    expect(request.method).toBe('GET'); expect(url.searchParams.get('api_key')).toBe('fixture-secret');
    response.end(JSON.stringify({ status: 'ok', data: { can_edit: trackingEditable,
      campaign_settings: trackingSettingsState, filters: { volume_type: trackingVolume }, hashes: { private: 'fixture-edit-secret' } } })); return;
  }
  if (url.pathname === '/tracking/hashes') {
    expect(request.method).toBe('GET'); expect(url.searchParams.get('id')).toBe('789_42'); trackingHashReads++;
    response.end(JSON.stringify(trackingMalformedHashes ? {} : { info: { campaign_edit: { hash: 'fixture-edit-secret', random: 0.314 } } })); return;
  }
  if (url.pathname.endsWith('/owner_limits')) {
    expect(request.method).toBe('GET');
    expect(url.searchParams.get('api_key')).toBe('fixture-secret');
    response.end(JSON.stringify({ status: 'ok', data: { limits: { keywords: 1500 } } })); return;
  }
  expect(request.method).toBe('POST');
  expect(url.searchParams.has('api_key')).toBe(false);
  let encoded = '';
  for await (const chunk of request) encoded += chunk;
  const payload = JSON.parse(encoded);
  expect(payload).not.toHaveProperty('confirm');
  expect(payload).not.toHaveProperty('dry_run');
  if (url.pathname.endsWith('/campaign_edit_domain_settings')) {
    expect(url.searchParams.get('key')).toBe('fixture-secret');
    expect(payload).toMatchObject({ key: 'fixture-secret', campaignId: '789_42', display_hash: 'fixture-edit-secret', rnd: 0.314 });
    expect(Object.keys(payload).sort()).toEqual(['key', 'campaignId', 'display_hash', 'rnd', 'domain', 'type', 'businessName', 'brands', 'volume_type'].sort());
    trackingSettingsState = { tracking_url: payload.domain, tracking_url_type: payload.type, business_name: payload.businessName, brands: payload.brands };
    trackingVolume = payload.volume_type; trackingSettingWrites++;
    response.end(JSON.stringify({ status: 'ok', data: { display_hash: 'fixture-edit-secret', rnd: 0.314 } })); return;
  }
  if (url.pathname.endsWith('/create_targets')) {
    expect(payload.targeting[0]).toMatchObject({ weekly_notification: false, location: { location_id: 2840 } });
    trackingKeywords = payload.keywords;
    response.end(JSON.stringify({ status: 'ok', data: { campaign_ids: ['789_42'] } })); return;
  }
  if (url.pathname.endsWith('/campaign_set_competitors')) {
    expect(Array.isArray(payload)).toBe(true); trackingCompetitors = payload;
  } else if (url.pathname.endsWith('/update_keywords_state')) {
    if (payload.create) trackingKeywords.push(...payload.create);
    if (payload.delete) trackingKeywords = trackingKeywords.filter(keyword => !payload.delete.includes(keyword.keyword));
    for (const update of payload['update-attributes'] ?? []) {
      const keyword = trackingKeywords.find(keyword => keyword.keyword === update.keyword);
      if (keyword) keyword.tags = [...keyword.tags.filter(tag => !update.tags.delete.includes(tag)), ...update.tags.create];
    }
  } else { response.writeHead(404); response.end('{}'); return; }
  response.end(JSON.stringify({ status: 'ok', data: {} }));
}

async function serveProjectFixture(request: IncomingMessage, response: ServerResponse, url: URL) {
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

test('bodyless crawl controls keep JSON headers and preserve the explicit stop sequence', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const target = { campaign_id: 789, confirm: true };
    expect((yield* service.report(yield* parseReport('audit_start', target))).data).toMatchObject({ status: 'RUNNING' });
    expect((yield* service.report(yield* parseReport('audit_abort', target))).data).toBeNull();
    expect((yield* service.report(yield* parseReport('audit_status', { campaign_id: 789 }))).data).toMatchObject({ status: 'FINISHED' });
    yield* service.report(yield* parseReport('audit_start', target));
    expect((yield* service.report(yield* parseReport('audit_finalize', target))).data).toBeNull();
    expect((yield* service.report(yield* parseReport('audit_status', { campaign_id: 789 }))).data).toMatchObject({ status: 'FINISHED' });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('real Chromium streams a provider attachment into an MCP-readable export', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const report = yield* (yield* Semrush).report(yield* parseReport('audit_export_pages', { snapshot_id: 'opaque_snapshot' }));
    expect(report.data).toBeNull();
    if (!report.artifact) throw new Error('Expected an export artifact');
    expect(report.artifact).toMatchObject({ filename: 'fixture.csv', mime_type: 'text/csv' });
    const chunk = yield* (yield* Exports).read(report.artifact.uri);
    expect(Buffer.from(chunk.blob, 'base64').toString('utf8')).toBe('url,title\nhttps://example.com/,café\n');
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Saved Keywords preserves selected IDs through copy, move, delete, undo and JSON POST exports', async () => {
  const id = Schema.decodeUnknownSync(Schema.Struct({ list_id: Schema.String }));
  const rows = Schema.decodeUnknownSync(Schema.Struct({ keywords: Schema.Array(Schema.Struct({
    id: Schema.String, phrase: Schema.String, tags: Schema.Array(Schema.String), labels: Schema.Array(Schema.Number),
  })) }));
  const undo = Schema.decodeUnknownSync(Schema.Struct({ undo_id: Schema.String }));
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, input: Query) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, input)); });
    const a = id((yield* call('saved_keyword_list_create', { name: 'Fixture saved list', confirm: true })).data).list_id;
    const b = id((yield* call('saved_keyword_list_create', { name: 'Fixture destination', confirm: true })).data).list_id;
    yield* call('saved_keywords_import', { list_id: a, keywords: ['seo', 'email marketing'], tags: ['initial'], confirm: true });
    const original = rows((yield* call('saved_keywords', { list_id: a })).data).keywords;
    expect(original.map(keyword => keyword.id)).toEqual(['9223372036854775807', '9223372036854775808']);
    const seo = original[0]?.id ?? ''; const email = original[1]?.id ?? '';
    const selection = { list_id: a, keyword_ids: [seo], confirm: true };
    yield* call('saved_keywords_add_tags', { ...selection, tags: ['checked'] });
    yield* call('saved_keywords_remove_tags', { ...selection, tags: ['initial'] });
    yield* call('saved_keywords_label', { ...selection, labels: ['brief_generated'] });
    const tagged = rows((yield* call('saved_keywords', { list_id: a })).data).keywords;
    expect(tagged[0]).toMatchObject({ tags: ['checked'], labels: [3] });
    expect(tagged[1]).toMatchObject({ tags: ['initial'], labels: [] });
    yield* call('saved_keywords_copy', { ...selection, target_list_id: b });
    yield* call('saved_keywords_move', { list_id: a, keyword_ids: [email], target_list_id: b, confirm: true });
    expect(rows((yield* call('saved_keywords', { list_id: a })).data).keywords).toHaveLength(1);
    expect(rows((yield* call('saved_keywords', { list_id: b })).data).keywords).toHaveLength(2);
    const removed = undo((yield* call('saved_keywords_delete', { list_id: b, keyword_ids: [seo], confirm: true })).data);
    expect(rows((yield* call('saved_keywords', { list_id: b })).data).keywords).toHaveLength(1);
    yield* call('saved_keywords_undo_delete', { undo_id: removed.undo_id, confirm: true });
    expect(rows((yield* call('saved_keywords', { list_id: b })).data).keywords).toHaveLength(2);
    const denied = yield* call('saved_keywords_export', { list_id: a, filter: 'forbidden' }).pipe(Effect.flip);
    expect(denied.message).toContain('HTTP 403');
    expect(yield* (yield* Exports).list()).toEqual([]);
    const exported = yield* call('saved_keywords_export', { list_id: a });
    if (!exported.artifact) throw new Error('Expected POST download artifact');
    const bytes = yield* (yield* Exports).read(exported.artifact.uri);
    expect(Buffer.from(bytes.blob, 'base64').toString('utf8')).toBe('phrase,volume\nseo,100\n');
    const deleted = undo((yield* call('saved_keyword_list_delete', { list_ids: [b], confirm: true })).data);
    expect((yield* call('saved_keyword_list_get', { list_id: b })).data).toEqual({ lists: [] });
    yield* call('saved_keyword_list_undo_delete', { undo_id: deleted.undo_id, confirm: true });
    expect(rows((yield* call('saved_keywords', { list_id: b })).data).keywords).toHaveLength(2);
    yield* call('saved_keyword_list_delete', { list_ids: [a, b], confirm: true });
    expect((yield* call('saved_keyword_lists', {})).data).toEqual({ lists: [] });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('interrupting a pending HTTP export aborts it and releases the browser slot', async () => {
  const started = new Promise<void>(resolve => { delayedExportStarted = resolve; });
  const closed = new Promise<void>(resolve => { delayedExportClosed = resolve; });
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const request = yield* parseReport('audit_export_pages', { snapshot_id: 'delayed_snapshot' });
      const fiber = yield* Effect.forkChild(service.report(request));
      yield* Effect.promise(() => started).pipe(Effect.timeout('5 seconds'));
      yield* Fiber.interrupt(fiber).pipe(Effect.timeout('5 seconds'));
      yield* Effect.promise(() => closed).pipe(Effect.timeout('5 seconds'));
      expect(yield* (yield* Exports).list()).toEqual([]);
      const next = yield* service.report(yield* parseReport('account_status', {}));
      expect(next.authenticated).toBe(true);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { delayedExportStarted = () => {}; delayedExportClosed = () => {}; }
}, 30000);


test('real browser manages native domain strategies separately from seed-based baskets', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, input)); });
    expect((yield* call('domain_strategy_create', { domain: 'example.com', confirm: true })).data).toEqual({ id: 654 });
    expect((yield* call('domain_strategy_summary')).data).toEqual({ own: 1, direct: 0, corporate: 0 });
    expect((yield* call('domain_strategy_get', { strategy_id: 654 })).data).toMatchObject({ domain: 'example.com', state: 1 });
    expect((yield* call('domain_strategy_status', { strategy_ids: [654] })).data).toEqual({ statuses: [1] });
    yield* call('domain_strategy_rename', { strategy_id: 654, name: 'fixture strategy', confirm: true });
    expect((yield* call('domain_strategies')).data).toMatchObject({ lists: [{ name: 'fixture strategy' }] });
    yield* call('domain_strategy_delete', { strategy_ids: [654], confirm: true });
    expect((yield* call('domain_strategies')).data).toEqual({ lists: [] });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('domain opportunities preserve presets, keyword deletion and native redirected export boundaries', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, input)); });
    yield* call('domain_strategy_create', { domain: 'example.com', confirm: true });
    expect((yield* call('domain_strategy_presets', { strategy_id: 654 })).data).toEqual({ all: 2, existing: 1, new: 1 });
    expect((yield* call('domain_strategy_pages', { strategy_id: 654, preset: 'create', limit: 1 })).data).toMatchObject({ pages: [{ id: 1202, type: 1 }] });
    expect((yield* call('domain_strategy_pages', { strategy_id: 654, volume_min: 1000 })).data).toMatchObject({ pages: [{ id: 1201 }] });
    expect((yield* call('domain_strategy_pages_summary', { strategy_id: 654, preset: 'improve' })).data).toEqual({ count: 1 });
    expect((yield* call('domain_strategy_page', { page_id: 1201 })).data).toMatchObject({ title: 'Python guide', keywordStats: { existingCount: 1 } });
    expect((yield* call('domain_strategy_page_urls', { page_id: 1201 })).data).toEqual({ urls: ['https://example.com/python'] });
    expect((yield* call('domain_strategy_page_serp', { page_id: 1201 })).data).toMatchObject({ serpFeatures: [21] });
    expect((yield* call('domain_strategy_existing_keywords', { page_id: 1201 })).data).toMatchObject({ keywords: [{ id: 901 }] });
    yield* call('domain_strategy_keywords_delete', { keyword_ids: [902], confirm: true });
    expect((yield* call('domain_strategy_recommended_keywords', { page_id: 1201 })).data).toMatchObject({ keywords: [{ id: 903 }] });
    const foreign = yield* call('domain_strategy_export', { strategy_id: 654, filename: 'foreign' }).pipe(Effect.flip);
    expect(foreign.message).toContain('supported download origin or path');
    const denied = yield* call('domain_strategy_export', { strategy_id: 654, filename: 'forbidden' }).pipe(Effect.flip);
    expect(denied.message).toContain('HTTP 403');
    expect(yield* (yield* Exports).list()).toEqual([]);
    const exported = yield* call('domain_strategy_export', { strategy_id: 654 });
    if (!exported.artifact) throw new Error('Expected native domain export artifact');
    expect(exported.artifact.filename).toBe('domain-strategy.csv');
    const bytes = yield* (yield* Exports).read(exported.artifact.uri);
    expect(Buffer.from(bytes.blob, 'base64').toString('utf8')).toBe('url,keyword\nhttps://example.com/python,python ideas\n');
    yield* call('domain_strategy_delete', { strategy_ids: [654], confirm: true });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('seed-based pages, selected cluster writes and opaque export IDs use the real browser boundary', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const selected = { basket_id: 456, owner_id: 123 };
    const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, { ...selected, ...input })); });
    expect((yield* call('keyword_list_page_presets')).data).toEqual([{ Preset: 1, Count: 2 }]);
    expect((yield* call('keyword_list_pages')).data).toMatchObject({ TotalPagesCount: 2, Pages: [{ ID: 1008 }, { ID: 1009 }] });
    expect((yield* call('keyword_list_clusters')).data).toMatchObject([{ ID: 1008 }, { ID: 1009 }]);
    expect((yield* call('keyword_list_clusters_get', { cluster_ids: [1008] })).data).toMatchObject([{ ID: 1008 }]);
    expect((yield* call('keyword_list_cluster_keywords', { cluster_id: 1008 })).data).toMatchObject([{ Phrase: 'email marketing' }]);
    expect((yield* call('keyword_list_page', { page_id: 1008 })).data).toMatchObject({ ID: 1008, Refs: ['https://example.com/email'] });
    yield* call('keyword_list_page_favorite', { page_id: 1008, confirm: true });
    expect((yield* call('keyword_list_pages', { page_filters: { IsFavorite: { Value: true } } })).data).toMatchObject({ Pages: [{ ID: 1008, IsFavorite: true }] });
    yield* call('keyword_list_page_unfavorite', { page_id: 1008, confirm: true });
    expect((yield* call('keyword_list_pages', { page_filters: { IsFavorite: { Value: true } } })).data).toMatchObject({ Pages: [] });
    yield* call('keyword_list_clusters_update_metrics', { cluster_ids: [1008], confirm: true });
    expect((yield* call('keyword_list_clusters_updated', { cluster_ids: [1008] })).data).toMatchObject([{ ID: 1008, UpdatedAt: 'after' }]);
    const missing = yield* call('keyword_list_export', { filename: 'missing' }).pipe(Effect.flip);
    expect(missing.message).toContain('export identifier');
    expect(yield* (yield* Exports).list()).toEqual([]);
    for (const [name, input] of [['keyword_list_export', {}], ['keyword_list_export_pages', {}],
      ['keyword_list_export_keywords', { keywords: ['email marketing'], database: 'us' }], ['keyword_list_export_clusters', { cluster_ids: [1008] }]] satisfies [string, Query][]) {
      const exported = yield* call(name, input);
      if (!exported.artifact) throw new Error('Expected seed export artifact');
      expect(exported.data).toBeNull(); expect(JSON.stringify(exported)).not.toContain('fixture-secret');
      expect(JSON.stringify(exported)).not.toContain('fixture-export');
      const bytes = yield* (yield* Exports).read(exported.artifact.uri);
      expect(Buffer.from(bytes.blob, 'base64').toString('utf8')).toBe('Keyword,Volume\nemail marketing,5000\n');
    }
    yield* call('keyword_list_clusters_delete', { cluster_ids: [1009], confirm: true });
    expect((yield* call('keyword_list_clusters')).data).toMatchObject([{ ID: 1008 }]);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('tracking settings preserve omitted fields and require fresh editable-target metadata', async () => {
  trackingSettingsState = { tracking_url: 'example.com', tracking_url_type: 'rootdomain', business_name: 'original business', brands: ['original brand'] };
  trackingVolume = 'national'; trackingEditable = true; trackingMalformedHashes = false; trackingHashReads = 0; trackingSettingWrites = 0;
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, { campaign_id: '789_42', ...input })); });
      const edited = yield* call('position_configure', { business_name: 'changed business', confirm: true });
      expect(JSON.stringify(edited)).not.toContain('fixture-edit-secret'); expect(edited.data).toEqual({ status: 'ok', data: {} });
      expect(trackingSettingsState).toEqual({ tracking_url: 'example.com', tracking_url_type: 'rootdomain', business_name: 'changed business', brands: ['original brand'] });
      expect(trackingVolume).toBe('national');
      const inspected = yield* call('position_info'); expect(JSON.stringify(inspected)).not.toContain('fixture-edit-secret');
      yield* call('position_configure', { brands: ['changed brand'], confirm: true });
      expect(trackingSettingsState.brands).toEqual(['changed brand']); expect(trackingSettingsState.business_name).toBe('changed business');
      yield* call('position_configure', { domain: 'https://example.com/page', url_type: 'url', confirm: true });
      expect(trackingSettingsState).toMatchObject({ tracking_url: 'https://example.com/page', tracking_url_type: 'url', business_name: 'changed business' });
      yield* call('position_configure', { business_name: '', confirm: true });
      expect(trackingSettingsState.business_name).toBe(''); expect(trackingSettingsState.brands).toEqual(['changed brand']);
      expect(trackingHashReads).toBe(4); expect(trackingSettingWrites).toBe(4);
      trackingEditable = false;
      const readonly = yield* call('position_configure', { business_name: 'refused', confirm: true }).pipe(Effect.flip);
      expect(readonly.message).toContain('read-only'); expect(trackingHashReads).toBe(4); expect(trackingSettingWrites).toBe(4);
      trackingEditable = true; trackingMalformedHashes = true;
      const missing = yield* call('position_configure', { business_name: 'refused', confirm: true }).pipe(Effect.flip);
      expect(missing.message).toContain('edit metadata'); expect(trackingSettingWrites).toBe(4);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { trackingEditable = true; trackingMalformedHashes = false; }
}, 30000);


test('owner-aware basket transfers copy and move only explicit phrase or cluster selections', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const source = { basket_id: 1001, owner_id: 123 };
    const target = { target_basket_id: 1002, target_owner_id: 123 };
    const call = (name: string, input: Query) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, input)); });
    yield* call('keyword_list_keywords_copy', { ...source, ...target, keywords: ['email marketing'], database: 'us', confirm: true });
    expect((yield* call('keyword_list_keywords', source)).data).toMatchObject({ Keywords: [{ Phrase: 'email marketing' }, { Phrase: 'python tutorial' }, { Phrase: 'seo tools' }] });
    expect((yield* call('keyword_list_keywords', { basket_id: 1002, owner_id: 123 })).data).toMatchObject({ Keywords: [{ Phrase: 'email marketing' }] });
    yield* call('keyword_list_keywords_move', { ...source, ...target, keywords: ['python tutorial'], database: 'us', confirm: true });
    expect((yield* call('keyword_list_keywords', source)).data).toMatchObject({ Keywords: [{ Phrase: 'email marketing' }, { Phrase: 'seo tools' }] });
    yield* call('keyword_list_clusters_copy', { ...source, ...target, cluster_ids: [1010], confirm: true });
    expect((yield* call('keyword_list_keywords', source)).data).toMatchObject({ Keywords: [{ Phrase: 'email marketing' }, { Phrase: 'seo tools' }] });
    yield* call('keyword_list_clusters_move', { ...source, ...target, cluster_ids: [1010], confirm: true });
    expect((yield* call('keyword_list_keywords', source)).data).toMatchObject({ Keywords: [{ Phrase: 'email marketing' }] });
    expect((yield* call('keyword_list_keywords', { basket_id: 1002, owner_id: 123 })).data).toEqual({ Keywords: [
      { Phrase: 'email marketing', Database: 'us', ClusterID: 0 }, { Phrase: 'python tutorial', Database: 'us', ClusterID: 0 }, { Phrase: 'seo tools', Database: 'us', ClusterID: 0 },
    ] });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('tracking alert lists preserve unread state and confirmed rules complete a native lifecycle', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const campaign = { campaign_id: '789_42' };
    const report = (name: string, query: Query) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, query)); });
    const selection = { ...campaign, domain: 'example.com', condition: 'enters_top', threshold: 10, confirm: true };
    expect((yield* report('position_trigger_count', campaign)).data).toMatchObject({ items_count: 0 });
    expect((yield* report('position_trigger_create', selection)).data).toMatchObject({ trigger_id: 'rule-1' });
    expect((yield* report('position_triggers', campaign)).data).toMatchObject({ trigger_ids: [{ trigger_id: 'rule-1', trigger_body: { threshold: 10 } }] });
    expect((yield* report('position_trigger_count', campaign)).data).toMatchObject({ items_count: 1 });
    yield* report('position_trigger_update', { ...selection, trigger_id: 'rule-1', condition: 'leaves_top', threshold: 20 });
    expect((yield* report('position_triggers', campaign)).data).toMatchObject({ trigger_ids: [{ trigger_body: { condition: 'leaves_top', threshold: 20 } }] });
    const alerts = yield* report('position_alerts', { ...campaign, page: 2, limit: 10 });
    expect(alerts.data).toMatchObject({ alert_ids: [{ alert_body: { date: 1792094400, is_read: 0 } }] });
    expect((yield* report('position_alert_counts', campaign)).data).toMatchObject({ unread_items_count: 1 });
    yield* report('position_trigger_delete', { ...campaign, trigger_id: 'rule-1', confirm: true });
    expect((yield* report('position_triggers', campaign)).data).toMatchObject({ trigger_ids: [] });
    for (const name of ['position_alerts', 'position_trigger_create']) {
      const failed = yield* report(name, name === 'position_alerts' ? { campaign_id: '789_99' } : { ...selection, campaign_id: '789_99' }).pipe(Effect.flip);
      expect(failed.message).toContain('target is read-only');
      expect(failed.message).not.toContain('fixture-secret');
    }
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);
