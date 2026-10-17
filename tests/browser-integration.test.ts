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
import { makeTrackingTargetsFixture } from './tracking-targets-fixture.js';
import { makeNotesFixture } from './notes-fixture.js';
import { makeTrackingAlertsFixture } from './tracking-alerts-fixture.js';
import { makeTransferFixture } from './basket-transfer-fixture.js';
import { makeSeedFixture } from './seed-strategy-fixture.js';
import { makeDomainFixture } from './domain-strategy-fixture.js';
import { makeSavedFixture, savedPath } from './saved-keywords-fixture.js';
import { text as readText } from 'node:stream/consumers';
import { makeBacklinkAuditFixture } from './backlink-audit-fixture.js';
import { makeAuditArchiveFixture, archivePaths } from './audit-archive-fixture.js';
import { unzipSync } from 'fflate';
import { makeMindmapFixture } from './mindmap-fixture.js';
import { makeWebBotAuthFixture, auditAuthPath } from './web-bot-auth-fixture.js';
import { makeReportingFixture, reportingDocument, reportingPDFBytes } from './reporting-fixture.js';
import { makeReportingTemplateFixture } from './reporting-template-fixture.js';
import { makeKeywordResearchFixture, keywordDownloadPath, keywordFixturePhrase } from './keyword-research-fixture.js';
import { makeWebVitalsFixture, webVitalsPath, negativeURLId, positiveURLId } from './web-vitals-fixture.js';
import { makeOnpageFixture, onpagePath, onpagePageId, onpageSnapshotId } from './onpage-fixture.js';
import { makeOrganicResearchFixture } from './organic-research-fixture.js';
import { makeSharingFixture } from './sharing-fixture.js';

const exec = promisify(execFile);
const binary = resolve(`dist/daemon/galleton-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`);
let directory: string;
let child: ChildProcess;
let daemonExited: Promise<void>;
let sdk: Galleton;
let daemonURL: string;
let fixtureURL: string;
let authenticated = true;
let sessionConfirmationRequired = false;
let failReport = false;
let auditConfigured = false;
let auditStarted = false;
let auditProtected = false;
let auditUsername = '';
let auditPassword = '';
let auditRejectPassword = false;
let auditOtherConnection: 'ga' | 'bot' | null = null;
let delayedExportStarted = () => {};
let delayedExportClosed = () => {};
const auditComparisonCSV = 'Issue Id,Issue,15 Oct 2026 (15:12 UTC),15 Oct 2026 (13:52 UTC),Delta,Delta Percent\r\nn/a,Site Health,93,85,-8,-8.60\r\n';
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
const trackingTargetsFixture = makeTrackingTargetsFixture();
const serveNotesFixture = makeNotesFixture();
const backlinkAuditFixture = makeBacklinkAuditFixture();
const auditArchiveFixture = makeAuditArchiveFixture();
const mindmapFixture = makeMindmapFixture();
const webBotAuthFixture = makeWebBotAuthFixture();
const reportingFixture = makeReportingFixture();
const reportingTemplateFixture = makeReportingTemplateFixture();
const webVitalsFixture = makeWebVitalsFixture();
const keywordResearchFixture = makeKeywordResearchFixture();
const onpageFixture = makeOnpageFixture();
const organicResearchFixture = makeOrganicResearchFixture();
const sharingFixture = makeSharingFixture();
// Match specific system/custom template paths before the generic reporting API prefix.
const fixtureHandlers = new Map([...archivePaths.map(path => [path, auditArchiveFixture.serve] as const), [folderPath, serveProjectFixture], [savedPath, serveSavedFixture], ['/notes/api/', serveNotesFixture], ['/siteaudit/api/campaigns/789/js-impact/', serveJSImpactFixture], ['/siteaudit/export/js-impact/', serveJSImpactFixture], ['/analytics/keywordmanager/list', mindmapFixture.serve], ['/mindmap-download', mindmapFixture.serve], [auditAuthPath, webBotAuthFixture.serve], ['/siteaudit/api/campaigns/794/info', reportingFixture.lifecycle.serve], ['/my_reports/graphql/', reportingFixture.serve], ['/my_reports/api/v1/template/system/', reportingFixture.lifecycle.serve], ['/my_reports/api/v1/template/', reportingTemplateFixture.serve], ['/my_reports/api/v1/templates/', reportingTemplateFixture.serve], ['/my_reports/api/v1/', reportingFixture.lifecycle.serve], ['/my_reports/reports/', reportingFixture.lifecycle.serve], [webVitalsPath, webVitalsFixture.serve], [keywordDownloadPath, keywordResearchFixture.serveDownload], [onpagePath, onpageFixture.serve]]);
/** Serve the native authentication checks separately from report fixtures. */
function serveAuthenticationFixture(request: IncomingMessage, response: ServerResponse, url: URL): boolean {
  if (url.pathname === '/robots.txt') { response.end('User-agent: *\nDisallow: /'); return true; }
  if (url.pathname === '/analytics/overview/') {
    response.end('<script>window.sm2.user={"api_key":"fixture-secret","id":123,"email":"fixture@example.com"}' + onpageFixture.bootstrap() + '</script>'); return true;
  }
  if (url.pathname === '/multilogin/') { response.end('Confirm your session'); return true; }
  if (url.pathname === '/home/') {
    if (sessionConfirmationRequired) { response.writeHead(302, { Location: '/multilogin/?redirect_to=%2Fhome%2F' }); }
    else if (!authenticated || !request.headers.cookie?.includes('session=authorized')) { response.writeHead(302, { Location: '/login/' }); }
    response.end(); return true;
  }
  return false;
}

const fixture = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', fixtureURL);
  if (serveAuthenticationFixture(request, response, url)) return;
  if (url.pathname.startsWith('/share/json/')) { await sharingFixture.serve(request, response, url); return; }
  const handler = [...fixtureHandlers].find(([prefix]) => url.pathname.startsWith(prefix))?.[1];
  if (handler) { await handler(request, response, url); return; }
  if (url.pathname === '/dpa/rpc') { await organicResearchFixture.serve(request, response); return; }
  if (url.pathname === '/siteaudit/api/campaigns/seolist') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify([...(auditConfigured ? [{ id: 789 }] : []), ...webBotAuthFixture.campaigns()])); return; }
  if (url.pathname.startsWith('/siteaudit/export/')) {
    expect(url.searchParams.get('key')).toBe('fixture-secret');
    expect(url.searchParams.get('export')).toBe('csv');
    if (url.searchParams.get('snapshotId') === 'delayed_snapshot' || url.pathname.includes('delayed_snapshot')) {
      response.once('close', () => delayedExportClosed());
      delayedExportStarted(); return;
    }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename=fixture.csv');
    if (url.pathname === '/siteaudit/export/snapshot/new_snapshot/compare/old_snapshot') {
      expect(request.method).toBe('GET');
      expect(request.headers.cookie).toContain('session=authorized');
      expect([...url.searchParams.keys()].sort()).toEqual(['export', 'key']);
      response.setHeader('Content-Disposition', 'attachment; filename=compare_crawls.csv');
      response.end(auditComparisonCSV); return;
    }
    if (url.pathname === '/siteaudit/export/campaigns/789' || url.pathname === '/siteaudit/export/pagesStructuredData/opaque_snapshot') {
      expect(request.method).toBe('GET');
      expect(request.headers.cookie).toContain('session=authorized');
      expect(url.searchParams.get('relative')).toBe('true'); expect(url.searchParams.get('sort')).toBe('url_desc'); expect(url.searchParams.get('filter')).toBe('café');
      if (url.pathname.includes('/campaigns/')) {
        response.setHeader('Set-Cookie', 'export_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
        response.end('Page URL,Broken internal links\n/café,1\n');
      } else {
        expect(request.headers.cookie).toContain('export_rotation=retained');
        response.end('Page URL,Schema.org (JSON-LD)\n/café,Article\n');
      }
      return;
    }
    response.end('url,title\nhttps://example.com/,café\n'); return;
  }
  if (url.pathname.startsWith('/backlink_audit/')) { await backlinkAuditFixture.serve(request, response, url); return; }
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
  if (url.pathname === '/kwogw/v2/webapi' || url.pathname === '/kmtgw/v2/webapi') { await serveKeywordRPCFixture(request, response); return; }
  response.end('login');
});

/** Share the real keyword RPC boundaries with the research/export scenarios. */
async function serveKeywordRPCFixture(request: IncomingMessage, response: ServerResponse) {
  let body = '';
  for await (const chunk of request) body += chunk;
  const rpc = JSON.parse(body);
  expect(rpc.params).not.toHaveProperty('email');
  observed.push(rpc.method);
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Set-Cookie', 'rotated=yes; Path=/; HttpOnly');
  if (failReport) { response.end('{"error":{"message":"fixture-secret access denied"}}'); return; }
  if (onpageFixture.envelopeFailure(response)) return;
  if (keywordResearchFixture.serveRPC(request, rpc, response)) return;
  response.end(rpc.method === 'keywords.GetInfo' ? '{"result":{"keywords":[{"database":"us","volume":100,"id":9223372036854775807,"apiKey":"fixture-secret"}]}}' : '{"result":{"allowed":true}}'); return;
}

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
    const semrush = yield* Semrush;
    expect(semrush.account).toEqual({ email: 'fixture@example.com' });
    return yield* semrush.report(yield* parseReport('keyword_overview', { keyword: 'fixture' }));
  }).pipe(Effect.provide(fixtureLayer()))));
  expect(result).toEqual({ authenticated: true, report: 'keyword_overview', data: { database: 'us', volume: 100, id: '9223372036854775807' } });
  expect(observed).toContain('keywords.GetInfo');
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('rotated=yes');
}, 30000);

test('native session confirmation fails before reports and never submits a takeover', async () => {
  sessionConfirmationRequired = true;
  const count = observed.length;
  try {
    const failure = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      return yield* (yield* Semrush).report(yield* parseReport('account_status', {}));
    }).pipe(Effect.provide(fixtureLayer()), Effect.flip)));
    expect(failure).toMatchObject({ _tag: 'SessionError', code: 'session_confirmation_required', message: expect.stringContaining('/multilogin/') });
    expect(failure.message).not.toContain('expired');
    expect(observed).toHaveLength(count);
  } finally { sessionConfirmationRequired = false; }
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


test('real browser and Galleton grant, change and revoke exact project shares', async () => {
  sharingFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const folder = { folder_id: '9223372036854775807' };
    const readRequest = yield* parseReport('project_shares', folder);
    const read = () => semrush.report(readRequest);
    expect((yield* read()).data).toMatchObject({ is_success: true, data: { list: [], total: 0 } });
    expect((yield* semrush.report(yield* parseReport('project_share', { ...folder, emails: ['recipient@example.com'], role: 'viewer', confirm: true }))).data).toMatchObject({ is_success: true, data: { list: [{ share_id: '0123456789abcdef01234567' }] } });
    const share = { share_ids: ['0123456789abcdef01234567'], confirm: true };
    yield* semrush.report(yield* parseReport('project_share_set_role', { ...share, role: 'editor' }));
    expect((yield* read()).data).toMatchObject({ data: { list: [{ role: 'editor' }], total: 1 } });
    yield* semrush.report(yield* parseReport('project_share_revoke', share));
    expect((yield* read()).data).toMatchObject({ data: { list: [], total: 0 } });
    expect(sharingFixture.writes()).toBe(3);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('sharing rejects denied, lost and incomplete receipts without replaying writes', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    for (const report of [false, true]) {
      for (const scenario of ['denied', 'create-lost', 'receipt-missing', 'receipt-partial']) {
        sharingFixture.reset(scenario);
        const target: Query = report ? { report_id: 71 } : { folder_id: '9223372036854775807' };
        const error = yield* semrush.report(yield* parseReport(report ? 'reporting_share' : 'project_share', { ...target, emails: ['recipient@example.com'], role: 'viewer', confirm: true })).pipe(Effect.flip);
        expect(error.message).toContain(report ? 'reporting-shares' : 'project-shares');
        expect(sharingFixture.writes()).toBe(1);
        expect((yield* semrush.report(yield* parseReport(report ? 'reporting_shares' : 'project_shares', target))).data).toMatchObject({ data: { total: scenario === 'denied' ? 0 : 1 } });
      }
    }
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('report sharing preserves project access while changing only the selected report share', async () => {
  sharingFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const grant = { emails: ['recipient@example.com'], role: 'viewer', confirm: true };
    const project = { folder_id: '9223372036854775807' };
    const report = { report_id: 71 };
    yield* semrush.report(yield* parseReport('project_share', { ...project, ...grant }));
    expect((yield* semrush.report(yield* parseReport('reporting_share', { ...report, ...grant }))).data).toMatchObject({ is_success: true, data: { list: [{ share_id: '0123456789abcdef01234568' }] } });
    const selected = { share_ids: ['0123456789abcdef01234568'], confirm: true };
    yield* semrush.report(yield* parseReport('reporting_share_set_role', { ...selected, role: 'editor' }));
    expect((yield* semrush.report(yield* parseReport('reporting_shares', report))).data).toMatchObject({ data: { list: [{ role: 'editor' }], total: 1 } });
    yield* semrush.report(yield* parseReport('reporting_share_revoke', selected));
    expect((yield* semrush.report(yield* parseReport('reporting_shares', report))).data).toMatchObject({ data: { list: [], total: 0 } });
    expect((yield* semrush.report(yield* parseReport('project_shares', project))).data).toMatchObject({ data: { list: [{ share_id: '0123456789abcdef01234567', role: 'viewer' }], total: 1 } });
    yield* semrush.report(yield* parseReport('project_share_revoke', { share_ids: ['0123456789abcdef01234567'], confirm: true }));
    expect(sharingFixture.writes()).toBe(5);
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
    const settings = { campaign_id: 789, domain: 'example.com', page_limit: 10, confirm: true };
    const savesBefore = observed.filter(entry => entry.endsWith('/save')).length;
    auditProtected = true;
    const protectedFailure = yield* semrush.report(yield* parseReport('audit_configure', settings)).pipe(Effect.flip);
    expect(protectedFailure.message).toContain('protected-site authentication');
    auditProtected = false;
    const domainFailure = yield* semrush.report(yield* parseReport('audit_configure', { ...settings, domain: 'other.example.com' })).pipe(Effect.flip);
    expect(domainFailure.message).toContain('must match');
    expect(observed.filter(entry => entry.endsWith('/save'))).toHaveLength(savesBefore);
    const configured = yield* semrush.report(yield* parseReport('audit_create', { campaign_id: 789, domain: 'example.com', page_limit: 10, confirm: true }));
    expect(configured.data).toMatchObject({ status: 'FINISHED', authEnabled: false });
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
    const encoded = await readText(request);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/settings/urls/upload')) {
      expect(request.method).toBe('POST');
      const contentType = request.headers['content-type'] ?? '';
      expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
      const form = await new Request(fixtureURL + url.pathname, { method: 'POST', headers: { 'Content-Type': contentType }, body: encoded }).formData();
      const file = form.get('file-urls');
      if (!(file instanceof File)) throw new Error('Expected native file-urls part');
      expect([...form.keys()]).toEqual(['file-urls']); expect(file.name).toBe('semrush-crawl-urls.txt');
      const contents = await file.text();
      if (contents === '/reject\n') { response.end(JSON.stringify({ status: { code: 5, message: 'Invalid URLs' } })); return; }
      expect(contents).toBe('/café\n/second\n');
      response.end(JSON.stringify({ filename: file.name, status: { code: 0 }, data: { count: 2 } })); return;
    }
    if (request.method === 'POST') expect(request.headers['content-type']).toBe('application/json');
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
      expect(settings).not.toHaveProperty('confirm');
      if (auditRejectPassword) { response.end(JSON.stringify({ error: { message: 'Auth rejected ' + settings.authPassword } })); return; }
      auditProtected = settings.authEnabled;
      if (!auditProtected) { auditUsername = ''; auditPassword = ''; }
      else if (settings.authUsername && settings.authPassword) { auditUsername = settings.authUsername; auditPassword = settings.authPassword; }
      auditConfigured = true;
      response.end(JSON.stringify({ id: 789, status: 'FINISHED', authEnabled: auditProtected, authUsername: auditUsername, authPassword: auditPassword, echo: settings.authPassword })); return;
    } else if (url.pathname.endsWith('/launch')) {
      expect(auditConfigured).toBe(true); expect(encoded).toBe(''); auditStarted = true;
    } else if (url.pathname.endsWith('/abort') || url.pathname.endsWith('/stop')) {
      expect(request.method).toBe('POST'); expect(encoded).toBe(''); auditStarted = false;
      response.removeHeader('Content-Type'); response.end(); return;
    } else if (url.pathname.endsWith('/snapshot')) {
      expect(url.searchParams.get('snapshot_id')).toBe('12');
    }
    response.end(JSON.stringify({ id: 789, status: auditStarted ? 'RUNNING' : 'FINISHED', projectDomain: 'example.com', authEnabled: auditProtected, authUsername: auditUsername, authPassword: auditPassword, gaSettings: auditOtherConnection === 'ga' ? { connected: true } : {}, webBotAuthEnabled: auditOtherConnection === 'bot' })); return;
}

test('real multipart uploads and protected audit edits preserve credentials and keep failures private', async () => {
  const previous = { configured: auditConfigured, started: auditStarted, protected: auditProtected };
  auditConfigured = true; auditStarted = false; auditProtected = false;
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const settings = { campaign_id: 789, domain: 'example.com', page_limit: 10, confirm: true };
      const upload = yield* semrush.report(yield* parseReport('audit_urls_upload', { campaign_id: 789, contents: '/café\n/second\n', confirm: true }));
      expect(upload.data).toMatchObject({ filename: 'semrush-crawl-urls.txt', data: { count: 2 } });
      expect(auditStarted).toBe(false);
      const uploadFailure = yield* semrush.report(yield* parseReport('audit_urls_upload', { campaign_id: 789, contents: '/reject\n', confirm: true })).pipe(Effect.flip);
      expect(uploadFailure.message).toContain('Invalid URLs');
      const missingCredentials = yield* semrush.report(yield* parseReport('audit_configure', { ...settings, auth_enabled: true })).pipe(Effect.flip);
      expect(missingCredentials.message).toContain('both auth_username and auth_password');
      const protectedSettings = { ...settings, auth_enabled: true, auth_username: 'private-user', auth_password: 'private-password' };
      const saved = yield* semrush.report(yield* parseReport('audit_configure', protectedSettings));
      expect(saved.data).toMatchObject({ authEnabled: true, echo: '[redacted]' });
      expect(JSON.stringify(saved.data)).not.toContain('private-password');
      expect(saved.data).not.toHaveProperty('authPassword'); expect(saved.data).not.toHaveProperty('authUsername');
      expect([auditUsername, auditPassword]).toEqual(['private-user', 'private-password']);
      yield* semrush.report(yield* parseReport('audit_configure', { ...settings, auth_enabled: true }));
      expect([auditUsername, auditPassword]).toEqual(['private-user', 'private-password']);
      const info = yield* semrush.report(yield* parseReport('audit_info', { campaign_id: 789 }));
      expect(JSON.stringify(info.data)).not.toContain('private-password');
      for (const [connection, message] of [['ga', 'web UI'], ['bot', '--web-bot-auth-enabled']] as const) {
        auditOtherConnection = connection;
        const failure = yield* semrush.report(yield* parseReport('audit_configure', { ...settings, auth_enabled: false })).pipe(Effect.flip);
        expect(failure.message).toContain(message); expect(auditProtected).toBe(true);
      }
      auditOtherConnection = null; auditRejectPassword = true;
      const failure = yield* semrush.report(yield* parseReport('audit_configure', protectedSettings)).pipe(Effect.flip);
      expect(failure.message).toContain('[redacted]'); expect(failure.message).not.toContain('private-password');
      auditRejectPassword = false;
      yield* semrush.report(yield* parseReport('audit_configure', { ...settings, auth_enabled: false }));
      expect([auditProtected, auditUsername, auditPassword]).toEqual([false, '', '']);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally {
    auditConfigured = previous.configured; auditStarted = previous.started; auditProtected = previous.protected;
    auditUsername = ''; auditPassword = ''; auditRejectPassword = false; auditOtherConnection = null;
  }
}, 30000);


test('organic comparisons retain native date ranges, selectors, pagination and matching totals', async () => {
  organicResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, query: Query = {}) => parseReport(name, { domain: 'fixture.example', ...query }).pipe(Effect.flatMap(request => service.report(request)));
    const daily = { start_date: '20261015', end_date: '20261016' };
    const result = yield* call('domain_position_changes', { date_range: daily, change_types: ['new', 'improved'], page: 2, page_size: 1 });
    expect(result.data).toEqual({ rows: [{ keyword: 'fixture feature', position: 1, previousPosition: 3, positionIsSERPFeature: 1, traffic: 30, urlHash: '9223372036854775807', native_extra: false }], total: 2, page: 2, page_size: 1 });
    expect(organicResearchFixture.observed.map(call => call.method)).toEqual(['organic.PositionChangesV2', 'organic.PositionChangesTotalV2']);
    for (const observed of organicResearchFixture.observed) expect(observed.args).toMatchObject({ dateRange: { startDate: '20261015', endDate: '20261016' }, changesTypes: ['new', 'improved'], positionsType: 'all', dateType: 'daily' });
    expect((yield* call('domain_position_changes', { database: 'mobile-us', date_type: 'monthly', date_range: { start_date: '202608', end_date: '202609' }, positions_type: 'serp' })).data).toMatchObject({ rows: [{ keyword: 'fixture feature', positionIsSERPFeature: 1 }], total: 1 });
    expect(organicResearchFixture.observed.at(-1)?.args).toMatchObject({ database: 'mobile-us', dateRange: { startDate: '20260815', endDate: '20260915' }, positionsType: 'serpFeatures' });
    expect((yield* call('domain_keywords', { positions_type: 'organic' })).data).toMatchObject({ rows: [{ keyword: 'fixture new' }, { keyword: 'fixture declined' }], total: 2 });
    expect((yield* call('domain_keywords', { positions_type: 'serp' })).data).toMatchObject({ rows: [{ keyword: 'fixture feature' }], total: 1 });
  }).pipe(Effect.provide(fixtureLayer()))));
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('organic_rotation=retained');
});

test('organic presets and trends retain complete native data, zeros and empty arrays', async () => {
  try {
    organicResearchFixture.use();
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, query: Query = {}) => parseReport(name, { domain: 'fixture.example', ...query }).pipe(Effect.flatMap(request => service.report(request)));
      expect((yield* call('domain_position_changes_presets', { date_type: 'monthly', date_range: { start_date: '202608', end_date: '202609' } })).data).toEqual({ positionsDropping: 2, positionsSerpChanges: 1, positionsTotal: 4, positionsTrending: 2, native_extra: false });
      for (const [name, date] of [['domain_position_changes_daily_trend', '20261016'], ['domain_position_changes_monthly_trend', '202609']] as const) expect((yield* call(name, { database: 'mobile-us' })).data).toEqual([{ date, positionsDropping: 0, positionsTrending: 2, traffic: 0, native_extra: false }]);
      organicResearchFixture.use('empty');
      expect((yield* call('domain_position_changes')).data).toMatchObject({ rows: [], total: 0 });
      expect((yield* call('domain_position_changes_presets')).data).toEqual({ positionsDropping: 0, positionsSerpChanges: 0, positionsTotal: 0, positionsTrending: 0, native_extra: false });
      expect((yield* call('domain_position_changes_daily_trend')).data).toEqual([]);
      expect((yield* call('domain_position_changes_monthly_trend')).data).toEqual([]);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { organicResearchFixture.use(); }
});

test('organic errors retain provider codes and reject incomplete row-plus-total results without replay', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const [scenario, name, code, calls] of [['denied', 'domain_position_changes_daily_trend', -32099, 1], ['totals-failed', 'domain_position_changes', -32098, 2]] as const) {
        organicResearchFixture.use(scenario);
        const request = yield* parseReport(name, { domain: 'fixture.example' });
        const failure = yield* service.report(request).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: 'ReportError', providerCode: code });
        expect(failure.message).not.toContain('fixture-secret'); expect(organicResearchFixture.observed).toHaveLength(calls);
      }
      organicResearchFixture.use();
      expect((yield* service.report(yield* parseReport('domain_position_changes_presets', { domain: 'fixture.example' }))).data).toHaveProperty('positionsTotal', 4);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { organicResearchFixture.use(); }
});

test('Keyword Magic retains personalized rows, native metadata and zero counts without preparing or refreshing', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, query: Query = {}) => parseReport(name, query).pipe(Effect.flatMap(request => service.report(request)));
    expect((yield* call('keyword_magic_access')).data).toEqual({ rows_count: 30000, examples_rows_count: 50000, max_updates: 1000, remaining_updates: 951, has_ai_seo: false, trial_status: 'active', user_type: 'regular', native_extra: 0 });
    const selected = { keyword: keywordFixturePhrase, domain: 'github.com', mode: 0 };
    expect((yield* call('keyword_magic', { ...selected, page: 2, page_size: 1 })).data).toEqual({ keywords: [{ phrase: 'fixture news', volume: 33100, cpc: 4.1, serp_id: 'b-g-97-0924-17033977320375618765', domain_difficulty: 0, domain_position: 5, domain_traffic: 2024 }], topics_enabled: true, native_extra: false });
    expect((yield* call('keyword_magic_summary', selected)).data).toEqual({ total: 3, total_volume: 0, total_difficulty: 98, total_keywords_with_difficulty: 1, total_domain_traffic: 0, topics_enabled: true });
    expect((yield* call('keyword_magic_groups', { ...selected, page: 2, page_size: 1 })).data).toEqual({ groups: [{ name: 'TypeScript interfaces', keywords_count: 2, keywords_volume: 900 }], topics_enabled: true, native_extra: false });
    expect((yield* call('keyword_magic_groups_summary', selected)).data).toEqual({ count: 2, topics_enabled: true, native_extra: false });
    expect((yield* call('keyword_magic_topic_suggestions', selected)).data).toEqual(['typescript in', 'typescript javascript']);
    for (const observed of keywordResearchFixture.observed.slice(1)) expect(observed.params).toMatchObject({ domain: 'github.com', mode: 0, groups: [], topics_enabled: true });
    expect(keywordResearchFixture.observed.map(call => call.method)).toEqual(['user.GetInfo', 'ideas.GetKeywords', 'ideas.GetKeywordsSummary', 'ideas.GetGroups', 'ideas.GetGroupsSummary', 'ideas.GetSuggestionsByTopics']);
    expect(keywordResearchFixture.preparations).toBe(0); expect(keywordResearchFixture.refreshes).toBe(0);
  }).pipe(Effect.provide(fixtureLayer()))));
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('keyword_magic_rotation=retained');
});

test('Keyword Magic word grouping retains native count and volume sort contexts without topic requests', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush, selected = { keyword: keywordFixturePhrase, group_by: 'words' };
    const call = (name: string, query: Query = {}) => parseReport(name, { ...selected, ...query }).pipe(Effect.flatMap(request => service.report(request)));
    expect((yield* call('keyword_magic_groups', { page_size: 1 })).data).toEqual({ groups: [{ name: 'compiler', keywords_count: 3, keywords_volume: 0 }], topics_enabled: false, native_extra: false });
    expect(keywordResearchFixture.observed.at(-1)?.params.groups_order).toEqual({ direction: 1, field: 'count' });
    expect((yield* call('keyword_magic_groups', { groups_sort_field: 'volume', groups_descending: false })).data).toEqual({ groups: [{ name: 'compiler', keywords_count: 3, keywords_volume: 0 }, { name: 'javascript', keywords_count: 2, keywords_volume: 900 }], topics_enabled: false, native_extra: false });
    expect(keywordResearchFixture.observed.at(-1)?.params.groups_order).toEqual({ direction: 0, field: 'volume' });
    expect((yield* call('keyword_magic_groups_summary')).data).toEqual({ count: 2, topics_enabled: false, native_extra: false });
    for (const observed of keywordResearchFixture.observed) { expect(observed.params).not.toHaveProperty('topics_enabled'); expect(observed.params).not.toHaveProperty('domain'); }
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('empty Keyword Magic results remain native empty data with zero totals', async () => {
  try {
    keywordResearchFixture.use('empty');
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string) => parseReport(name, { keyword: keywordFixturePhrase }).pipe(Effect.flatMap(request => service.report(request)));
      expect((yield* call('keyword_magic')).data).toEqual({ keywords: [], topics_enabled: true, native_extra: false });
      expect((yield* call('keyword_magic_groups')).data).toEqual({ groups: [], topics_enabled: true, native_extra: false });
      expect((yield* call('keyword_magic_groups_summary')).data).toEqual({ count: 0, topics_enabled: true, native_extra: false });
      expect((yield* call('keyword_magic_topic_suggestions')).data).toEqual([]);
      expect((yield* call('keyword_magic_summary')).data).toMatchObject({ total: 0, total_volume: 0, total_domain_traffic: 0 });
      expect(keywordResearchFixture.preparations).toBe(0); expect(keywordResearchFixture.refreshes).toBe(0);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('Keyword Magic native errors retain provider codes, never fall back and leave later reads usable', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const [scenario, providerCode] of [['denied', -32002], ['rate-limited', -32003]] as const) {
        keywordResearchFixture.use(scenario);
        const failure = yield* service.report(yield* parseReport('keyword_magic_groups_summary', { keyword: keywordFixturePhrase })).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: 'ReportError', providerCode }); expect(failure.message).not.toContain('fixture-secret');
        expect(keywordResearchFixture.observed).toHaveLength(1);
      }
      keywordResearchFixture.use('read-failed');
      const failure = yield* service.report(yield* parseReport('keyword_magic_topic_suggestions', { keyword: keywordFixturePhrase })).pipe(Effect.flip);
      expect(failure.message).toContain('HTTP 403'); expect(failure.message).not.toContain('fixture-secret'); expect(keywordResearchFixture.observed).toHaveLength(1);
      keywordResearchFixture.use();
      expect((yield* service.report(yield* parseReport('keyword_magic_access', {}))).data).toHaveProperty('remaining_updates');
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('domain preparation normalizes once and advances only through explicit status reads', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, query: Query = {}) => parseReport(name, query).pipe(Effect.flatMap(request => service.report(request)));
      keywordResearchFixture.use();
      expect((yield* call('keyword_domain_suggestions')).data).toEqual({ history: ['example.com'], projects: ['project.example'], competitors: ['competitor.example'] });
      expect((yield* call('keyword_domain_root', { domain: 'www.example.com' })).data).toEqual({ site_root_domain: 'example.com' });
      expect(keywordResearchFixture.preparations).toBe(0);
      expect((yield* call('keyword_domain_prepare', { domain: 'www.example.com', confirm: true })).data).toEqual({ domain: 'example.com', preparation: { id: '', status: 2, native_extra: false } });
      expect(keywordResearchFixture.observed.slice(-2)).toEqual([{ method: 'domains.GetSiteRoot', params: { domain: 'www.example.com' } }, { method: 'domains.GetStatus', params: { domain: 'example.com' } }]);
      expect(keywordResearchFixture.preparations).toBe(1); expect(keywordResearchFixture.domainStatusReads).toBe(0);
      keywordResearchFixture.use('domain-ready-absent-id');
      expect((yield* call('keyword_domain_prepare', { domain: 'example.com', confirm: true })).data).toEqual({ domain: 'example.com', preparation: { status: 2, native_extra: 0 } });
      keywordResearchFixture.use('domain-pending');
      expect((yield* call('keyword_domain_prepare', { domain: 'www.example.com', confirm: true })).data).toEqual({ domain: 'example.com', preparation: { id: 'native-domain-job-id', status: 1, native_extra: false } });
      expect(keywordResearchFixture.domainStatusReads).toBe(0);
      for (const status of [1, 2]) expect((yield* call('keyword_domain_status', { domain: 'example.com', job_id: 'native-domain-job-id' })).data).toEqual({ id: status === 1 ? 'native-domain-job-id' : '', status, native_extra: false });
      expect(keywordResearchFixture.preparations).toBe(1); expect(keywordResearchFixture.domainStatusReads).toBe(2);
      for (const observed of keywordResearchFixture.observed.slice(-2)) expect(observed).toEqual({ method: 'domains.GetStatus', params: { domain: 'example.com', id: 'native-domain-job-id' } });
    }).pipe(Effect.provide(fixtureLayer()))));
    expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('keyword_personal_rotation=retained');
  } finally { keywordResearchFixture.use(); }
});

test('invalid native root replies stop domain preparation before initialization', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['domain-missing-root', 'domain-empty-root', 'domain-bad-root'] as const) {
        keywordResearchFixture.use(scenario);
        const failure = yield* service.report(yield* parseReport('keyword_domain_prepare', { domain: 'example.com', confirm: true })).pipe(Effect.flip);
        expect(failure.message).toContain('No preparation was started');
        expect(keywordResearchFixture.preparations).toBe(0);
        expect(keywordResearchFixture.observed.map(call => call.method)).toEqual(['domains.GetSiteRoot']);
      }
      keywordResearchFixture.use();
      expect((yield* service.report(yield* parseReport('keyword_domain_root', { domain: 'example.com' }))).data).toEqual({ site_root_domain: 'example.com' });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('lost and invalid domain preparation receipts never replay a committed initialization', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['domain-lost-init', 'domain-missing-id', 'domain-unknown-state'] as const) {
        keywordResearchFixture.use(scenario);
        const failure = yield* service.report(yield* parseReport('keyword_domain_prepare', { domain: 'example.com', confirm: true })).pipe(Effect.flip);
        expect(failure.message).toContain('before another preparation'); expect(failure.message).not.toContain('fixture-secret');
        expect(keywordResearchFixture.preparations).toBe(1); expect(keywordResearchFixture.domainStatusReads).toBe(0);
        expect(keywordResearchFixture.observed.map(call => call.method)).toEqual(['domains.GetSiteRoot', 'domains.GetStatus']);
        expect((yield* service.report(yield* parseReport('keyword_domain_suggestions', {}))).data).toHaveProperty('history');
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('failed domain status and native permission errors do not initialize a replacement job', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => service.report(request)));
      keywordResearchFixture.use();
      const missing = yield* call('keyword_domain_status', { domain: 'example.com', job_id: 'nonexistent-verification-job' }).pipe(Effect.flip);
      expect(missing).toMatchObject({ _tag: 'ReportError', providerCode: -10401 });
      expect(keywordResearchFixture.preparations).toBe(0); expect(keywordResearchFixture.domainStatusReads).toBe(1);
      expect(keywordResearchFixture.observed).toEqual([{ method: 'domains.GetStatus', params: { domain: 'example.com', id: 'nonexistent-verification-job' } }]);
      for (const [scenario, providerCode] of [['denied', -32002], ['rate-limited', -32003]] as const) {
        keywordResearchFixture.use(scenario);
        const failure = yield* call('keyword_domain_prepare', { domain: 'example.com', confirm: true }).pipe(Effect.flip);
        expect(failure).toMatchObject({ _tag: 'ReportError', providerCode }); expect(failure.message).not.toContain('fixture-secret');
        expect(keywordResearchFixture.preparations).toBe(1); expect(keywordResearchFixture.domainStatusReads).toBe(0);
      }
      keywordResearchFixture.use('domain-lost-status');
      yield* call('keyword_domain_prepare', { domain: 'example.com', confirm: true });
      yield* call('keyword_domain_status', { domain: 'example.com', job_id: 'native-domain-job-id' }).pipe(Effect.flip);
      expect(keywordResearchFixture.preparations).toBe(1); expect(keywordResearchFixture.domainStatusReads).toBe(1);
      expect((yield* call('keyword_domain_root', { domain: 'example.com' })).data).toHaveProperty('site_root_domain');
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('prepared-domain research preserves zero metrics and all 106 native SERP rows without initialization', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush, selected = { keyword: keywordFixturePhrase, domain: 'example.com' };
    const call = (name: string, extra: Query = {}) => parseReport(name, { ...selected, ...extra }).pipe(Effect.flatMap(request => service.report(request)));
    expect((yield* call('keyword_overview', { device: 'mobile' })).data).toMatchObject({ domain_difficulty: 0, domain_traffic: 123 });
    expect((yield* call('keyword_countries')).data).toMatchObject([{ domain_difficulty: 0 }, { domain_difficulty: 0 }]);
    expect((yield* call('keyword_ideas')).data).toMatchObject([{ domain_difficulty: 0 }]);
    expect((yield* call('keyword_ideas_summary')).data).toEqual({ total: 30, total_volume: 0 });
    expect((yield* call('keyword_clusters')).data).toEqual([{ name: 'TypeScript libraries', intents: [0] }]);
    const serp = (yield* call('keyword_serp', { limit: 1000 })).data;
    expect(serp).toHaveLength(106); expect(serp).toMatchObject(expect.arrayContaining([{ position: 100, domain: 'example.com', url: 'https://example.com/result/105', kind: 4, features: [] }]));
    expect((yield* call('keyword_serp', { limit: 1 })).data).toEqual([{ position: 1, domain: 'example.com', url: 'https://example.com/result/0', kind: 0, features: [] }]);
    for (const observed of keywordResearchFixture.observed) { expect(observed.params.domain).toBe('example.com'); expect(observed.params).not.toHaveProperty('limit'); }
    expect(keywordResearchFixture.preparations).toBe(0); expect(keywordResearchFixture.refreshes).toBe(0);
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('keyword AI reads preserve native countries, zero volumes and sample counts without database fallback', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, query: Query = {}) => parseReport(name, query).pipe(Effect.flatMap(request => service.report(request)));
      keywordResearchFixture.use();
      expect((yield* call('keyword_ai_databases')).data).toEqual(['us', 'uk', 'es']);
      expect((yield* call('keyword_ai_summary', { keyword: keywordFixturePhrase })).data).toEqual({ volume_by_llm: [{ volume: 0, llm: 'aio' }, { volume: 1209244, llm: 'gpt' }], topics_count: 1000 });
      expect((yield* call('keyword_ai_topics', { keyword: keywordFixturePhrase, domain: 'example.com' })).data).toEqual([{ topic: 'Running Shoes and Reviews', volume: 0 }]);
      expect(keywordResearchFixture.observed.at(-1)?.params.domain).toBe('example.com');
      const before = keywordResearchFixture.observed.length;
      const failure = yield* call('keyword_ai_summary', { keyword: keywordFixturePhrase, database: 'zz' }).pipe(Effect.flip);
      expect(failure.message).toContain('HTTP 403'); expect(failure.message).not.toContain('fixture-secret');
      expect(keywordResearchFixture.observed.slice(before)).toEqual([{ method: 'aiSeo.GetTopicsSummary', params: { phrase: keywordFixturePhrase, database: 'zz', device: 0, date: '', location: 0, currency: 'USD' } }]);
      expect((yield* call('keyword_ai_topics', { keyword: keywordFixturePhrase })).data).toHaveLength(1);
      expect(keywordResearchFixture.preparations).toBe(0); expect(keywordResearchFixture.refreshes).toBe(0);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('local keyword reads preserve cached metrics, native location shapes, SERP ordering and domain values without refresh', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    expect((yield* service.report(yield* parseReport('keyword_locations', { input: 'New York' }))).data).toEqual({ history: [{ name: 'California,United States', location: 21137, type: 20 }], results: [{ name: 'New York,United States', location: 21167, type: 20 }] });
    const local = { keyword: keywordFixturePhrase, location_id: 21167 };
    const overview = yield* service.report(yield* parseReport('keyword_local_overview', local));
    expect(overview.data).toMatchObject({ global_metrics: [{ location: 0, results: null, cpc: 4.1 }], local_metrics: { location: 21167, update_status: 0, results: null, serp_id: 'b-g-9223372036854775807' } });
    expect((yield* service.report(yield* parseReport('keyword_local_serp', { ...local, limit: 1 }))).data).toEqual([{ position: 1, kind: 0, domain: 'example.com', url: 'https://example.com/', features: [] }]);
    expect((yield* service.report(yield* parseReport('keyword_local_overview', { ...local, currency: 'EUR' }))).data).toMatchObject({ local_metrics: { cpc: '3.6196808999999996' } });
    const urls = ['https://example.com/one', 'https://example.com/two', 'https://example.com/one'];
    expect((yield* service.report(yield* parseReport('keyword_local_serp_organic_metrics', { ...local, urls }))).data).toEqual([...urls].reverse().map(url => ({ url, keywords_count: 12, traffic: 34 })));
    const domains = ['z.example', 'a.example'];
    expect((yield* service.report(yield* parseReport('keyword_serp_domain_organic_metrics', { keyword: keywordFixturePhrase, domains }))).data).toEqual([{ domain: 'a.example', traffic: 0 }, { domain: 'z.example', traffic: 0 }]);
    expect((yield* service.report(yield* parseReport('keyword_serp_domain_backlink_metrics', { keyword: keywordFixturePhrase, domains }))).data).toEqual([{ domain: 'a.example', authority_score: 58, backlinks_count: 2336444 }, { domain: 'z.example', authority_score: 58, backlinks_count: 2336444 }]);
    expect((yield* service.report(yield* parseReport('keyword_refresh_status', { keywords: [keywordFixturePhrase], location_id: 21167 }))).data).toEqual([]);
    expect(keywordResearchFixture.refreshes).toBe(0); expect(keywordResearchFixture.statusReads).toBe(1);
    for (const call of keywordResearchFixture.observed.filter(call => ['keywords.GetLocalInfo', 'serp.GetURLs', 'serp.GetURLsOrganicMetricsLocal'].includes(call.method))) expect(call.params).toMatchObject({ location: 21167, device: 0, date: '' });
    keywordResearchFixture.use('empty'); expect((yield* service.report(yield* parseReport('keyword_locations', {}))).data).toEqual([]);
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('confirmed keyword refresh preserves the quota receipt and advances status only through explicit reads', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush, selection = { keywords: ['café'], location_id: 21167 };
    const refresh = yield* service.report(yield* parseReport('keyword_refresh', { ...selection, confirm: true }));
    expect(refresh.data).toEqual({ change: { before: 44, delta: 1, limit: 1000 }, phrases: [{ phrase: 'café', database: 'us', location: 21167, update_status: 1 }], native_extra: false });
    expect(keywordResearchFixture.refreshes).toBe(1); expect(keywordResearchFixture.statusReads).toBe(0);
    for (const update_status of [1, 2]) {
      expect((yield* service.report(yield* parseReport('keyword_refresh_status', selection))).data).toEqual([{ phrase: 'café', database: 'us', location: 21167, update_status, status_updated_at: 1792221173, results: null, serp_id: 's-d-99-1017-13394082193748469000' }]);
    }
    expect(keywordResearchFixture.refreshes).toBe(1); expect(keywordResearchFixture.statusReads).toBe(2);
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('lost or invalid keyword refresh receipts retain one committed request and require status readback without replay', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['lost-refresh', 'missing-refresh-receipt'] as const) {
        keywordResearchFixture.use(scenario);
        const selection = { keywords: ['café'] };
        const failed = yield* service.report(yield* parseReport('keyword_refresh', { ...selection, confirm: true })).pipe(Effect.flip);
        expect(failed.message).toContain('keyword-refresh-status'); expect(failed.message).toContain('may have committed'); expect(failed.message).not.toContain('fixture-secret');
        expect(keywordResearchFixture.refreshes).toBe(1); expect(keywordResearchFixture.statusReads).toBe(0);
        expect((yield* service.report(yield* parseReport('keyword_refresh_status', selection))).data).toMatchObject([{ phrase: 'café', update_status: 1 }]);
        expect(keywordResearchFixture.refreshes).toBe(1);
        expect((yield* service.report(yield* parseReport('keyword_local_overview', { keyword: keywordFixturePhrase, location_id: 21167 }))).data).toHaveProperty('local_metrics');
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('keyword refresh quota and permission failures preserve provider codes, redact secrets and keep later reads usable', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const [scenario, code] of [['denied', -32002], ['rate-limited', -32003]] as const) {
        keywordResearchFixture.use(scenario);
        const failed = yield* service.report(yield* parseReport('keyword_refresh', { keywords: ['café'], confirm: true })).pipe(Effect.flip);
        expect(failed._tag).toBe('ReportError');
        if (failed._tag !== 'ReportError') throw Error('Expected native report failure');
        expect(failed.providerCode).toBe(code); expect(failed.message).not.toContain('fixture-secret'); expect(keywordResearchFixture.refreshes).toBe(1);
        expect((yield* service.report(yield* parseReport('keyword_refresh_status', { keywords: ['café'] }))).data).toEqual([]);
      }
      keywordResearchFixture.use('read-failed');
      const failedRead = yield* service.report(yield* parseReport('keyword_local_overview', { keyword: keywordFixturePhrase, location_id: 21167 })).pipe(Effect.flip);
      expect(failedRead.message).toContain('HTTP 403'); expect(keywordResearchFixture.refreshes).toBe(0);
      keywordResearchFixture.use(); expect((yield* service.report(yield* parseReport('keyword_locations', {}))).data).toHaveProperty('results');
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('local SERP exports retain exact native format bodies, bytes and private resources including a pending wait', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush, files = yield* Exports;
      for (const [format, code] of Object.entries({ csv: 1, csv_semicolon: 2, xlsx: 0 })) {
        keywordResearchFixture.use(format === 'csv' ? 'pending' : 'complete');
        const report = yield* service.report(yield* parseReport('keyword_local_serp_export', { keyword: keywordFixturePhrase, location_id: 21167, format }));
        expect(report.artifact).toBeDefined(); if (!report.artifact) throw Error('Missing local export');
        expect(Buffer.from((yield* files.read(report.artifact.uri)).blob, 'base64')).toEqual(keywordResearchFixture.bytes(code));
        expect(keywordResearchFixture.initializations).toBe(1); expect(keywordResearchFixture.waits).toBe(format === 'csv' ? 2 : 1); expect(keywordResearchFixture.downloads).toBe(1); expect(keywordResearchFixture.refreshes).toBe(0);
      }
      expect(yield* files.list()).toHaveLength(3);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('keyword controls, country rows and Bulk Analysis retain native values, context and precision', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const selection = { keyword: keywordFixturePhrase, device: 'mobile', date: '202609', currency: 'EUR' };
    for (const name of ['keyword_overview', 'keyword_ideas', 'keyword_ideas_summary', 'keyword_serp', 'keyword_ads']) {
      const read = yield* service.report(yield* parseReport(name, selection));
      expect(read.authenticated).toBe(true); expect(read.artifact).toBeUndefined();
      if (name === 'keyword_overview') expect(read.data).toMatchObject({ volume: 80, cpc: '3.6196808999999996', serp_id: 'b-g-9223372036854775807' });
    }
    const countries = yield* service.report(yield* parseReport('keyword_countries', selection));
    expect(countries.data).toMatchObject([{ database: 'us', volume: 80 }, { database: 'uk', volume: 20 }]);
    const bulk = yield* service.report(yield* parseReport('keyword_bulk', { keywords: ['café', 'one, whole phrase'], currency: 'EUR', domain: 'github.com' }));
    expect(bulk.data).toMatchObject([{ phrase: 'café', cpc: '3.6196808999999996', domain_difficulty: 0, domain_traffic: 123 }, { phrase: 'one, whole phrase' }]);
    for (const call of keywordResearchFixture.observed.filter(x => x.method !== 'keywords.GetBulk')) expect(call.params).toMatchObject({ phrase: keywordFixturePhrase, device: 1, date: '202609', currency: 'EUR', location: 0 });
  }).pipe(Effect.provide(fixtureLayer()))));
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('keyword_read_rotation=retained');
});

test('SERP enrichment preserves provider URL ordering and Product Listing Ads retain their client limit', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush; const urls = ['https://example.com/first', 'https://example.com/second'];
    for (const name of ['keyword_serp_organic_metrics', 'keyword_serp_backlink_metrics']) {
      const read = yield* service.report(yield* parseReport(name, { keyword: keywordFixturePhrase, urls }));
      expect(read.data).toMatchObject([{ url: urls[1] }, { url: urls[0] }]);
      expect(keywordResearchFixture.observed.at(-1)?.params).toMatchObject({ urls, phrase: keywordFixturePhrase, device: 0, date: '', currency: 'USD' });
    }
    const ads = yield* service.report(yield* parseReport('keyword_product_ads', { keyword: keywordFixturePhrase, limit: 1 }));
    expect(ads.data).toEqual([{ title: 'café shoes', url: 'https://example.com/product', price: 42 }]);
    keywordResearchFixture.use('empty');
    const emptyReads: [string, Query][] = [['keyword_bulk', { keywords: ['missing'] }], ['keyword_countries', { keyword: keywordFixturePhrase }], ['keyword_product_ads', { keyword: keywordFixturePhrase }]];
    for (const [name, query] of emptyReads) {
      expect((yield* service.report(yield* parseReport(name, query))).data).toEqual([]);
    }
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('keyword provider failures and malformed country data remain errors while later reads still work', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      keywordResearchFixture.use('read-failed');
      const denied = yield* service.report(yield* parseReport('keyword_bulk', { keywords: ['café'] })).pipe(Effect.flip);
      expect(denied.message).toContain('HTTP 403'); expect(denied.message).not.toContain('fixture-secret');
      keywordResearchFixture.use('countries-malformed');
      const malformed = yield* service.report(yield* parseReport('keyword_countries', { keyword: keywordFixturePhrase })).pipe(Effect.flip);
      expect(malformed.message).toContain('did not return keyword country metrics');
      keywordResearchFixture.use();
      expect((yield* service.report(yield* parseReport('keyword_bulk', { keywords: ['café'] }))).data).toMatchObject([{ phrase: 'café' }]);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('native keyword bulk and SERP exports preserve CSV, semicolon CSV and real XLSX bytes as private MCP resources', async () => {
  keywordResearchFixture.use();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush; const files = yield* Exports;
    for (const [format, code] of Object.entries({ csv: 1, csv_semicolon: 2, xlsx: 0 })) {
      for (const name of ['keyword_bulk_export', 'keyword_serp_export', 'keyword_serp_domains_export']) {
        const query: Query = name === 'keyword_bulk_export' ? { keywords: ['café'], format } : { keyword: keywordFixturePhrase, device: 'mobile', date: '202609', format };
        const read = yield* service.report(yield* parseReport(name, query));
        expect(read.data).toBeNull(); expect(read.artifact).toBeDefined(); if (!read.artifact) throw Error('Missing export');
        expect(read.artifact.filename).toBe('keyword native.' + (code === 0 ? 'xlsx' : 'csv'));
        expect(read.artifact.mime_type).toBe(code === 0 ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv');
        const bytes = Buffer.from((yield* files.read(read.artifact.uri)).blob, 'base64'); expect(bytes).toEqual(keywordResearchFixture.bytes(code));
        if (code === 0) expect(Object.keys(unzipSync(bytes))).toContain('xl/worksheets/sheet1.xml');
      }
    }
    expect(yield* files.list()).toHaveLength(9);
  }).pipe(Effect.provide(fixtureLayer()))));
  expect(keywordResearchFixture.initializations).toBe(9); expect(keywordResearchFixture.downloads).toBe(9);
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('keyword_download_rotation=retained');
}, 30000);

test('only native pending code zero retries the existing keyword export wait, with no duplicate creation', async () => {
  keywordResearchFixture.use('pending');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    expect((yield* (yield* Semrush).report(yield* parseReport('keyword_bulk_export', { keywords: ['café'] }))).artifact).toBeDefined();
  }).pipe(Effect.provide(fixtureLayer()))));
  expect(keywordResearchFixture.initializations).toBe(1); expect(keywordResearchFixture.waits).toBe(2); expect(keywordResearchFixture.downloads).toBe(1);
});

test('keyword export permission, rate-limit and exhausted pending errors expose no artifacts or private job identifiers', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['denied', 'rate-limited', 'forever'] as const) {
        keywordResearchFixture.use(scenario);
        const error = yield* service.report(yield* parseReport('keyword_bulk_export', { keywords: ['café'] })).pipe(Effect.flip);
        expect(error.message).not.toContain('private-keyword-export-token'); expect(error.message).not.toContain('fixture-secret');
        expect(keywordResearchFixture.initializations).toBe(1); expect(keywordResearchFixture.waits).toBe(scenario === 'forever' ? 3 : 1); expect(keywordResearchFixture.downloads).toBe(0);
        expect(yield* (yield* Exports).list()).toEqual([]);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
}, 30000);

test('keyword export creation with a missing identifier or lost response is never replayed', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['missing-id', 'lost-init'] as const) {
        keywordResearchFixture.use(scenario);
        const error = yield* service.report(yield* parseReport('keyword_bulk_export', { keywords: ['café'] })).pipe(Effect.flip);
        expect(error.message).toContain(scenario === 'missing-id' ? 'export identifier' : 'browser request failed');
        expect(keywordResearchFixture.initializations).toBe(1); expect(keywordResearchFixture.waits).toBe(0); expect(keywordResearchFixture.downloads).toBe(0);
        expect(yield* (yield* Exports).list()).toEqual([]);
        expect((yield* service.report(yield* parseReport('keyword_bulk', { keywords: ['café'] }))).authenticated).toBe(true);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { keywordResearchFixture.use(); }
});

test('cancelling a pending keyword export or file stream releases its client, artifacts and report slot', async () => {
  try {
    for (const scenario of ['forever', 'slow-download'] as const) {
      keywordResearchFixture.use(scenario);
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* Semrush;
        const fiber = yield* Effect.forkChild(service.report(yield* parseReport('keyword_bulk_export', { keywords: ['café'] })));
        yield* Effect.promise(scenario === 'forever' ? keywordResearchFixture.waiting : keywordResearchFixture.downloading).pipe(Effect.timeout('5 seconds'));
        yield* Fiber.interrupt(fiber).pipe(Effect.timeout('5 seconds'));
        if (scenario === 'slow-download') yield* Effect.promise(keywordResearchFixture.disconnected).pipe(Effect.timeout('5 seconds'));
        expect(yield* (yield* Exports).list()).toEqual([]);
        expect((yield* service.report(yield* parseReport('keyword_bulk', { keywords: ['café'] }))).authenticated).toBe(true);
      }).pipe(Effect.provide(fixtureLayer()))));
    }
  } finally { keywordResearchFixture.use(); }
}, 30000);

test('On Page reports retain native rows, orphan data, snapshot details and precise backlink counts', async () => {
  onpageFixture.use('configured');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const cases: [string, Query, Schema.Json][] = [
      ['onpage_campaigns', {}, [{ id: 793, operational: true, landings_count: 1, last_collect_date: 1792195200, running_landings_count: 0 }]],
      ['onpage_info', { campaign_id: 793 }, { id: 793, operational: true, running_landings_count: 0, landings_count: 1, last_collect_date: 1792195200 }],
      ['onpage_limits', { campaign_id: 793 }, { used: 0, max: 800 }],
      ['onpage_settings', { campaign_id: 793 }, onpageFixture.settings],
      ['onpage_overview', { campaign_id: 793 }, { ideas: { content: 1 }, pages: [{ id: onpagePageId, url: 'https://example.com/' }], volume: 0, optimized: false, crawl_accessible: true }],
      ['onpage_progress', { campaign_id: 793 }, { ideas: [{ category: 'content', done: false, count: 1 }], optimized: false, trend: [{ date: '2026-10-17', traffic: 0, keywords: 1 }] }],
      ['onpage_serps', { campaign_id: 793 }, [{ keyword: 'café', status: 200 }, { keyword: 'unavailable', status: 204 }]],
      ['onpage_serp', { campaign_id: 793, keyword: 'café' }, { landing: 'https://example.com/', summary: { keyword: 'café', volume: 0 }, serp: [] }],
    ];
    for (const [name, query, expected] of cases) expect((yield* service.report(yield* parseReport(name, query))).data).toEqual(expected);
    const pages = yield* service.report(yield* parseReport('onpage_pages', { campaign_id: 793 }));
    expect(pages.data).toEqual([...onpageFixture.pages, { id: '000000000000000000000000', url: 'ORPHANS', keywords: [], need_re_run: false, status: 'COMPLETED', snapshot: null }]);
    const ids = { campaign_id: 793, page_id: onpagePageId, snapshot_id: onpageSnapshotId };
    expect((yield* service.report(yield* parseReport('onpage_page_keywords', ids))).data).toEqual([{ phrase: 'café', volume: 0 }]);
    expect((yield* service.report(yield* parseReport('onpage_page_ideas', ids))).data).toEqual({ language: 'english', is_supported_language: true, ideas: { content: [], strategy: [] } });
    const detailResults = {
      density: { url: 'https://example.com/', density_summaries: [], tfidf_summaries: [], word_density_summaries: [], last_collect_date: '2026-10-17' },
      related: { related_words: [{ word: 'native', weight: 0 }] }, backlinks: [{ domain: 'example.org', backlinks_count: '9223372036854775807' }],
      length: { url: 'https://example.com/', length_summaries: [] }, video: [{ keyword: 'café', has_video: false }], readability: [{ keyword: 'café', readability_score: 0 }],
    } satisfies Record<string, Schema.Json>;
    for (const [detail, expected] of Object.entries(detailResults)) {
      const report = yield* service.report(yield* parseReport('onpage_page_details', { ...ids, detail }));
      expect(report.data).toEqual(expected);
    }
    const keyword = 'café / one phrase';
    const keywordResults = { serp: { urls: ['https://example.com/'] }, length: { url: 'https://example.com/', keyword, expanded_lengths: [] }, video: { keyword, expanded_videos: [] } } satisfies Record<string, Schema.Json>;
    for (const [detail, expected] of Object.entries(keywordResults)) {
      const report = yield* service.report(yield* parseReport('onpage_page_keyword_details', { ...ids, detail, keyword }));
      expect(report.data).toEqual(expected);
    }
    expect(onpageFixture.writes).toBe(0);
    expect(onpageFixture.observed.every(request => request.method === 'GET')).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('onpage_rotation=retained');
});

test('On Page setup acknowledges empty native success without launching and refuses a second setup', async () => {
  onpageFixture.use('unconfigured');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush; const input = { campaign_id: 793, landings: [{ url: 'https://example.com/', keywords: ['café'] }], confirm: true };
      expect((yield* service.report(yield* parseReport('onpage_create', input))).data).toBeNull();
      expect(onpageFixture.runs).toBe(0); expect(onpageFixture.writes).toBe(1);
      expect((yield* service.report(yield* parseReport('onpage_info', { campaign_id: 793 }))).data).toMatchObject({ operational: true, landings_count: 1, last_collect_date: 0 });
      expect((yield* service.report(yield* parseReport('onpage_settings', { campaign_id: 793 }))).data).toMatchObject({ notify: false, schedule: 0, default_agent: true, location: { country: 'us' } });
      const duplicate = yield* service.report(yield* parseReport('onpage_create', input)).pipe(Effect.flip);
      expect(duplicate.message).toContain('already has On Page'); expect(onpageFixture.writes).toBe(1);
    }).pipe(Effect.provide(fixtureLayer()))));
    for (const scenario of ['busy', 'missing-campaigns'] as const) {
      onpageFixture.use(scenario);
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const error = yield* (yield* Semrush).report(yield* parseReport('onpage_create', { campaign_id: 793, landings: [{ url: 'https://example.com/', keywords: ['café'] }], confirm: true })).pipe(Effect.flip);
        expect(error.message).toContain(scenario === 'busy' ? 'already has On Page' : 'absent'); expect(onpageFixture.writes).toBe(0);
      }).pipe(Effect.provide(fixtureLayer()))));
    }
  } finally { onpageFixture.use('configured'); }
});

test('On Page partial settings preserve saved location and missing metadata fails before saving', async () => {
  onpageFixture.use('configured');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush; const before = structuredClone(onpageFixture.settings);
      const changed = yield* service.report(yield* parseReport('onpage_configure', { campaign_id: 793, crawler: 'googlebot', timezone_offset: 60, confirm: true }));
      expect(changed.data).toEqual({ ...before, default_agent: false, timezone: 60 }); expect(onpageFixture.runs).toBe(0);
      expect(onpageFixture.observed.filter(request => request.path.endsWith('/settings/')).map(request => request.method)).toEqual(['GET', 'PUT']);
      onpageFixture.use('missing-settings');
      const error = yield* service.report(yield* parseReport('onpage_configure', { campaign_id: 793, notify: true, confirm: true })).pipe(Effect.flip);
      expect(error.message).toContain('metadata is unavailable'); expect(onpageFixture.writes).toBe(0);
      expect((yield* service.report(yield* parseReport('onpage_pages', { campaign_id: 793 }))).authenticated).toBe(true);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { onpageFixture.use('configured'); }
});

test('On Page page and location lifecycle uses JSON deletion and never implicitly starts analysis', async () => {
  onpageFixture.use('configured');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const created = yield* service.report(yield* parseReport('onpage_page_add', { campaign_id: 793, url: 'https://example.com/two', keywords: ['café'], confirm: true }));
      const added = onpageFixture.pages.find(page => page.url.endsWith('/two')); if (!added) throw Error('Missing created page');
      expect(created.data).toMatchObject({ id: added.id, status: 'COMPLETED' }); expect(onpageFixture.pages).toHaveLength(1);
      expect((yield* service.report(yield* parseReport('onpage_page_update', { campaign_id: 793, page_id: added.id, url: 'http://example.com/two', keywords: ['café'], switch_scheme: true, confirm: true }))).data).toMatchObject({ id: added.id, url: 'http://example.com/two' });
      expect((yield* service.report(yield* parseReport('onpage_pages_add', { campaign_id: 793, landings: [{ url: 'https://example.com/three', keywords: ['third'] }], confirm: true }))).data).toBeNull();
      expect((yield* service.report(yield* parseReport('onpage_location_set', { campaign_id: 793, country_code: 'es', location: 'Spain', language: 'es', device: 'mobile', confirm: true }))).data).toEqual({ country: 'es', location: 'Spain', language: 'es', device: 'phone' });
      expect(onpageFixture.runs).toBe(0);
      expect((yield* service.report(yield* parseReport('onpage_page_run', { campaign_id: 793, page_id: added.id, confirm: true }))).data).toBeNull(); expect(onpageFixture.runs).toBe(1);
      expect((yield* service.report(yield* parseReport('onpage_pages_delete', { campaign_id: 793, page_ids: [added.id], confirm: true }))).data).toBeNull();
      expect(onpageFixture.pages.map(page => page.url)).toEqual(['https://example.com/three']);
      expect(onpageFixture.observed.find(request => request.method === 'DELETE')?.body).toEqual({ ids: [added.id] });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { onpageFixture.use('configured'); }
});

test('On Page launch derives the native product selector and missing metadata cannot send a launch', async () => {
  try {
    for (const product of [true, false, null]) {
      onpageFixture.use('configured'); onpageFixture.product(product);
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* Semrush; const launch = service.report(yield* parseReport('onpage_run', { campaign_id: 793, confirm: true }));
        if (product === null) { const error = yield* launch.pipe(Effect.flip); expect(error.message).toContain('No launch was sent'); expect(onpageFixture.writes).toBe(0); }
        else { expect((yield* launch).data).toBeNull(); expect(onpageFixture.runs).toBe(1); }
        expect((yield* service.report(yield* parseReport('onpage_limits', { campaign_id: 793 }))).data).toMatchObject({ max: 800 });
      }).pipe(Effect.provide(fixtureLayer()))));
    }
  } finally { onpageFixture.use('configured'); }
});

test('On Page native denials, business errors and stale snapshots remain errors without following another snapshot', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      for (const scenario of ['denied', 'business-error', 'stale'] as const) {
        onpageFixture.use(scenario);
        const error = yield* service.report(yield* parseReport('onpage_page_ideas', { campaign_id: 793, page_id: onpagePageId, snapshot_id: onpageSnapshotId })).pipe(Effect.flip);
        expect(error.message).not.toContain('fixture-secret'); expect(onpageFixture.observed).toHaveLength(1); expect(onpageFixture.writes).toBe(0);
        onpageFixture.use('configured'); expect((yield* service.report(yield* parseReport('onpage_pages', { campaign_id: 793 }))).authenticated).toBe(true);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { onpageFixture.use('configured'); }
});

test('On Page committed writes with lost or unexpected receipts never replay and later readback shows their state', async () => {
  try {
    for (const scenario of ['lost-create', 'unexpected-create', 'lost-settings', 'lost-page'] as const) {
      onpageFixture.use(scenario);
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* Semrush;
        const input: [string, Query] = scenario === 'lost-settings' ? ['onpage_configure', { campaign_id: 793, notify: true, confirm: true }]
          : scenario === 'lost-page' ? ['onpage_page_add', { campaign_id: 793, url: 'https://example.com/new', keywords: ['new phrase'], confirm: true }]
          : ['onpage_create', { campaign_id: 793, landings: [{ url: 'https://example.com/', keywords: ['café'] }], confirm: true }];
        const error = yield* service.report(yield* parseReport(...input)).pipe(Effect.flip);
        expect(error.message).toContain('may have committed'); expect(onpageFixture.writes).toBe(1);
        expect((yield* service.report(yield* parseReport('onpage_info', { campaign_id: 793 }))).data).toMatchObject({ operational: true });
        if (scenario === 'lost-settings') expect((yield* service.report(yield* parseReport('onpage_settings', { campaign_id: 793 }))).data).toMatchObject({ notify: true });
        if (scenario === 'lost-page') expect(onpageFixture.pages.some(page => page.url === 'https://example.com/new')).toBe(true);
        expect(onpageFixture.writes).toBe(1);
      }).pipe(Effect.provide(fixtureLayer()))));
    }
  } finally { onpageFixture.use('configured'); }
});

test('RPC and tracking failure envelopes stay errors while native page ERROR status remains report data', async () => {
  onpageFixture.use('envelope-failure');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const requests: [string, Query][] = [['keyword_overview', { keyword: 'fixture' }], ['position_info', { campaign_id: '789_42' }]];
      for (const [name, query] of requests) {
        const error = yield* service.report(yield* parseReport(name, query)).pipe(Effect.flip);
        expect(error.message).toContain('rejected'); expect(error.message).not.toContain('fixture-secret');
      }
      onpageFixture.use('analysis-error');
      const updated = yield* service.report(yield* parseReport('onpage_page_update', { campaign_id: 793, page_id: onpagePageId, url: 'https://example.com/', keywords: ['café'], confirm: true }));
      expect(updated.data).toMatchObject({ status: 'ERROR' }); expect(onpageFixture.runs).toBe(0);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { onpageFixture.use('configured'); }
});

test('Core Web Vitals reads retain native measurements, signed URL IDs, history ordering and cookie rotation', async () => {
  webVitalsFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    for (const suffix of ['status', 'overview', 'pages', 'improvements', 'settings']) {
      const result = yield* semrush.report(yield* parseReport('audit_web_vitals_' + suffix, { campaign_id: 793 }));
      expect(result.artifact).toBeUndefined(); expect(result.authenticated).toBe(true);
      if (suffix === 'pages') expect(result.data).toHaveProperty('pageMetricsValues.0.urlId', negativeURLId);
      if (suffix === 'overview') expect(result.data).toHaveProperty('pageStatistics.0.date', 2000);
    }
    for (const url_id of [negativeURLId, positiveURLId]) {
      const history = yield* semrush.report(yield* parseReport('audit_web_vitals_history', { campaign_id: 793, url_id }));
      expect(history.data).toHaveProperty('lcpData.values.0.date', 1000);
      const recommendation = yield* semrush.report(yield* parseReport('audit_web_vitals_recommendations', { campaign_id: 793, url_id }));
      expect(recommendation.data).toHaveProperty('recommendations.lcpData.improvements.items.0.auditId', 'render-blocking-resources');
    }
    webVitalsFixture.use('empty');
    expect((yield* semrush.report(yield* parseReport('audit_web_vitals_pages', { campaign_id: 793 }))).data).toHaveProperty('pageMetricsValues', []);
    expect((yield* semrush.report(yield* parseReport('audit_web_vitals_recommendations', { campaign_id: 793, url_id: negativeURLId }))).data).toHaveProperty('recommendations.lcpData.improvements.items', []);
  }).pipe(Effect.provide(fixtureLayer()))));
  expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('web_vitals_rotation=retained');
  webVitalsFixture.reset();
});

test('Core Web Vitals URL replacement, replacement of prior values round-trip without launching a crawl', async () => {
  webVitalsFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    for (const urls of [['https://example.com/', 'https://example.com/two'], ['https://example.com/two']]) {
      expect((yield* semrush.report(yield* parseReport('audit_web_vitals_settings_set', { campaign_id: 793, urls, confirm: true }))).data).toMatchObject({ urls, changed: true });
      expect((yield* semrush.report(yield* parseReport('audit_web_vitals_settings', { campaign_id: 793 }))).data).toMatchObject({ urls, changed: true });
    }
  }).pipe(Effect.provide(fixtureLayer()))));
  expect(webVitalsFixture.writes).toBe(2);
});

test('Core Web Vitals partial and missing receipts fail after one committed write and expose the actual saved list on inspection', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const urls = ['https://example.com/', 'https://example.com/two'];
      for (const scenario of ['partial', 'malformed'] as const) {
        webVitalsFixture.reset(); webVitalsFixture.use(scenario);
        const error = yield* semrush.report(yield* parseReport('audit_web_vitals_settings_set', { campaign_id: 793, urls, confirm: true })).pipe(Effect.flip);
        expect(error.message).toContain('Read audit-web-vitals-settings');
        expect(webVitalsFixture.writes).toBe(1);
        webVitalsFixture.use('complete');
        expect((yield* semrush.report(yield* parseReport('audit_web_vitals_settings', { campaign_id: 793 }))).data).toHaveProperty('urls', scenario === 'partial' ? urls.slice(0, 1) : urls);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { webVitalsFixture.reset(); }
});

test('a dropped Core Web Vitals replacement response is not retried and leaves the committed selection inspectable', async () => {
  webVitalsFixture.reset(); webVitalsFixture.use('dropped');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush; const urls = ['https://example.com/replaced'];
      const error = yield* semrush.report(yield* parseReport('audit_web_vitals_settings_set', { campaign_id: 793, urls, confirm: true })).pipe(Effect.flip);
      expect(error.message).toContain('browser request failed'); expect(webVitalsFixture.writes).toBe(1);
      webVitalsFixture.use('complete');
      expect((yield* semrush.report(yield* parseReport('audit_web_vitals_settings', { campaign_id: 793 }))).data).toHaveProperty('urls', urls);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { webVitalsFixture.reset(); }
});

test('Core Web Vitals provider denials, business errors and missing initial properties stay errors without blocking later reads', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const [scenario, expected] of [['denied', 'HTTP 403'], ['business-error', 'Semrush report failed'], ['uninitialized', 'HTTP 404']] as const) {
        webVitalsFixture.use(scenario);
        const error = yield* semrush.report(yield* parseReport('audit_web_vitals_settings', { campaign_id: 793 })).pipe(Effect.flip);
        expect(error.message).toContain(expected); expect(error.message).not.toContain('fixture-secret');
      }
      webVitalsFixture.use('complete');
      expect((yield* semrush.report(yield* parseReport('audit_web_vitals_status', { campaign_id: 793 }))).data).toHaveProperty('score', 100);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { webVitalsFixture.reset(); }
});

test('My Reports overview preserves native limits, first-page metadata and cookie rotation without downloading tasks', async () => {
  reportingFixture.use('complete');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const response = yield* semrush.report(yield* parseReport('reporting_overview', {}));
      expect(response.data).toMatchObject({ productTier: 'Tier2', isPaid: false, isCommonPrivacyAccepted: false,
        limits: { reports_essential: { limit: 3 } }, reports: { totalCount: 38, nodes: expect.any(Array) } });
      expect(response.artifact).toBeUndefined();
      expect(response.data).toHaveProperty('reports.nodes.length', 30);
      expect(response.data).toHaveProperty('reports.nodes.0.readyTasks.0.filename', 'report-1.pdf');
      expect(response.data).toHaveProperty('reports.nodes.0.schedule.isScheduled', true);
      reportingFixture.use('empty');
      expect((yield* semrush.report(yield* parseReport('reporting_overview', {}))).data).toMatchObject({ reports: { totalCount: 0, nodes: [] } });
    }).pipe(Effect.provide(fixtureLayer()))));
    expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('reporting_rotation=retained');
  } finally { reportingFixture.use('complete'); }
});

test('My Reports pages preserve row order and combine native ownership, branding, schedule and name filters', async () => {
  reportingFixture.use('complete');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const next = yield* semrush.report(yield* parseReport('reporting_overview', { offset: 30 }));
    expect(next.data).toHaveProperty('reports.totalCount', 38);
    expect(next.data).toHaveProperty('reports.nodes.length', 8);
    expect(next.data).toHaveProperty('reports.nodes.0.id', 31);
    const end = yield* semrush.report(yield* parseReport('reporting_overview', { offset: 60 }));
    expect(end.data).toHaveProperty('reports', { totalCount: 38, nodes: [] });
    const selected = yield* semrush.report(yield* parseReport('reporting_overview', {
      ownership: 'shared', branding: 'standard', schedule: 'weekly', search: 'report 1',
    }));
    expect(selected.data).toHaveProperty('reports.totalCount', 1);
    expect(selected.data).toHaveProperty('reports.nodes.length', 1);
    expect(selected.data).toHaveProperty('reports.nodes.0.id', 14);
    const own = yield* semrush.report(yield* parseReport('reporting_overview', { ownership: 'own', branding: 'branded', schedule: 'daily' }));
    expect(own.data).toHaveProperty('reports.totalCount', 3);
    const team = yield* semrush.report(yield* parseReport('reporting_overview', { ownership: 'team', schedule: 'monthly' }));
    expect(team.data).toHaveProperty('reports.totalCount', 4);
    const missing = yield* semrush.report(yield* parseReport('reporting_overview', { search: 'missing report' }));
    expect(missing.data).toHaveProperty('reports', { totalCount: 0, nodes: [] });
    expect(missing.artifact).toBeUndefined();
  }).pipe(Effect.provide(fixtureLayer()))));
});

test('My Reports fails on partial GraphQL errors, missing account data and denied access while preserving later reads', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const [scenario, expected] of [['partial', 'My Reports query failed'], ['errors', 'My Reports query failed'],
        ['missing', 'did not return account data'], ['malformed-errors', 'did not return account data'], ['denied', 'HTTP 403']] as const) {
        reportingFixture.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_overview', {})).pipe(Effect.flip);
        expect(error.message).toContain(expected); expect(error.message).not.toContain('fixture-secret');
      }
      reportingFixture.use('complete');
      expect((yield* semrush.report(yield* parseReport('reporting_overview', {}))).data).toHaveProperty('reports.totalCount', 38);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.use('complete'); }
});

test('custom templates create reports, manage access and restore without changing existing templates', async () => {
  reportingTemplateFixture.reset();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const call = (name: string, query: Query) => Effect.gen(function* () { return yield* semrush.report(yield* parseReport(name, query)); });
      expect((yield* call('reporting_templates', {})).data).toMatchObject({ total: 1, page: 1, limit: 30, templates: [{ id: 501, name: 'Existing template' }] });
      expect((yield* call('reporting_template_create', { report_id: 71, name: 'Reusable report', confirm: true })).data).toMatchObject({ template: { id: 502 } });
      const template = { template_id: 502, confirm: true };
      expect((yield* call('reporting_template_report', { ...template, name: 'New report' })).data).toMatchObject({ document: { id: 72, isScheduled: false, recipients: null } });
      const sharing = { ...template, emails: ['recipient@example.com'] };
      yield* call('reporting_template_share', sharing);
      expect((yield* call('reporting_templates', { search: 'Reusable' })).data).toMatchObject({ total: 1, templates: [{ id: 502, sharedWith: ['recipient@example.com'] }] });
      yield* call('reporting_template_share_revoke', sharing);
      expect((yield* call('reporting_templates', { search: 'Reusable' })).data).toMatchObject({ templates: [{ sharedWith: [] }] });
      yield* call('reporting_template_delete', template);
      expect((yield* call('reporting_templates', {})).data).toMatchObject({ total: 1, templates: [{ id: 501, name: 'Existing template' }] });
      yield* call('reporting_template_restore', template);
      expect((yield* call('reporting_templates', {})).data).toMatchObject({ total: 2, templates: [{ id: 501 }, { id: 502, name: 'Reusable report' }] });
      expect((yield* call('reporting_templates', { search: 'a & b?' })).data).toMatchObject({ total: 0, templates: [] });
      expect((yield* call('reporting_templates', { page: 2 })).data).toMatchObject({ page: 2, templates: [] });
      expect(reportingTemplateFixture.writes()).toBe(6);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingTemplateFixture.reset(); }
}, 30000);

test('custom template writes reject denied, lost and incomplete receipts without replay', async () => {
  const actions: [string, Query][] = [
    ['reporting_template_create', { report_id: 71, name: 'Reusable report' }],
    ['reporting_template_report', { template_id: 501, name: 'New report' }],
    ['reporting_template_share', { template_id: 501, emails: ['recipient@example.com'] }],
    ['reporting_template_share_revoke', { template_id: 501, emails: ['recipient@example.com'] }],
    ['reporting_template_delete', { template_id: 501 }],
    ['reporting_template_restore', { template_id: 501 }],
  ];
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['denied', 'lost', 'missing', 'partial'] as const) {
        for (const [name, query] of actions) {
          reportingTemplateFixture.reset(scenario);
          const error = yield* semrush.report(yield* parseReport(name, { ...query, confirm: true })).pipe(Effect.flip);
          expect(error.message).toContain('reporting-templates');
          expect(error.message).not.toContain('fixture-secret');
          expect(reportingTemplateFixture.writes()).toBe(1);
          const total = scenario === 'denied' ? 1 : name === 'reporting_template_create' ? 2 : name === 'reporting_template_delete' ? 0 : 1;
          expect((yield* semrush.report(yield* parseReport('reporting_templates', {}))).data).toMatchObject({ total });
        }
      }
      reportingTemplateFixture.reset('wrong-id');
      expect((yield* semrush.report(yield* parseReport('reporting_template_delete', { template_id: 501, confirm: true })).pipe(Effect.flip)).message).toContain('reporting-templates');
      expect(reportingTemplateFixture.writes()).toBe(1);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingTemplateFixture.reset(); }
}, 30000);

test('custom template listing rejects missing native pagination instead of returning an empty success', async () => {
  reportingTemplateFixture.reset('bad-list');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const error = yield* semrush.report(yield* parseReport('reporting_templates', {})).pipe(Effect.flip);
      expect(error.message).toContain('reporting-templates');
      expect(reportingTemplateFixture.writes()).toBe(0);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingTemplateFixture.reset(); }
}, 30000);

test('My Reports lifecycle creates, saves, clones and generates once, and reads existing PDF bytes privately', async () => {
  reportingFixture.lifecycle.reset();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const created = yield* semrush.report(yield* parseReport('reporting_create', { template: 'tc_organic_search_positions', parameters: { domain: 'example.com', database: 'us' }, confirm: true }));
      expect(created.data).toEqual({ status: 'success', userDocumentId: 72 });
      const original = yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }));
      expect(original.data).toEqual({ status: 'success', document: reportingDocument });
      const document = { ...structuredClone(reportingDocument), name: 'Updated report' };
      const saved = yield* semrush.report(yield* parseReport('reporting_save', { document, confirm: true }));
      expect(saved.data).toEqual({ status: 'success', documentId: 71, name: 'Updated report' });
      const cloned = yield* semrush.report(yield* parseReport('reporting_clone', { report_id: 71, name: 'Cloned report', confirm: true }));
      expect(cloned.data).toEqual({ status: 'success', document: { id: 73, name: 'Cloned report' } });
      const generated = yield* semrush.report(yield* parseReport('reporting_generate', { report_id: 71, confirm: true }));
      expect(generated.data).toEqual({ id: '1001', state: 'ready' });
      const tasks = yield* semrush.report(yield* parseReport('reporting_tasks', { report_id: 71 }));
      expect(tasks.data).toHaveProperty('reports.nodes.0.tasks.0.id', '1001');
      expect(JSON.stringify(tasks)).not.toContain('private-capability');
      const downloaded = yield* semrush.report(yield* parseReport('reporting_download', { report_id: 71, task_id: '1001' }));
      expect(downloaded.artifact).toMatchObject({ filename: 'report.pdf', mime_type: 'application/pdf', size_bytes: reportingPDFBytes.length });
      const exports = yield* Exports;
      const resource = yield* exports.read(downloaded.artifact?.uri ?? 'missing');
      expect(Buffer.from(resource.blob, 'base64')).toEqual(reportingPDFBytes);
      expect(JSON.stringify(downloaded)).not.toContain('private-capability');
      expect((yield* semrush.report(yield* parseReport('reporting_delete', { report_ids: [72, 73], confirm: true }))).data).toBe(true);
      expect(reportingFixture.lifecycle.counts()).toEqual({ creates: 1, clones: 1, saves: 2, generations: 1, downloads: 1, deletions: 1, taskReads: 2 });
      expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document.marker', reportingDocument.marker);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports never generates after a lost or invalid save, and never replays a lost generation', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const [scenario, expectedGenerations] of [['save-lost', 0], ['save-missing', 0], ['generate-lost', 1]] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_generate', { report_id: 71, confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/not retried|before another write/);
        expect(reportingFixture.lifecycle.counts()).toMatchObject({ saves: 1, generations: expectedGenerations });
        reportingFixture.lifecycle.use('complete');
        expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document.marker', reportingDocument.marker);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports refuses false deletion receipts and never replays a lost deletion', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['delete-false', 'delete-lost'] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_delete', { report_ids: [72, 73], confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/not retried|not confirm/);
        expect(reportingFixture.lifecycle.counts().deletions).toBe(1);
        reportingFixture.lifecycle.use('complete');
        expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document.id', 71);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports rejects missing creation and clone receipts without replaying writes', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use('create-missing');
      const created = yield* semrush.report(yield* parseReport('reporting_create', { template: 'tc_organic_search_positions', parameters: { domain: 'example.com', database: 'us' }, confirm: true })).pipe(Effect.flip);
      expect(created.message).toContain('no valid creation receipt');
      expect(reportingFixture.lifecycle.counts().creates).toBe(1);
      reportingFixture.lifecycle.use('clone-missing');
      const cloned = yield* semrush.report(yield* parseReport('reporting_clone', { report_id: 71, name: 'Cloned report', confirm: true })).pipe(Effect.flip);
      expect(cloned.message).toContain('no valid clone receipt');
      expect(reportingFixture.lifecycle.counts().clones).toBe(1);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports rejects unfinished tasks, external PDF paths and invalid PDF bytes without leaving artifacts', async () => {
  reportingFixture.lifecycle.reset();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const exports = yield* Exports;
      for (const [scenario, message] of [['pending', 'not ready'], ['outside', 'outside its supported'], ['bad-pdf', 'valid PDF bytes']] as const) {
        reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_download', { report_id: 71, task_id: '1001' })).pipe(Effect.flip);
        expect(error.message).toContain(message);
        expect(yield* exports.list()).toEqual([]);
        expect(reportingFixture.lifecycle.counts().generations).toBe(0);
      }
      reportingFixture.lifecycle.use('complete');
      expect((yield* semrush.report(yield* parseReport('reporting_download', { report_id: 71, task_id: '1001' }))).artifact?.mime_type).toBe('application/pdf');
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('Web Bot Auth creation, retention, replacement and disabling preserve protected audit state', async () => {
  webBotAuthFixture.reset();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const settings = { campaign_id: 791, domain: 'example.com', page_limit: 10, confirm: true };
      const original = { signature_agent: 'private-agent', signature_input: 'private-input', signature: 'private-signature' };
      const enabled = { ...settings, web_bot_auth_enabled: true };
      const created = yield* semrush.report(yield* parseReport('audit_create', { ...enabled, web_bot_auth: original }));
      expect(created.data).toMatchObject({ webBotAuthEnabled: true, echo: ['[redacted]', '[redacted]', '[redacted]'] });
      expect(webBotAuthFixture.state().headers).toEqual({ webBotAuthSignatureAgent: original.signature_agent,
        webBotAuthSignatureInput: original.signature_input, webBotAuthSignature: original.signature });
      const saves = webBotAuthFixture.state().saves;
      const implicitDisable = yield* semrush.report(yield* parseReport('audit_configure', settings)).pipe(Effect.flip);
      expect(implicitDisable.message).toContain('--web-bot-auth-enabled'); expect(webBotAuthFixture.state().saves).toBe(saves);
      const retained = yield* semrush.report(yield* parseReport('audit_configure', enabled));
      expect(retained.data).toMatchObject({ webBotAuthEnabled: true, echo: ['[redacted]', '[redacted]', ''] });
      expect(webBotAuthFixture.state().headers?.webBotAuthSignature).toBe(original.signature);
      const replacement = { signature_agent: 'replacement-agent', signature_input: 'replacement-input', signature: 'replacement-signature' };
      yield* semrush.report(yield* parseReport('audit_configure', { ...enabled, web_bot_auth: replacement }));
      webBotAuthFixture.metadata('headers_missing');
      const beforeMissing = webBotAuthFixture.state().saves;
      const missingHeaders = yield* semrush.report(yield* parseReport('audit_configure', enabled)).pipe(Effect.flip);
      expect(missingHeaders.message).toContain('header metadata is unavailable'); expect(webBotAuthFixture.state().saves).toBe(beforeMissing);
      // A complete replacement does not depend on retaining unreadable old headers.
      yield* semrush.report(yield* parseReport('audit_configure', { ...enabled, web_bot_auth: replacement }));
      webBotAuthFixture.metadata('complete'); webBotAuthFixture.basicAuth(true);
      const beforeBasic = webBotAuthFixture.state().saves;
      const implicitBasicDisable = yield* semrush.report(yield* parseReport('audit_configure', enabled)).pipe(Effect.flip);
      expect(implicitBasicDisable.message).toContain('--auth-enabled'); expect(webBotAuthFixture.state().saves).toBe(beforeBasic);
      yield* semrush.report(yield* parseReport('audit_configure', { ...enabled, auth_enabled: true }));
      const info = yield* semrush.report(yield* parseReport('audit_info', { campaign_id: 791 }));
      expect(info.data).toMatchObject({ webBotAuthEnabled: true, authEnabled: true, status: 'FINISHED' });
      for (const value of [...Object.values(original), ...Object.values(replacement)]) expect(JSON.stringify(info.data)).not.toContain(value);
      for (const key of ['webBotAuthSignatureAgent', 'webBotAuthSignatureInput', 'webBotAuthSignature']) expect(info.data).not.toHaveProperty(key);
      yield* semrush.report(yield* parseReport('audit_configure', { ...settings, auth_enabled: true, web_bot_auth_enabled: false }));
      expect(webBotAuthFixture.state()).toMatchObject({ basic: true, headers: undefined, saves: 6 });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { webBotAuthFixture.reset(); }
}, 30000);

test('Web Bot Auth failures hide every header and refuse unknown authentication metadata before saving', async () => {
  webBotAuthFixture.reset();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const settings = { campaign_id: 791, domain: 'example.com', page_limit: 10, confirm: true };
      yield* semrush.report(yield* parseReport('audit_create', settings));
      const incomplete = yield* semrush.report(yield* parseReport('audit_configure', { ...settings, web_bot_auth_enabled: true })).pipe(Effect.flip);
      expect(incomplete.message).toContain('all three header values');
      webBotAuthFixture.rejectSave(true);
      const credentials = { signature_agent: 'private-agent', signature_input: 'private-input', signature: 'private-signature' };
      const selection = { ...settings, web_bot_auth_enabled: true, web_bot_auth: credentials };
      const rejected = yield* semrush.report(yield* parseReport('audit_configure', selection)).pipe(Effect.flip);
      expect(rejected.message).toContain('[redacted]');
      for (const value of Object.values(credentials)) expect(rejected.message).not.toContain(value);
      expect(webBotAuthFixture.state()).toMatchObject({ headers: undefined, saves: 1 });
      webBotAuthFixture.metadata('auth_missing');
      const unknown = yield* semrush.report(yield* parseReport('audit_configure', selection)).pipe(Effect.flip);
      expect(unknown.message).toContain('authentication metadata is unavailable'); expect(webBotAuthFixture.state().saves).toBe(1);
      webBotAuthFixture.metadata('complete');
      expect((yield* semrush.report(yield* parseReport('audit_info', { campaign_id: 791 }))).data).toMatchObject({ webBotAuthEnabled: false });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { webBotAuthFixture.reset(); }
}, 30000);

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
  if (onpageFixture.envelopeFailure(response)) return;
  if (await trackingTargetsFixture.serve(request, response, url)) return;
  expect(request.headers.cookie).toContain('session=authorized');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname.startsWith('/tracking/web-api/reports/')) {
    expect(request.method).toBe('GET'); expect(url.searchParams.get('api_key')).toBe('fixture-secret');
    expect(url.searchParams.get('date_begin')).toBe('20261015');
    if (url.pathname.endsWith('/multi_overview')) {
      expect(url.searchParams.getAll('targets[]')).toEqual(['789_42', '789_43']);
      expect(url.searchParams.get('main_target')).toBe('789_42');
      expect(url.searchParams.getAll('competitors[]')).toEqual(['*.example.com/*']);
      expect(url.searchParams.has('main_competitor')).toBe(false);
      expect(url.searchParams.get('sort[target]')).toBe('0');
      expect(url.searchParams.get('intersection_type')).toBe('shared');
      response.end(JSON.stringify({ status: 'ok', data: { keywords: [{ keyword: 'fixture', targets: [{ id: '789_42', positions: [{ date: '20261015', position: 1 }] }, { id: '789_43', positions: [{ date: '20261015', position: 2 }] }] }] } })); return;
    }
    if (url.pathname.endsWith('/competitors')) {
      expect(url.searchParams.get('main_competitor')).toBe('example.com');
      expect(url.searchParams.get('url_type')).toBe('rootdomain');
      response.end(JSON.stringify({ status: 'ok', data: { total: 1, competitors: [{ competitor: 'example.org' }] } })); return;
    }
    expect(url.searchParams.getAll('competitors[]')).toEqual(['*.example.com/*']);
    response.end(JSON.stringify({ status: 'ok', data: { competitors: [{ mask: '*.example.com/*', tops: { top3: { all: 1 } } }] } })); return;
  }
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
    expect(alerts.data).toMatchObject({ alert_ids: [
      { alert_id: '900719925474099312345', alert_body: { date: 1792094400, is_read: 0 } },
      { alert_id: 'alert-2', alert_body: { date: 1792094401, is_read: 0 } },
    ] });
    expect((yield* report('position_alert_counts', campaign)).data).toMatchObject({ unread_items_count: 2 });
    const selected = { ...campaign, alert_id: '900719925474099312345', confirm: true };
    expect((yield* report('position_alert_read', selected)).data).toMatchObject({ alert_body: { date: 1792094400, date_begin: 1792008000, date_end: 1792094400, is_read: 1 } });
    expect((yield* report('position_alert_counts', campaign)).data).toMatchObject({ items_count: 2, unread_items_count: 1 });
    yield* report('position_alert_mark_all_read', { ...campaign, confirm: true });
    expect((yield* report('position_alert_counts', campaign)).data).toMatchObject({ items_count: 2, unread_items_count: 0 });
    yield* report('position_alert_delete', selected);
    expect((yield* report('position_alert_counts', campaign)).data).toMatchObject({ items_count: 1, unread_items_count: 0 });
    expect((yield* report('position_alerts', { ...campaign, page: 2, limit: 10 })).data).toMatchObject({ alert_ids: [{ alert_id: 'alert-2' }] });
    for (const name of ['position_alert_read', 'position_alert_delete']) {
      expect((yield* report(name, selected).pipe(Effect.flip)).message).toContain('Alert not found');
    }
    yield* report('position_trigger_delete', { ...campaign, trigger_id: 'rule-1', confirm: true });
    expect((yield* report('position_triggers', campaign)).data).toMatchObject({ trigger_ids: [] });
    const deniedRequests: [string, Query][] = [
      ['position_alerts', {}], ['position_trigger_create', selection],
      ['position_alert_read', selected], ['position_alert_delete', selected],
      ['position_alert_mark_all_read', { confirm: true }],
    ];
    for (const [name, query] of deniedRequests) {
      const failed = yield* report(name, { ...query, campaign_id: '789_99' }).pipe(Effect.flip);
      expect(failed.message).toContain('target is read-only');
      expect(failed.message).not.toContain('fixture-secret');
    }
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('native tracking distribution, competitor discovery and target comparison preserve selected report data', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const selection = { campaign_id: '789_42', date_begin: '20261015', date_end: '20261015' };
    const call = (name: string, query: Query) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, query)); });
    const distribution = yield* call('position_distribution', { ...selection, competitors: ['*.example.com/*'] });
    expect(distribution.data).toMatchObject({ data: { competitors: [{ mask: '*.example.com/*', tops: { top3: { all: 1 } } }] } });
    const competitors = yield* call('position_competitors', { ...selection, main_competitor: 'example.com' });
    expect(competitors.data).toMatchObject({ data: { competitors: [{ competitor: 'example.org' }] } });
    const comparison = yield* call('position_targets_compare', { ...selection, competitors: ['*.example.com/*'], target_ids: ['789_42', '789_43'], intersection_type: 'shared' });
    expect(comparison.data).toMatchObject({ data: { keywords: [{ targets: [{ id: '789_42' }, { id: '789_43' }] }] } });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('native notes preserve partial edits, personal visibility and ownership through the real browser', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, query: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, query)); });
    const chart = { tool: 'POSITION_TRACKING', project_id: 789 };
    const list = { tools: ['POSITION_TRACKING'], project_ids: [789], database: 'us' };
    expect((yield* call('notes_export')).artifact).toMatchObject({ filename: 'semrush_notes_export.csv', mime_type: 'text/csv' });
    expect((yield* call('note_databases')).data).toEqual({ databases: ['US', 'ES'] });
    expect((yield* call('note_hidden_categories', chart)).data).toEqual(['UNCONFIRMED']);
    yield* call('note_hidden_categories_set', { ...chart, categories: [], confirm: true });
    expect((yield* call('note_hidden_categories', chart)).data).toEqual([]);
    const created = yield* call('note_create', { title: 'Owned note', note: 'Keep this content',
      datetime: '2026-10-15T00:00:00Z', tools: ['POSITION_TRACKING'], project_id: 789, link: 'https://example.com/', confirm: true });
    expect(created.data).toMatchObject({ id: 'owned-note', category: 'USER_NOTE', hidden: false });
    const updated = yield* call('note_update', { note_id: 'owned-note', title: 'Changed title', project_id: null, link: '', confirm: true });
    expect(updated.data).toMatchObject({ title: 'Changed title', note: 'Keep this content', project: null, link: null });
    expect(updated.data).not.toHaveProperty('user_id');
    yield* call('note_hide', { note_id: 'owned-note', confirm: true });
    expect((yield* call('note', { note_id: 'owned-note' })).data).toMatchObject({ hidden: true });
    expect((yield* call('notes', { ...list, include_hidden: false })).data).toMatchObject({ count: 2 });
    yield* call('note_show', { note_id: 'owned-note', confirm: true });
    expect((yield* call('notes', list)).data).toMatchObject({ count: 3 });
    for (const note_id of ['published-note', 'other-note']) {
      for (const name of ['note_update', 'note_delete']) {
        const input: Query = { note_id, confirm: true };
        if (name === 'note_update') input.title = 'Refuse this';
        const denied = yield* call(name, input).pipe(Effect.flip);
        expect(denied.message).toContain('Only your own editable user notes');
        expect(denied.message).not.toContain('fixture-secret');
      }
    }
    expect((yield* call('note_delete', { note_id: 'owned-note', confirm: true })).data).toBeNull();
    expect((yield* call('notes', list)).data).toMatchObject({ count: 2 });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('native target replacement preserves complete keyword tags and deletion removes only the selected target', async () => {
  const state = trackingTargetsFixture.state;
  state.enabled = true; state.editable = true; state.malformed = false; state.deleted = false; state.writes = 0;
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, { campaign_id: '789_42', ...input })); });
      expect((yield* call('position_keywords')).data).toMatchObject({ data: state.keywords });
      const replaced = yield* call('position_replace', { device: 'phone', location_id: 2826, language_code: 'es', confirm: true });
      expect(replaced.data).toMatchObject({ status: 'SUCCESS', result: { id: '789_43' }, diagnostic: 'accepted [redacted]' });
      expect(state).toMatchObject({ device: 'phone', location: 2826, language: 'es', engine: 'google', writes: 1 });
      state.editable = false;
      const refused = yield* call('position_delete', { confirm: true }).pipe(Effect.flip);
      expect(refused.message).toContain('read-only'); expect(state.writes).toBe(1);
      state.editable = true; state.malformed = true;
      const missing = yield* call('position_replace', { engine: 'bing', confirm: true }).pipe(Effect.flip);
      expect(missing.message).toContain('metadata'); expect(state.writes).toBe(1);
      state.malformed = false;
      const deleted = yield* call('position_delete', { confirm: true });
      expect(deleted.data).toMatchObject({ status: 'SUCCESS', targets: ['789_99'], diagnostic: 'accepted [redacted]' });
      expect(state.deleted).toBe(true); expect(state.writes).toBe(2);
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { state.enabled = false; }
}, 30000);


test('Backlink Audit uses native RPC auth, recommended creation defaults and partial settings', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    const scope = yield* run('backlink_audit_scopes', { project_id: 789 });
    expect(scope.data).toMatchObject([{ scope: 'root', available: true, allowed: true }, { scope: 'both', available: true, allowed: true }, { scope: 'www', available: false, allowed: true }]);
    const created = yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    expect(created.data).toMatchObject({ userDomainId: 456, params: { brands: ['example'], geo: ['us'], recrawl: 'never', recrawlNotify: false } });
    const writesBefore = backlinkAuditFixture.calls.filter(call => call.method === 'domains.AddByProjectId').length;
    const duplicate = yield* run('backlink_audit_create', { project_id: 789, confirm: true }).pipe(Effect.flip);
    expect(duplicate.message).toContain('already has a Backlink Audit');
    expect(backlinkAuditFixture.calls.filter(call => call.method === 'domains.AddByProjectId')).toHaveLength(writesBefore);
    yield* run('backlink_audit_configure', { audit_id: 456, brands: ['changed'], confirm: true });
    const updated = yield* run('backlink_audit_info', { project_id: 789 });
    expect(updated.data).toMatchObject({ params: { brands: ['changed'], geo: ['us'], categories: ['6'], recrawl: 'never' } });
    expect(updated.data).not.toHaveProperty('params.recrawlNotify');
    expect(updated.data).not.toHaveProperty('params.recrawlMajestic');
    yield* run('backlink_audit_configure', { audit_id: 456, brands: [], confirm: true });
    const cleared = yield* run('backlink_audit_info', { project_id: 789 });
    expect(cleared.data).toMatchObject({ params: { categories: ['6'], geo: ['us'], recrawl: 'never' } });
    expect(cleared.data).not.toHaveProperty('params.brands');
    const failure = yield* run('backlink_audit_configure', { audit_id: 456, brands: ['reject'], confirm: true }).pipe(Effect.flip);
    expect(failure.message).toContain('[redacted]'); expect(failure.message).not.toContain('fixture-secret');
    const reads = ['limits', 'campaigns', 'project', 'status', 'categories', 'countries', 'recommendations', 'links_summary', 'domains_summary', 'anchor_types', 'rel_summary', 'removed_summary', 'historical_stats', 'authority_history', 'domains_history', 'links_history', 'changes', 'authority_distribution', 'link_types', 'anchors', 'top_domains'];
    for (const name of reads) {
      const result = yield* run('backlink_audit_' + name, name === 'project' ? { project_id: 789 } : ['limits', 'campaigns', 'categories', 'countries'].includes(name) ? {} : { audit_id: 456 });
      expect(result.authenticated).toBe(true);
    }
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit TXT export uses native multipart auth and refuses processing or unexpected endpoints', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const files = yield* Exports;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    backlinkAuditFixture.state.processing = true;
    const processing = yield* run('backlink_audit_disavow_export', { audit_id: 456, confirm: true }).pipe(Effect.flip);
    expect(processing.message).toContain('not ready for file operations'); expect(backlinkAuditFixture.state.exports).toBe(0);
    backlinkAuditFixture.state.processing = false; backlinkAuditFixture.state.foreignEndpoint = true;
    const foreign = yield* run('backlink_audit_disavow_export', { audit_id: 456, confirm: true }).pipe(Effect.flip);
    expect(foreign.message).toContain('unexpected file endpoint'); expect(backlinkAuditFixture.state.exports).toBe(0);
    backlinkAuditFixture.state.foreignEndpoint = false;
    const imported = yield* run('backlink_audit_disavow_import', { audit_id: 456, contents: 'domain:example.net\nhttps://example.org/unwanted\n', confirm: true });
    expect(imported.data).toBeNull();
    const entries = yield* run('backlink_audit_disavow', { audit_id: 456 });
    expect(entries.data).toMatchObject([{ type: 'domain', text: 'example.net' }, { type: 'url', text: 'https://example.org/unwanted' }]);
    const count = yield* run('backlink_audit_disavow_count', { audit_id: 456 });
    expect(count.data).toBe(2);
    const exported = yield* run('backlink_audit_disavow_export', { audit_id: 456, confirm: true });
    if (!exported.artifact) throw new Error('Missing native TXT export artifact');
    expect(exported.artifact).toMatchObject({ filename: 'disavow.txt', mime_type: 'text/plain' });
    const content = yield* files.read(exported.artifact.uri);
    expect(Buffer.from(content.blob, 'base64').toString()).toBe('domain:example.net\nhttps://example.org/unwanted\n');
    expect(backlinkAuditFixture.state.exports).toBe(1);
    backlinkAuditFixture.state.omitDisposition = true;
    const unnamed = yield* run('backlink_audit_disavow_export', { audit_id: 456, confirm: true });
    expect(unnamed.artifact).toMatchObject({ filename: 'semrush-export.txt', mime_type: 'text/plain' });
    backlinkAuditFixture.state.omitDisposition = false;
    yield* run('backlink_audit_disavow_import', { audit_id: 456, contents: 'domain:example.net\ndomain:example.org\n', confirm: true });
    const replaced = yield* run('backlink_audit_disavow', { audit_id: 456 });
    expect(replaced.data).toMatchObject([{ text: 'example.net' }, { text: 'example.org' }]);
    expect(JSON.stringify(replaced.data)).not.toContain('https://example.org/unwanted');
    yield* run('backlink_audit_disavow_delete', { audit_id: 456, item_id: 101, confirm: true });
    expect((yield* run('backlink_audit_disavow', { audit_id: 456 })).data).toMatchObject([{ id: 102, text: 'example.org' }]);
    yield* run('backlink_audit_disavow_clear', { audit_id: 456, with_file: true, confirm: true });
    expect((yield* run('backlink_audit_disavow_count', { audit_id: 456 })).data).toBe(0);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit moves native domain, URL and network selections between lists and restores them', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    for (const [operation, ids, destination] of [
      ['move_domains', ['00000000-0000-0000-0000-000000000001'], 'whitelist'],
      ['move_links', ['00000000-0000-0000-0000-000000000001'], 'to-remove'],
      ['move_networks', [19387720322], 'disavow'],
    ] as const) {
      yield* run('backlink_audit_' + operation, { audit_id: 456, ids: [...ids], list: destination, confirm: true });
      expect((yield* run('backlink_audit_links', { audit_id: 456, mode: destination })).data).toMatchObject([{ list: destination }]);
      expect((yield* run('backlink_audit_links', { audit_id: 456, mode: 'for-review' })).data).toEqual([]);
      if (destination === 'disavow') {
        expect((yield* run('backlink_audit_disavow', { audit_id: 456 })).data).toMatchObject([{ id: 100, statusId: 1 }]);
        yield* run('backlink_audit_disavow_move', { audit_id: 456, item_id: 100, list: 'for-review', confirm: true });
        expect((yield* run('backlink_audit_disavow_count', { audit_id: 456 })).data).toBe(0);
      } else yield* run('backlink_audit_' + operation, { audit_id: 456, ids: [...ids], list: 'for-review', confirm: true });
      expect((yield* run('backlink_audit_links', { audit_id: 456 })).data).toMatchObject([{ list: 'for-review' }]);
    }
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit target pages share filters between counts and pagination', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    expect((yield* run('backlink_audit_target_pages_count', { audit_id: 456 })).data).toBe(2);
    expect((yield* run('backlink_audit_target_pages', { audit_id: 456, page: 1, page_size: 1, by_domain: false })).data).toMatchObject([{ urls: ['https://example.com/docs'], active: [3] }]);
    expect((yield* run('backlink_audit_target_pages_count', { audit_id: 456, query: '/docs', query_mode: 'targetUrl' })).data).toBe(1);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Backlink Audit comment lifecycle retains its native domain association', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    expect((yield* run('backlink_audit_comment_save', { audit_id: 456, domain: 'example.net', comment: 'Inspect', confirm: true })).data).toBe(321);
    expect((yield* run('backlink_audit_comments', { audit_id: 456, ids: [321] })).data).toMatchObject([{ id: 321, domain: 'example.net', comment: 'Inspect' }]);
    expect((yield* run('backlink_audit_links', { audit_id: 456 })).data).toMatchObject([{ userCommentId: 321 }]);
    expect((yield* run('backlink_audit_comment_save', { audit_id: 456, domain: 'example.net', comment: 'Checked', confirm: true })).data).toBe(321);
    expect((yield* run('backlink_audit_comments', { audit_id: 456, ids: [321] })).data).toMatchObject([{ comment: 'Checked' }]);
    yield* run('backlink_audit_comment_delete', { audit_id: 456, comment_id: 321, confirm: true });
    expect((yield* run('backlink_audit_links', { audit_id: 456 })).data).toMatchObject([{ userCommentId: null }]);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Backlink Audit label changes preserve sibling associations and reject native false replies', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    for (const target of ['https://example.com/', 'https://example.com/docs']) yield* run('backlink_audit_target_tag_add', { audit_id: 456, label: 'review', target_url: target, confirm: true });
    yield* run('backlink_audit_target_tag_add', { audit_id: 456, label: 'keep', target_url: 'https://example.com/', confirm: true });
    expect((yield* run('backlink_audit_tag_counts', { audit_id: 456 })).data).toEqual({ review: 2, keep: 1 });
    yield* run('backlink_audit_target_tag_remove', { audit_id: 456, label: 'review', target_url: 'https://example.com/', confirm: true });
    expect((yield* run('backlink_audit_target_pages', { audit_id: 456, labels: ['review'] })).data).toMatchObject([{ urls: ['https://example.com/docs'] }]);
    yield* run('backlink_audit_tag_delete', { audit_id: 456, label: 'review', confirm: true });
    expect((yield* run('backlink_audit_tags', { audit_id: 456 })).data).toEqual([{ label: 'keep' }]);
    expect((yield* run('backlink_audit_tag_counts', { audit_id: 456 })).data).toEqual({ keep: 1 });
    backlinkAuditFixture.state.rejectTagChanges = true;
    const refused = yield* run('backlink_audit_target_tag_add', { audit_id: 456, label: 'refused', target_url: 'https://example.com/', confirm: true }).pipe(Effect.flip);
    expect(refused.message).toContain('did not apply the label change');
    expect((yield* run('backlink_audit_tag_counts', { audit_id: 456 })).data).toEqual({ keep: 1 });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Backlink Audit reruns enforce readiness and the incremental-import allowance', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    backlinkAuditFixture.state.processing = true;
    expect((yield* run('backlink_audit_rerun', { audit_id: 456, confirm: true }).pipe(Effect.flip)).message).toContain('not ready for campaign changes');
    backlinkAuditFixture.state.processing = false; backlinkAuditFixture.state.incImportAvailable = false;
    expect((yield* run('backlink_audit_rerun', { audit_id: 456, confirm: true }).pipe(Effect.flip)).message).toContain('incImportAvailable:true');
    expect(backlinkAuditFixture.state.reruns).toBe(0);
    backlinkAuditFixture.state.incImportAvailable = true; backlinkAuditFixture.state.lockedAudit = true;
    expect((yield* run('backlink_audit_rerun', { audit_id: 456, confirm: true }).pipe(Effect.flip)).message).toContain('isLocked:false');
    expect(backlinkAuditFixture.state.reruns).toBe(0);
    backlinkAuditFixture.state.lockedAudit = false;
    yield* run('backlink_audit_rerun', { audit_id: 456, confirm: true });
    expect(backlinkAuditFixture.state.reruns).toBe(1);
    expect((yield* run('backlink_audit_status', { audit_id: 456 })).data).toMatchObject({ domain: { statusId: 2 } });

  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit CSV jobs use header auth, poll pending files and preserve native bytes', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const files = yield* Exports;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    backlinkAuditFixture.state.foreignEndpoint = true;
    expect((yield* run('backlink_audit_export', { audit_id: 456 }).pipe(Effect.flip)).message).toContain('unexpected CSV endpoint');
    expect(backlinkAuditFixture.state.csvJobs).toBe(0);
    backlinkAuditFixture.state.foreignEndpoint = false;
    const result = yield* run('backlink_audit_export', { audit_id: 456 });
    if (!result.artifact) throw new Error('Missing CSV artifact');
    expect(result.artifact).toMatchObject({ filename: 'fixture-backlinks.csv', mime_type: 'text/csv' });
    const content = yield* files.read(result.artifact.uri);
    expect(Buffer.from(content.blob, 'base64').toString('utf8')).toBe('\ufeffSource URL,Target URL\nhttps://example.net/link,https://example.com/\n');
    expect(backlinkAuditFixture.state.csvJobs).toBe(1); expect(backlinkAuditFixture.state.csvPolls).toBe(2);
    backlinkAuditFixture.state.csvDenied = true;
    expect((yield* run('backlink_audit_export', { audit_id: 456 }).pipe(Effect.flip)).message).toContain('HTTP 403');
    expect(yield* files.list()).toHaveLength(1);
    expect(backlinkAuditFixture.state.csvJobs).toBe(2); expect(backlinkAuditFixture.state.csvPolls).toBe(3);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit CSV import stages native bytes before committing one bounded file', async () => {
  backlinkAuditFixture.reset();
  const contents = '\ufeff"https://example.net/link"\r\n';
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    const imported = yield* run('backlink_audit_import', { audit_id: 456, contents, confirm: true });
    expect(imported.data).toMatchObject({ file: { name: 'semrush-backlinks.csv', urls: 1 }, result: true });
    expect(backlinkAuditFixture.state.csvImportedContents).toBe(contents);
    expect(backlinkAuditFixture.state.csvImportStarts).toBe(1);
    expect(backlinkAuditFixture.state.csvImportFinishes).toBe(1);
    expect(backlinkAuditFixture.calls.filter(call => call.method.startsWith('backlinks.') && call.method.endsWith('Upload')).map(call => call.method)).toEqual(['backlinks.StartUpload', 'backlinks.FinishUpload']);
    expect((yield* run('backlink_audit_status', { audit_id: 456 })).data).toMatchObject({ domain: { statusId: 2, params: { recrawl: 'never' } } });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Backlink Audit CSV import refuses locked audits, foreign endpoints and invalid or empty staging before commit', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    const upload = () => run('backlink_audit_import', { audit_id: 456, contents: 'https://example.net/link\n', confirm: true });
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    backlinkAuditFixture.state.lockedAudit = true;
    expect((yield* upload().pipe(Effect.flip)).message).toContain('isLocked:false');
    backlinkAuditFixture.state.lockedAudit = false; backlinkAuditFixture.state.foreignEndpoint = true;
    expect((yield* upload().pipe(Effect.flip)).message).toContain('unexpected CSV upload endpoint');
    expect(backlinkAuditFixture.state.csvImportStarts).toBe(0);
    backlinkAuditFixture.state.foreignEndpoint = false; backlinkAuditFixture.state.csvImportURLs = 0;
    expect((yield* upload().pipe(Effect.flip)).message).toContain('no importable source URLs');
    backlinkAuditFixture.state.csvImportURLs = 1; backlinkAuditFixture.state.invalidImportResponse = true;
    expect((yield* upload().pipe(Effect.flip)).message).toContain('invalid CSV staging response');
    expect(backlinkAuditFixture.state.csvImportStarts).toBe(2);
    expect(backlinkAuditFixture.state.csvImportFinishes).toBe(0);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit scope replacement preserves saved values and explicit clears in one write per fresh audit', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    yield* run('backlink_audit_configure', { audit_id: 456, brands: ['kept'], categories: [1], countries: ['gb'], confirm: true });
    const before = backlinkAuditFixture.calls.length;
    expect((yield* run('backlink_audit_replace_scope', { project_id: 789, scope: 'both', confirm: true })).data).toMatchObject({
      userDomainId: 457, scope: 'both', statusId: 2,
      params: { brands: ['kept'], categories: ['1'], geo: ['gb'], recrawl: 'never', recrawlNotify: false, recrawlMajestic: false },
    });
    expect(backlinkAuditFixture.calls.slice(before).map(call => call.method)).toEqual(['domains.GetByProjectId', 'domains.AddByProjectId']);
    expect((yield* run('backlink_audit_status', { audit_id: 456 }).pipe(Effect.flip)).message).toContain('user domain not found');
    backlinkAuditFixture.state.processing = false;
    yield* run('backlink_audit_configure', { audit_id: 457, brands: [], categories: [], countries: [], recrawl_notify: true, recrawl_majestic: true, confirm: true });
    expect((yield* run('backlink_audit_replace_scope', { project_id: 789, scope: 'nonwww', confirm: true })).data).toMatchObject({
      userDomainId: 458, scope: 'nonwww', params: { brands: [], categories: [], geo: [], recrawl: 'never', recrawlNotify: true, recrawlMajestic: true },
    });
    expect(backlinkAuditFixture.state.replacements).toBe(2);
    expect((yield* run('backlink_audit_info', { project_id: 789 })).data).toMatchObject({ userDomainId: 458, scope: 'nonwww' });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Backlink Audit scope replacement refuses missing, unchanged, read-only and locked audits before writing', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    const replace = () => run('backlink_audit_replace_scope', { project_id: 789, scope: 'both', confirm: true });
    expect((yield* replace().pipe(Effect.flip)).message).toContain('Audit not configured');
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    expect((yield* run('backlink_audit_replace_scope', { project_id: 789, scope: 'root', confirm: true }).pipe(Effect.flip)).message).toContain('already uses');
    backlinkAuditFixture.state.readOnly = true;
    expect((yield* replace().pipe(Effect.flip)).message).toContain('read-only');
    backlinkAuditFixture.state.readOnly = false; backlinkAuditFixture.state.lockedAudit = true;
    expect((yield* replace().pipe(Effect.flip)).message).toContain('isLocked:false');
    backlinkAuditFixture.state.lockedAudit = false; backlinkAuditFixture.state.lockedSettings = true;
    expect((yield* replace().pipe(Effect.flip)).message).toContain('isLockedSettings:false');
    backlinkAuditFixture.state.lockedSettings = false; backlinkAuditFixture.state.processing = true;
    expect((yield* replace().pipe(Effect.flip)).message).toContain('statusId:1');
    expect(backlinkAuditFixture.state.replacements).toBe(0);
    expect(backlinkAuditFixture.calls.filter(call => call.method === 'domains.AddByProjectId')).toHaveLength(1);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Backlink Audit scope replacement does not retry when the response is lost after commit', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const semrush = yield* Semrush;
    const run = (name: string, query: Query) => parseReport(name, query).pipe(Effect.flatMap(request => semrush.report(request)));
    yield* run('backlink_audit_create', { project_id: 789, confirm: true });
    backlinkAuditFixture.state.dropScopeResponse = true;
    const failed = yield* run('backlink_audit_replace_scope', { project_id: 789, scope: 'both', confirm: true }).pipe(Effect.flip);
    expect(failed.message).toBeTruthy();
    expect(backlinkAuditFixture.state.replacements).toBe(1);
    expect(backlinkAuditFixture.calls.filter(call => call.method === 'domains.AddByProjectId')).toHaveLength(2);
    expect((yield* run('backlink_audit_info', { project_id: 789 })).data).toMatchObject({ userDomainId: 457, scope: 'both', params: { recrawl: 'never' } });
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('a committed disavow export is not repeated after its response is lost', async () => {
  backlinkAuditFixture.reset();
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    backlinkAuditFixture.state.dropExportResponse = true;
    const failure = yield* service.report(yield* parseReport('backlink_audit_disavow_export', { audit_id: 456, confirm: true })).pipe(Effect.flip);
    expect(failure.message).toBeTruthy();
    expect(backlinkAuditFixture.state.exports).toBe(1);
    expect(yield* (yield* Exports).list()).toEqual([]);
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test('Site Audit issue matrices and markup exports preserve filters, bytes and cookie rotation', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const files = yield* Exports;
    for (const [name, selected, contents] of [
      ['audit_export_page_issues', { campaign_id: 789 }, 'Page URL,Broken internal links\n/café,1\n'],
      ['audit_export_markup', { snapshot_id: 'opaque_snapshot' }, 'Page URL,Schema.org (JSON-LD)\n/café,Article\n'],
    ] as const) {
      const report = yield* service.report(yield* parseReport(name, { ...selected, relative: true, sort: 'url_desc', filter: 'café' }));
      if (!report.artifact) throw new Error('Expected a native CSV artifact');
      expect(report.artifact.mime_type).toBe('text/csv');
      expect(Buffer.from((yield* files.read(report.artifact.uri)).blob, 'base64').toString('utf8')).toBe(contents);
    }
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('Site Audit comparison preserves the selected crawl order and native delta bytes', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const report = yield* service.report(yield* parseReport('audit_export_compare', { first_snapshot_id: 'old_snapshot', second_snapshot_id: 'new_snapshot' }));
    if (!report.artifact) throw new Error('Expected the native comparison artifact');
    expect(report.artifact.filename).toBe('compare_crawls.csv');
    expect(report.artifact.mime_type).toBe('text/csv');
    expect(Buffer.from((yield* (yield* Exports).read(report.artifact.uri)).blob, 'base64').toString('utf8')).toBe(auditComparisonCSV);
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


const jsImpactRows = [
  { url: 'https://example.com/changed', changed: true, parameters: { title: { valueBeforeJs: 'Before', valueAfterJs: 'After' } } },
  { url: 'https://example.com/unchanged', changed: false, parameters: { title: { valueBeforeJs: 'Same', valueAfterJs: 'Same' } } },
];
const jsImpactCSV = 'Page Url,Comparison Status,Title before JS rendering,Title after JS rendering\r\nhttps://example.com/changed,Changed,Before,After\r\n';
/** A real HTTP fixture applies the native table selectors and serves provider file bytes. */
async function serveJSImpactFixture(request: IncomingMessage, response: ServerResponse, url: URL) {
  expect(request.method).toBe('GET'); expect(request.headers.cookie).toContain('session=authorized');
  expect(url.searchParams.get('key')).toBe('fixture-secret');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname.endsWith('/guide')) {
    expect([...url.searchParams.keys()]).toEqual(['key']);
    response.end(JSON.stringify({ totalPages: 2, changedPages: 1, parameters: { title: { changedPages: 1, examples: ['https://example.com/changed'] } } })); return;
  }
  if (url.pathname.endsWith('/changed-pages')) {
    expect([...url.searchParams.keys()]).toEqual(['key']);
    response.end('{"changedPages":1}'); return;
  }
  const allowed = ['key', 'sort', 'page', 'limit', 'url', 'changed', 'parameters', 'export'];
  expect([...url.searchParams.keys()].every(key => allowed.includes(key))).toBe(true);
  expect(['ASC', 'DESC']).toContain(url.searchParams.get('sort'));
  const filtered = jsImpactRows.filter(row => (!url.searchParams.has('changed') || String(row.changed) === url.searchParams.get('changed'))
    && (!url.searchParams.has('url') || row.url.includes(url.searchParams.get('url') ?? '')));
  if (url.searchParams.has('parameters')) { expect(url.searchParams.get('changed')).toBe('true'); expect(url.searchParams.get('parameters')).toBe('title'); }
  if (url.pathname === '/siteaudit/export/js-impact/789') {
    expect(url.searchParams.get('page')).toBe('0'); expect(url.searchParams.get('limit')).toBe('100000');
    expect(url.searchParams.get('export')).toBe('csv'); expect(filtered).toEqual([jsImpactRows[0]]);
    response.setHeader('Content-Type', 'text/csv'); response.setHeader('Content-Disposition', 'attachment; filename=js_impact.csv');
    response.end(jsImpactCSV); return;
  }
  expect(url.pathname).toBe('/siteaudit/api/campaigns/789/js-impact/details');
  const page = Number(url.searchParams.get('page')); const limit = Number(url.searchParams.get('limit'));
  const ordered = [...filtered].sort((a, b) => a.url.localeCompare(b.url) * (url.searchParams.get('sort') === 'ASC' ? 1 : -1));
  response.end(JSON.stringify({ pageNumber: page, pageSizeLimit: limit, totalAuditPages: filtered.length, changedAuditPages: filtered.filter(row => row.changed).length, auditPages: ordered.slice(page * limit, (page + 1) * limit) })); return;
}

test('JS Impact reads apply native pagination and filters and preserve export bytes', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const call = (name: string, input: Query = {}) => Effect.gen(function* () { return yield* service.report(yield* parseReport(name, { campaign_id: 789, ...input })); });
    expect((yield* call('audit_js_impact_guide')).data).toMatchObject({ totalPages: 2, changedPages: 1 });
    expect((yield* call('audit_js_impact_changed_pages')).data).toEqual({ changedPages: 1 });
    expect((yield* call('audit_js_impact_pages', { sort: 'asc', limit: 1, page: 1 })).data).toMatchObject({ pageNumber: 1, totalAuditPages: 2, auditPages: [jsImpactRows[1]] });
    expect((yield* call('audit_js_impact_pages', { status: 'unchanged' })).data).toMatchObject({ totalAuditPages: 1, changedAuditPages: 0, auditPages: [jsImpactRows[1]] });
    expect((yield* call('audit_js_impact_pages', { status: 'changed', query: '/changed', parameters: ['title'] })).data).toMatchObject({ totalAuditPages: 1, auditPages: [jsImpactRows[0]] });
    expect((yield* call('audit_js_impact_pages', { query: '/missing' })).data).toMatchObject({ totalAuditPages: 0, auditPages: [] });
    const exported = yield* call('audit_export_js_impact', { status: 'changed', parameters: ['title'] });
    if (!exported.artifact) throw new Error('Expected native JS Impact artifact');
    expect(exported.artifact.filename).toBe('js_impact.csv');
    expect(Buffer.from((yield* (yield* Exports).read(exported.artifact.uri)).blob, 'base64').toString('utf8')).toBe(jsImpactCSV);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


const archiveSelection = { campaign_id: 790, relative: true, sort: 'url_desc', filter: 'café' };
test('native mind-map controls preserve PNG/JPG bytes, filenames and session rotation', async () => {
  for (const format of ['png', 'jpg'] as const) {
    mindmapFixture.use('complete');
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const exported = yield* service.report(yield* parseReport('keyword_list_export_mindmap', { basket_id: 456, owner_id: 123, format }));
      expect(exported.data).toBeNull();
      if (!exported.artifact) throw new Error('Expected native mind-map image');
      expect(exported.artifact).toMatchObject({ filename: 'native mindmap.' + format, mime_type: format === 'png' ? 'image/png' : 'image/jpeg', size_bytes: mindmapFixture.bytes(format).length });
      const exports = yield* Exports;
      expect(yield* exports.list()).toEqual([exported.artifact]);
      const saved = yield* exports.read(exported.artifact.uri);
      expect(Buffer.from(saved.blob, 'base64')).toEqual(mindmapFixture.bytes(format));
      expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
    }).pipe(Effect.provide(fixtureLayer()))));
    expect((await sdk.headers('test', fixtureURL)).Cookie).toContain('mindmap_rotation=retained');
  }
}, 30000);

test('a denied mind-map page fails without publishing an artifact or closing later reports', async () => {
  mindmapFixture.use('denied');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const failure = yield* service.report(yield* parseReport('keyword_list_export_mindmap', { basket_id: 456, owner_id: 123 })).pipe(Effect.flip);
    expect(failure.message).toContain('completed structured strategy');
    expect(yield* (yield* Exports).list()).toEqual([]);
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('cancelling a native image download closes its stream and releases the report slot', async () => {
  mindmapFixture.use('slow');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const fiber = yield* Effect.forkChild(service.report(yield* parseReport('keyword_list_export_mindmap', { basket_id: 456, owner_id: 123 })));
    yield* Effect.promise(() => mindmapFixture.ready()).pipe(Effect.timeout('5 seconds'));
    yield* Fiber.interrupt(fiber).pipe(Effect.timeout('5 seconds'));
    yield* Effect.promise(() => mindmapFixture.disconnected()).pipe(Effect.timeout('5 seconds'));
    expect(yield* (yield* Exports).list()).toEqual([]);
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);

test('All reports packages every available native file and explicit availability omissions', async () => {
  for (const scenario of ['complete', 'single', 'single-js'] as const) {
    auditArchiveFixture.use(scenario);
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const exported = yield* service.report(yield* parseReport('audit_export_all', archiveSelection));
      if (!exported.artifact) throw new Error('Expected All reports ZIP');
      const exports = yield* Exports;
      expect(yield* exports.list()).toEqual([exported.artifact]);
      const archive = unzipSync(Buffer.from((yield* exports.read(exported.artifact.uri + '?limit=1048576')).blob, 'base64'));
      const manifest = JSON.parse(Buffer.from(archive['manifest.json'] ?? []).toString('utf8'));
      expect(manifest).toEqual(exported.data);
      expect(manifest.snapshot_id).toBe('archive_latest');
      expect(manifest.comparison).toEqual(scenario === 'complete' ? { first_snapshot_id: 'archive_previous', second_snapshot_id: 'archive_latest' } : null);
      expect(manifest.files).toHaveLength(scenario === 'complete' ? 6 : scenario === 'single' ? 4 : 5);
      expect(manifest.omitted.map((item: { report: string }) => item.report)).toEqual(scenario === 'complete' ? [] : scenario === 'single' ? ['audit_export_compare', 'audit_export_js_impact'] : ['audit_export_compare']);
      expect(Object.keys(archive)).toHaveLength(manifest.files.length + 1);
      for (const file of manifest.files) expect(Buffer.from(archive[file.filename] ?? [])).toEqual(auditArchiveFixture.bytes(file.report));
    }).pipe(Effect.provide(fixtureLayer()))));
  }
}, 30000);

test('All reports fails without public artifacts on missing metadata, provider denial or a changed crawl', async () => {
  for (const scenario of ['empty', 'malformed', 'failed', 'changed'] as const) {
    auditArchiveFixture.use(scenario);
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* Semrush;
      const failure = yield* service.report(yield* parseReport('audit_export_all', archiveSelection)).pipe(Effect.flip);
      expect(failure.message).toContain(scenario === 'empty' ? 'completed' : scenario === 'malformed' ? 'metadata' : scenario === 'failed' ? 'HTTP 403' : 'changed during download');
      expect(yield* (yield* Exports).list()).toEqual([]);
      if (scenario === 'empty' || scenario === 'malformed') expect(auditArchiveFixture.downloads).toEqual([]);
      expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
    }).pipe(Effect.provide(fixtureLayer()))));
  }
}, 30000);

test('cancelling an All reports download removes staged files and releases the browser slot', async () => {
  auditArchiveFixture.use('delayed');
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const service = yield* Semrush;
    const fiber = yield* Effect.forkChild(service.report(yield* parseReport('audit_export_all', archiveSelection)));
    yield* Effect.promise(auditArchiveFixture.ready).pipe(Effect.timeout('5 seconds'));
    expect(auditArchiveFixture.downloads).toEqual(['audit_export_pages', 'audit_export_page_issues']);
    expect(yield* (yield* Exports).list()).toEqual([]);
    yield* Fiber.interrupt(fiber).pipe(Effect.timeout('5 seconds'));
    yield* Effect.promise(auditArchiveFixture.disconnected).pipe(Effect.timeout('5 seconds'));
    expect(yield* (yield* Exports).list()).toEqual([]);
    expect((yield* service.report(yield* parseReport('account_status', {}))).authenticated).toBe(true);
  }).pipe(Effect.provide(fixtureLayer()))));
}, 30000);


test.each(['keyword_overview_pdf', 'audit_web_vitals_pdf'] as const)('%s creates and generates once, polls only task reads and preserves native PDF resource bytes', async name => {
  reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use('pdf-task-pending');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      const result = yield* semrush.report(yield* parseReport(name, name === 'keyword_overview_pdf' ? { keyword: 'typescript', confirm: true } : { campaign_id: 794, confirm: true }));
      expect(reportingFixture.lifecycle.metadataReads()).toBe(name === 'audit_web_vitals_pdf' ? 1 : 0);
      expect(result.data).toEqual({ report_id: 71, task_id: '1001' });
      expect(result.artifact).toMatchObject({ mime_type: 'application/pdf', size_bytes: reportingPDFBytes.length });
      const store = yield* Exports;
      expect(Buffer.from((yield* store.read(result.artifact?.uri ?? 'missing')).blob, 'base64')).toEqual(reportingPDFBytes);
      expect(JSON.stringify(result)).not.toMatch(/private-capability|fixture-secret/);
      expect(reportingFixture.lifecycle.counts()).toEqual({ creates: 1, clones: 0, saves: 0, generations: 1, downloads: 1, deletions: 0, taskReads: 2 });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test.each(['keyword_overview_pdf', 'audit_web_vitals_pdf'] as const)('%s never repeats lost initializers or generates without a valid creation receipt', async name => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['pdf-create-lost', 'pdf-create-missing', 'pdf-create-denied', 'generate-lost', 'generate-missing', 'pdf-task-failed'] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport(name, name === 'keyword_overview_pdf' ? { keyword: 'typescript', confirm: true } : { campaign_id: 794, confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/not retried|Inspect reporting-tasks/); expect(error.message).not.toContain('fixture-secret');
        expect(reportingFixture.lifecycle.counts()).toMatchObject({ creates: 1, saves: 0, generations: ['generate-lost', 'generate-missing', 'pdf-task-failed'].includes(scenario) ? 1 : 0, downloads: 0 });
        expect((yield* (yield* Exports).list())).toEqual([]);
        reportingFixture.lifecycle.use('complete');
        expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document.id', 71);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});


test('cancelling a Keyword Overview PDF after initialization stops polling without replaying writes', async () => {
  reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use('pending');
  const observed = new Promise<void>(resolve => reportingFixture.lifecycle.onTaskRead(() => resolve()));
  const controller = new AbortController();
  const running = Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    return yield* (yield* Semrush).report(yield* parseReport('keyword_overview_pdf', { keyword: 'typescript', confirm: true }));
  }).pipe(Effect.provide(fixtureLayer()))), { signal: controller.signal });
  try {
    const cancelled = expect(running).rejects.toThrow();
    await Promise.race([observed, running.then(() => { throw new Error('PDF completed before the pending task was observed'); })]);
    controller.abort(); await cancelled;
    expect(reportingFixture.lifecycle.counts()).toMatchObject({ creates: 1, generations: 1, saves: 0, downloads: 0, taskReads: 1 });
  } finally { controller.abort(); reportingFixture.lifecycle.reset(); }
});


test('Core Web Vitals PDF refuses missing, denied and mismatched campaign metadata before any report writes', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['pdf-metadata-denied', 'pdf-metadata-missing', 'pdf-metadata-wrong-id'] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('audit_web_vitals_pdf', { campaign_id: 794, confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/campaign|HTTP 403/);
        expect(reportingFixture.lifecycle.metadataReads()).toBe(1);
        expect(reportingFixture.lifecycle.counts()).toEqual({ creates: 0, clones: 0, saves: 0, generations: 0, downloads: 0, deletions: 0, taskReads: 0 });
        expect(yield* (yield* Exports).list()).toEqual([]);
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});


test.each(['keyword_overview_pdf', 'audit_web_vitals_pdf'] as const)('%s includes the native AI Summary widget only when requested', async name => {
  reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.withAISummary();
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const selection: Query = name === 'keyword_overview_pdf' ? { keyword: 'typescript' } : { campaign_id: 794 };
      const result = yield* (yield* Semrush).report(yield* parseReport(name, { ...selection, ai_summary: true, confirm: true }));
      expect(result.artifact).toMatchObject({ mime_type: 'application/pdf', size_bytes: reportingPDFBytes.length });
      expect(reportingFixture.lifecycle.counts()).toMatchObject({ creates: 1, saves: 0, generations: 1, downloads: 1 });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});


test('My Reports PDF deletion preserves the document, unselected generations and existing export resources', async () => {
  reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use('tasks-delete-complete');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush, store = yield* Exports;
      const exported = yield* semrush.report(yield* parseReport('reporting_download', { report_id: 71, task_id: '1001' }));
      const removed = yield* semrush.report(yield* parseReport('reporting_task_delete', { report_id: 71, task_id: '1001', confirm: true }));
      expect(removed.data).toEqual({ success: true, data: { deletedCount: 1 } });
      const remaining = (yield* semrush.report(yield* parseReport('reporting_tasks', { report_id: 71 }))).data;
      expect(remaining).toHaveProperty('reports.nodes.0.tasks', [expect.objectContaining({ id: '1002' }), expect.objectContaining({ id: '1003' })]);
      expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document.marker.preserve', true);
      expect(Buffer.from((yield* store.read(exported.artifact?.uri ?? 'missing')).blob, 'base64')).toEqual(reportingPDFBytes);
      expect(reportingFixture.lifecycle.recoveryCounts()).toEqual({ taskDeletes: 1, restores: 0 });
      expect(reportingFixture.lifecycle.counts()).toMatchObject({ saves: 0, generations: 0, deletions: 0 });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports rejects denied, missing, false, partial and lost PDF deletion receipts without replaying the DELETE', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['tasks-delete-denied', 'tasks-delete-missing', 'tasks-delete-false', 'tasks-delete-partial', 'tasks-delete-lost', 'tasks-delete-wrong-count'] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_task_delete', { report_id: 71, task_id: '1001', confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/not retried|HTTP 403/);
        expect(error.message).not.toContain('fixture-secret');
        expect(reportingFixture.lifecycle.recoveryCounts()).toEqual({ taskDeletes: 1, restores: 0 });
        const remaining = yield* semrush.report(yield* parseReport('reporting_tasks', { report_id: 71 }));
        const expected = ['tasks-delete-denied', 'tasks-delete-false', 'tasks-delete-partial'].includes(scenario) ? ['1001', '1002', '1003'] : ['1002', '1003'];
        expect(remaining.data).toHaveProperty('reports.nodes.0.tasks', expected.map(id => expect.objectContaining({ id })));
        expect(reportingFixture.lifecycle.counts()).toMatchObject({ saves: 0, generations: 0, deletions: 0 });
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports restoration returns the retained document to visibility with its original settings and PDF generation', async () => {
  reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use('restore-complete');
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      expect((yield* semrush.report(yield* parseReport('reporting_tasks', { report_id: 71 }))).data).toHaveProperty('reports.nodes', []);
      yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 })).pipe(Effect.flip);
      const result = yield* semrush.report(yield* parseReport('reporting_restore', { report_id: 71, confirm: true }));
      expect(result.data).toEqual({ status: 'success', timeResult: 3 });
      expect((yield* semrush.report(yield* parseReport('reporting_get', { report_id: 71 }))).data).toHaveProperty('document', reportingDocument);
      expect((yield* semrush.report(yield* parseReport('reporting_tasks', { report_id: 71 }))).data).toHaveProperty('reports.nodes.0.tasks.0.id', '1001');
      expect(reportingFixture.lifecycle.recoveryCounts()).toEqual({ taskDeletes: 0, restores: 1 });
      expect(reportingFixture.lifecycle.counts()).toMatchObject({ creates: 0, clones: 0, saves: 0, generations: 0, deletions: 0 });
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});

test('My Reports restoration rejects denied, missing, false and lost receipts without replaying the POST', async () => {
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const semrush = yield* Semrush;
      for (const scenario of ['restore-denied', 'restore-missing', 'restore-false', 'restore-lost'] as const) {
        reportingFixture.lifecycle.reset(); reportingFixture.lifecycle.use(scenario);
        const error = yield* semrush.report(yield* parseReport('reporting_restore', { report_id: 71, confirm: true })).pipe(Effect.flip);
        expect(error.message).toMatch(/not retried|HTTP 403|report failed/); expect(error.message).not.toContain('fixture-secret');
        expect(reportingFixture.lifecycle.recoveryCounts()).toEqual({ taskDeletes: 0, restores: 1 });
        const current = semrush.report(yield* parseReport('reporting_get', { report_id: 71 }));
        if (scenario === 'restore-denied' || scenario === 'restore-false') yield* current.pipe(Effect.flip);
        else expect((yield* current).data).toHaveProperty('document.id', 71);
        expect(reportingFixture.lifecycle.counts()).toMatchObject({ creates: 0, saves: 0, generations: 0, deletions: 0 });
      }
    }).pipe(Effect.provide(fixtureLayer()))));
  } finally { reportingFixture.lifecycle.reset(); }
});
