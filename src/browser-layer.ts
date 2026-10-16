import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Config, Effect, Layer, Option, Semaphore, Schema, Predicate, Schedule } from 'effect';
import { chromium, request as browserRequest, type BrowserContext, type Page } from 'patchright';
import JSONbig from 'json-bigint';
import { Semrush } from './browser-service.js';
import { Sessions } from './session-service.js';
import { origin } from './session-layer.js';
import { ReportError, SessionError } from './errors.js';
import { reportResponseType, reportParameters, webRequest, rpcBody, reports, type ReportName, type Query, type WebRequest } from './report-parameters.js';
import type { ReportRequest } from './validation.js';
import { Exports, type ExportWriter } from './exports.js';

type ExportDownload = { readonly request: WebRequest; readonly headers: Record<string, string> } & (
  { readonly kind: 'file' } | { readonly kind: 'job'; readonly filename: string }
);

const transportPaths = new Map([['domain', '/dpa/rpc'], ['direct', '/dpa/rpc'], ['magic', '/kmtgw/v2/webapi'], ['keyword', '/kwogw/v2/webapi'], ['kwm', '/kwm/rpc'], ['ksb', '/ksb/rpc'], ['bla', '/backlink_audit/rpc/']]);
const exportMimeTypes = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain' };
const json = JSONbig({ storeAsString: true, protoAction: 'error', constructorAction: 'error' });
const safeBrowserError = () => new ReportError({ message: 'Semrush browser request failed. Run semrush doctor. If your session expired, sign in again with semrush auth login.' });
const browserCall = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: safeBrowserError });
const objectValue = (value: Schema.Json | undefined): value is Schema.JsonObject => Predicate.isObject(value) && !Array.isArray(value);

/** JSON never passes through the browser's number parser, preserving 64-bit IDs. */
export function parseWire(text: string): Schema.Json { return Schema.decodeUnknownSync(Schema.Json)(json.parse(text)); }

/** Remove credential fields and echoed secrets, including nested provider errors. */
export function redact(value: Schema.Json, secrets: string[]): Schema.Json {
  if (Array.isArray(value)) return value.map(item => redact(item, secrets));
  if (objectValue(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api_?key|key|user_?id|access_token|refresh_token|authorization|cookie|set-cookie|hashes|display_hash|rnd|password|auth_?password|auth_?username|webBotAuthSignature)$/i.test(key)).map(([key, item]) => [key, redact(item, secrets)]));
  if (Predicate.isString(value)) return secrets.filter(secret => secret.length > 0).reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value);
  return value;
}

/** Resolve the two native export contracts without exposing credential-bearing capabilities. */
const nativeExportURL = Effect.fn('Semrush.nativeExportURL')(function* (kind: string, value: Schema.Json | undefined, browserOrigin: string, auth: BootstrapAuth) {
  if (kind === 'export_id') {
    if (!objectValue(value) || !Predicate.isString(value.ExportID) || !value.ExportID) return yield* Effect.fail(new ReportError({ message: 'Semrush did not return an export identifier.' }));
    const address = new URL('/kwm/download-export-v2', browserOrigin);
    address.search = new URLSearchParams({ userId: String(auth.userId), apiKey: auth.apiKey, exportId: value.ExportID }).toString();
    return address.href;
  }
  if (!objectValue(value) || !Predicate.isString(value.url)) return yield* Effect.fail(new ReportError({ message: 'Semrush did not return an export download URL.' }));
  const href = value.url;
  const destination = yield* Effect.try({ try: () => new URL(href), catch: () => new ReportError({ message: 'Semrush returned an invalid export URL.' }) });
  const allowedOrigin = destination.origin === browserOrigin || browserOrigin === origin && destination.origin === 'https://semrush.com';
  if (!allowedOrigin || !destination.pathname.startsWith('/ksb/export/') || destination.username || destination.password || destination.hash) return yield* Effect.fail(new ReportError({ message: 'Semrush returned an export URL outside its supported download origin or path.' }));
  return destination.href;
});

export const makeSemrushLayer = (browserOrigin: string) => Layer.effect(Semrush, Effect.gen(function* () {
  const sessions = yield* Sessions;
  const exports = yield* Exports;
  const executable = yield* Config.option(Config.String('SEMRUSH_BROWSER_EXECUTABLE'));
  const headers = yield* sessions.headers();
  const browser = yield* Effect.acquireRelease(browserCall(() => chromium.launch({ headless: true, executablePath: Option.getOrUndefined(executable) })), browser => Effect.promise(() => browser.close()));
  const context = yield* browserCall(() => browser.newContext({ userAgent: 'OpenAI File Downloader, XaiImageApiFetch/1.0', acceptDownloads: true }));
  const cookieHeader = headers.Cookie ?? headers.cookie ?? '';
  yield* browserCall(() => context.addCookies(cookieHeader.split(';').filter(cookie => cookie.includes('=')).map(cookie => {
    const separator = cookie.indexOf('=');
    return { name: cookie.slice(0, separator).trim(), value: cookie.slice(separator + 1).trim(), url: browserOrigin, httpOnly: true, secure: browserOrigin.startsWith('https:'), sameSite: 'Lax' as const };
  })));
  const page = yield* browserCall(() => context.newPage());
  yield* browserCall(() => page.goto(browserOrigin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 45000 }));
  const bootstrap = yield* browserCall(() => page.evaluate(async () => {
    const response = await fetch('/analytics/overview/?db=us', { credentials: 'include', signal: AbortSignal.timeout(45000) });
    return { status: response.status, text: await response.text() };
  }));
  // Extract the JSON value with a balanced scanner, never eval page-owned JavaScript.
  const { email, ...auth } = yield* Effect.try({ try: () => readBootstrap(bootstrap.text), catch: () => new SessionError({ message: 'Semrush sign-in metadata unavailable. Run semrush auth login or import a signed-in browser.' }) });
  const semaphore = yield* Semaphore.make(1);
  let spectrumToken = '';
  const request = Effect.fn('Semrush.request')(function* (path: string, payload: Schema.Json, method = 'POST', extraHeaders: Record<string, string> = {}, responseType: 'json' | 'empty' = 'json', file?: WebRequest['file']) {
    const secrets = [auth.apiKey, spectrumToken, spectrumToken.replace(/^Bearer /, ''), objectValue(payload) && Predicate.isString(payload.display_hash) ? payload.display_hash : '', objectValue(payload) && Predicate.isString(payload.authPassword) ? payload.authPassword : ''];
    // Chromium fetch can replay a POST after a connection reset. The context's
    // HTTP client shares its cookie jar and gives us an explicit no-retry contract.
    const wire = yield* browserCall(async () => {
      const address = new URL(path, browserOrigin);
      const queryOnly = method === 'GET' || method === 'DELETE';
      if (queryOnly) for (const [key, value] of Object.entries(payload ?? {})) for (const item of Array.isArray(value) ? value : [value]) address.searchParams.append(key, String(item));
      const headers = { Origin: browserOrigin, Referer: page.url(), ...extraHeaders };
      const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {};
      if (file) {
        for (const [key, value] of Object.entries(payload ?? {})) multipart[key] = String(value);
        multipart[file.field] = { name: file.filename, mimeType: 'text/plain', buffer: Buffer.from(file.contents) };
      } else if (['POST', 'PUT', 'PATCH'].includes(method)) Object.assign(headers, { 'Content-Type': 'application/json' });
      const response = await context.request.fetch(address.href, {
        method, headers, timeout: 45000, maxRetries: 0,
        ...(file ? { multipart } : !queryOnly && payload !== null ? { data: JSON.stringify(payload) } : {}),
      });
      try { return { status: response.status(), text: await response.text() }; }
      finally { await response.dispose(); }
    });
    if (wire.status < 200 || wire.status >= 300) {
      const detail = yield* Effect.try({ try: () => JSON.stringify(redact(parseWire(wire.text), secrets)).slice(0, 500), catch: safeBrowserError }).pipe(Effect.option);
      return yield* Effect.fail(new ReportError({ message: `Semrush request returned HTTP ${wire.status}.${Option.isSome(detail) ? ' ' + detail.value : ' Check your session and account permissions.'}` }));
    }
    if (wire.status === 204 && !wire.text) return null;
    if (responseType === 'empty') {
      if (wire.text.length > 0) return yield* Effect.fail(new ReportError({ message: 'Semrush completed the action but returned an unexpected body. Inspect the current campaign before sending another write.' }));
      return null;
    }
    const body = yield* Effect.try({ try: () => parseWire(wire.text), catch: () => new ReportError({ message: 'Semrush returned a page or challenge instead of JSON. Sign in again or retry later.' }) });
    if (file && path.startsWith('/siteaudit/') && (!objectValue(body) || !objectValue(body.status) || body.status.code !== 0)) return yield* Effect.fail(new ReportError({ message: `Semrush rejected the crawl URL upload: ${JSON.stringify(redact(body, secrets)).slice(0, 500)}` }));
    if (path === '/tracking/alerts/' && objectValue(body) && body.error_code !== 0) return yield* Effect.fail(new ReportError({ message: `Semrush tracking alert request failed: ${JSON.stringify(redact(body.error_message ?? body, [auth.apiKey])).slice(0, 500)}` }));
    if (objectValue(body) && ('error' in body && body.error !== false || (!path.startsWith('/siteaudit/') && 'status' in body && !(body.status === null || body.status === 'SUCCESS' || body.status === 'success' || body.status === 'ok')))) return yield* Effect.fail(new ReportError({ message: `Semrush report failed: ${JSON.stringify(redact(body.error ?? body.error_message ?? body.status ?? null, secrets)).slice(0, 500)}` }));
    return body;
  });
  const rpc = Effect.fn('Semrush.rpc')(function* (method: string, params: Query, transport = 'keyword', webReport = 'domain.overview') {
    const payload = transport === 'domain' ? { request_id: randomUUID(), report: webReport, args: params, ...auth } : transport === 'direct' ? { ...params, ...auth } : params;
    const rpcParams = transport === 'kwm' ? { ...payload, ...(method.startsWith('user.') ? { api_key: auth.apiKey, user_id: auth.userId } : { APIKey: auth.apiKey, UserID: auth.userId }) } : payload;
    const extra: Record<string, string> = ['kwm', 'ksb'].includes(transport) ? { 'api-key': auth.apiKey, 'user-id': String(auth.userId) } : {};
    if (transport === 'bla') extra.Authorization = auth.apiKey;
    const path = transportPaths.get(transport) ?? '/kwogw/v2/webapi';
    const body = yield* request(transport === 'bla' ? path + '?method=' + encodeURIComponent(method) : path, rpcBody(method, rpcParams), 'POST', extra);
    if (!objectValue(body) || !('result' in body)) return yield* Effect.fail(new ReportError({ message: `Semrush ${method}: missing report result.` }));
    return body.result ?? null;
  });
  /** Fill the wizard's recommended values only for a new campaign; edits remain partial. */
  const createBacklinkAudit = Effect.fn('Semrush.createBacklinkAudit')(function* (params: Query) {
    const campaigns = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ projectId: Schema.Number, userDomainId: Schema.NullOr(Schema.Number) })))(yield* rpc('domains.GetAll', {}, 'bla'))
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit campaign discovery returned an unexpected response. No audit was created.' })));
    if (campaigns.some(campaign => campaign.projectId === params.projectId && campaign.userDomainId !== null)) return yield* Effect.fail(new ReportError({ message: 'This SEO project already has a Backlink Audit. Use backlink-audit-configure to change its settings.' }));
    const defaults = yield* Schema.decodeUnknownEffect(Schema.Struct({ defaultBrands: Schema.Array(Schema.String), defaultCategories: Schema.Array(Schema.String), defaultGeo: Schema.Array(Schema.String) }))(
      yield* rpc('domains.GetProject', { projectId: params.projectId ?? null }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit setup metadata is unavailable. Inspect backlink-audit-project before creating an audit.' })));
    const settings: Query = { brands: [...defaults.defaultBrands], categories: [...defaults.defaultCategories], geo: [...defaults.defaultGeo] };
    Object.assign(settings, params.params);
    return { ...params, params: settings };
  });
  /** A scope change replaces the audit; copy settings into that single native write. */
  const replaceBacklinkAuditScope = Effect.fn('Semrush.replaceBacklinkAuditScope')(function* (params: Query) {
    const current = yield* Schema.decodeUnknownEffect(Schema.Struct({
      userDomainId: Schema.Int, projectId: Schema.Int, scope: Schema.String,
      isOwner: Schema.Boolean, isSharedWrite: Schema.Boolean,
      statusId: Schema.Number, isLocked: Schema.Boolean, isLockedSettings: Schema.Boolean,
      params: Schema.StructWithRest(Schema.Struct({
        brands: Schema.optionalKey(Schema.Array(Schema.String)),
        categories: Schema.Array(Schema.String), geo: Schema.Array(Schema.String), recrawl: Schema.String,
        recrawlNotify: Schema.optionalKey(Schema.Boolean), recrawlMajestic: Schema.optionalKey(Schema.Boolean),
      }), [Schema.Record(Schema.String, Schema.Json)]),
    }))(yield* rpc('domains.GetByProjectId', { projectId: params.projectId ?? null }, 'bla'))
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit metadata is unavailable. No scope replacement was started.' })));
    if (current.projectId !== params.projectId) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned a different SEO project. No scope replacement was started.' }));
    if (!current.isOwner && !current.isSharedWrite) return yield* Effect.fail(new ReportError({ message: 'This Backlink Audit is read-only. Scope replacement requires permission to edit it.' }));
    if (current.scope === params.scope) return yield* Effect.fail(new ReportError({ message: 'This Backlink Audit already uses the selected scope. No replacement was started.' }));
    if (current.statusId !== 1 || current.isLocked || current.isLockedSettings) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit is not ready for scope replacement. Require statusId:1, isLocked:false and isLockedSettings:false.' }));
    // Native info omits empty brands and false flags. Explicit values prevent fresh defaults.
    const settings: Query = { ...current.params, brands: current.params.brands ?? [],
      recrawlNotify: current.params.recrawlNotify ?? false, recrawlMajestic: current.params.recrawlMajestic ?? false };
    const created = yield* rpc('domains.AddByProjectId', { ...params, params: settings }, 'bla');
    const acknowledgement = yield* Schema.decodeUnknownEffect(Schema.Struct({ userDomainId: Schema.Int, projectId: Schema.Int, scope: Schema.String }))(created)
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit did not acknowledge scope replacement. Read backlink-audit-info before retrying; the write was not retried.' })));
    if (acknowledgement.userDomainId === current.userDomainId || acknowledgement.projectId !== current.projectId || acknowledgement.scope !== params.scope) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected replacement audit. Read backlink-audit-info before retrying; the write was not retried.' }));
    return created;
  });
  /** Reruns require native readiness and the current incremental-import allowance. */
  const checkBacklinkAuditControl = Effect.fn('Semrush.checkBacklinkAuditControl')(function* (query: Query) {
    const current = yield* Schema.decodeUnknownEffect(Schema.Struct({
      domain: Schema.Struct({ statusId: Schema.Number, isLocked: Schema.Boolean, isLockedSettings: Schema.Boolean }), incImportAvailable: Schema.Boolean,
    }))(yield* rpc('domains.GetStatus', { userDomainId: query.audit_id ?? null, background: false }, 'bla'))
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit state is unavailable. No campaign change was sent.' })));
    if (current.domain.statusId !== 1 || current.domain.isLocked || current.domain.isLockedSettings) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit is not ready for campaign changes. Read backlink-audit-status; require statusId:1, isLocked:false and isLockedSettings:false.' }));
    if (!current.incImportAvailable) return yield* Effect.fail(new ReportError({ message: 'Semrush currently disallows another audit rerun. Read backlink-audit-status and wait for incImportAvailable:true.' }));
  });
  /** Use the native campaign file endpoints without exposing account query parameters or keys. */
  const backlinkAuditFile = Effect.fn('Semrush.backlinkAuditFile')(function* (query: Query, planned: WebRequest) {
    const current = yield* Schema.decodeUnknownEffect(Schema.Struct({ domain: Schema.Struct({ statusId: Schema.Number, isLockedSettings: Schema.Boolean }) }))(
      yield* rpc('domains.GetStatus', { userDomainId: query.audit_id ?? null, background: false }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit state is unavailable. No file request was sent.' })));
    if (current.domain.statusId !== 1 || current.domain.isLockedSettings) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit is not ready for file operations. Inspect backlink-audit-status; files require statusId:1 and isLockedSettings:false.' }));
    const endpoints = yield* Schema.decodeUnknownEffect(Schema.Struct({ disavowDownload: Schema.String, disavowUpload: Schema.String, disavowUploadFormField: Schema.String }))(
      yield* rpc('domains.GetEndpoints', { userDomainId: query.audit_id ?? null }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit file metadata is unavailable. No file request was sent.' })));
    if (planned.file && planned.file.field !== endpoints.disavowUploadFormField) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected upload field.' }));
    const resource = planned.file ? endpoints.disavowUpload : endpoints.disavowDownload;
    const address = yield* Effect.try({ try: () => new URL('/backlink_audit' + resource, browserOrigin), catch: () => new ReportError({ message: 'Backlink Audit returned an invalid file endpoint.' }) });
    if (address.origin !== browserOrigin || address.pathname !== planned.path) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected file endpoint.' }));
    const body: Query = { apiKey: auth.apiKey };
    return { ...planned, path: address.href, headers: {}, body };
  });
  /** The native importer stages one file before committing its source URLs to the audit. */
  const importBacklinks = Effect.fn('Semrush.importBacklinks')(function* (query: Query, planned: WebRequest) {
    const current = yield* Schema.decodeUnknownEffect(Schema.Struct({ domain: Schema.Struct({
      statusId: Schema.Number, isLocked: Schema.Boolean, isLockedSettings: Schema.Boolean,
    }) }))(yield* rpc('domains.GetStatus', { userDomainId: query.audit_id ?? null, background: false }, 'bla'))
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit state is unavailable. No CSV import was started.' })));
    if (current.domain.statusId !== 1 || current.domain.isLocked || current.domain.isLockedSettings) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit is not ready for CSV import. Read backlink-audit-status; require statusId:1, isLocked:false and isLockedSettings:false.' }));
    const endpoints = yield* Schema.decodeUnknownEffect(Schema.Struct({ backlinksUpload: Schema.String, backlinksUploadFormField: Schema.String }))(
      yield* rpc('domains.GetEndpoints', { userDomainId: query.audit_id ?? null }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit upload metadata is unavailable. No CSV import was started.' })));
    const file = planned.file;
    if (!file || file.field !== endpoints.backlinksUploadFormField) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected CSV upload field. No import was started.' }));
    const address = yield* Effect.try({ try: () => new URL('/backlink_audit' + endpoints.backlinksUpload, browserOrigin), catch: () => new ReportError({ message: 'Backlink Audit returned an invalid CSV upload endpoint.' }) });
    if (address.origin !== browserOrigin || address.pathname !== planned.path) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected CSV upload endpoint. No import was started.' }));
    const hash = yield* Schema.decodeUnknownEffect(Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+$/)))(
      yield* rpc('backlinks.StartUpload', {}, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit did not return a valid CSV staging handle. No file was committed.' })));
    address.pathname += '/' + encodeURIComponent(hash);
    const uploaded = yield* Schema.decodeUnknownEffect(Schema.Struct({ error: Schema.Literal(false), file: Schema.Struct({
      name: Schema.String, size: Schema.Int, id: Schema.String, urls: Schema.Int,
    }) }))(yield* request(address.href, { apiKey: auth.apiKey }, 'POST', {}, 'json', file))
      .pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit returned an invalid CSV staging response. No file was committed.' })));
    if (uploaded.file.urls < 1) return yield* Effect.fail(new ReportError({ message: 'Semrush found no importable source URLs in the CSV. Put source URLs in the first column. No file was committed.' }));
    // Finish is a write, never retried. A following status read observes asynchronous crawling.
    const result = yield* Schema.decodeUnknownEffect(Schema.Literal(true))(
      yield* rpc('backlinks.FinishUpload', { userDomainId: query.audit_id ?? null, hash }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit did not acknowledge the CSV import. Read backlink-audit-status before retrying; the finish request was not retried.' })));
    return { file: uploaded.file, result };
  });
  const checkAuditSettings = Effect.fn('Semrush.checkAuditSettings')(function* (name: string, query: Query) {
    if (name === 'audit_abort' || name === 'audit_finalize') {
      const states = yield* request('/siteaudit/private/polling', { campaignIds: String(query.campaign_id), key: auth.apiKey }, 'GET');
      const state = Array.isArray(states) ? states.find(state => objectValue(state) && String(state.id) === String(query.campaign_id)) : undefined;
      if (!objectValue(state) || state.is_allowed_stopping !== true) return yield* Effect.fail(new ReportError({ message: 'This crawl cannot be stopped in its current phase. Read audit-execution and wait for is_allowed_stopping:true before sending another stop action.' }));
    }
    if (name === 'audit_create') {
      const campaigns = yield* request('/siteaudit/api/campaigns/seolist', { key: auth.apiKey }, 'GET');
      if (!Array.isArray(campaigns)) return yield* Effect.fail(new ReportError({ message: 'Site Audit campaign discovery returned an unexpected response. No settings were saved.' }));
      if (campaigns.some(campaign => objectValue(campaign) && String(campaign.id) === String(query.campaign_id))) return yield* Effect.fail(new ReportError({ message: 'This SEO project already has a Site Audit. Use audit-configure to replace its settings explicitly.' }));
    }
    // The audit save endpoint replaces settings, including protected-site credentials.
    if (name === 'audit_configure') {
      const current = yield* request(`/siteaudit/api/campaigns/${query.campaign_id}/info?key=${encodeURIComponent(auth.apiKey)}`, {}, 'GET');
      if (objectValue(current) && Predicate.isString(current.projectDomain) && current.projectDomain !== query.domain) return yield* Effect.fail(new ReportError({ message: 'The audit domain must match the SEO project website. Inspect audit-info for projectDomain before configuring it.' }));
      if (objectValue(current) && (Boolean(current.webBotAuthEnabled) || (objectValue(current.gaSettings) && Object.keys(current.gaSettings).length > 0))) return yield* Effect.fail(new ReportError({ message: 'This audit uses Web Bot Auth or Google Analytics. Edit its settings in the Semrush web UI to preserve those connections.' }));
      if (objectValue(current) && current.authEnabled && query.auth_enabled === undefined) return yield* Effect.fail(new ReportError({ message: 'This audit uses protected-site authentication. Set --auth-enabled true to keep it, or false to explicitly disable it.' }));
      if (objectValue(current) && !current.authEnabled && query.auth_enabled === true && !query.auth_password) return yield* Effect.fail(new ReportError({ message: 'Enabling HTTP authentication requires both auth_username and auth_password. Supply the password through --auth-password-file.' }));
    }
  });
  /** Native CSV jobs return a filename; endpoint account metadata stays inside the adapter. */
  const backlinkAuditCSV = Effect.fn('Semrush.backlinkAuditCSV')(function* (query: Query, params: Query): Effect.fn.Return<ExportDownload, ReportError> {
    const endpoints = yield* Schema.decodeUnknownEffect(Schema.Struct({ backlinksDownload: Schema.String }))(
      yield* rpc('domains.GetEndpoints', { userDomainId: query.audit_id ?? null }, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit CSV endpoint metadata is unavailable. No export job was started.' })));
    const address = yield* Effect.try({ try: () => new URL('/backlink_audit' + endpoints.backlinksDownload, browserOrigin), catch: () => new ReportError({ message: 'Backlink Audit returned an invalid CSV endpoint.' }) });
    if (address.origin !== browserOrigin || address.pathname !== '/backlink_audit/files/backlinks/download/' + query.audit_id) return yield* Effect.fail(new ReportError({ message: 'Backlink Audit returned an unexpected CSV endpoint. No export job was started.' }));
    const job = yield* Schema.decodeUnknownEffect(Schema.Struct({ filename: Schema.String }))(
      yield* rpc('backlinks.StartBacklinksCSVExport', params, 'bla'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Backlink Audit did not return an export filename. Inspect the audit before starting another job.' })));
    address.searchParams.set('filename', job.filename);
    return { kind: 'job', request: { method: 'GET', path: address.href, body: {} }, headers: { Authorization: auth.apiKey }, filename: job.filename };
  });
  const downloadExport = Effect.fn('Semrush.downloadExport')(function* (downloadRequest: ExportDownload, format: Schema.Json | undefined, writer: ExportWriter) {
    const { request, headers } = downloadRequest;
    const extension = format === 'xlsx' ? 'xlsx' : format === 'txt' ? 'txt' : 'csv';
    const address = new URL(request.path, browserOrigin);
    if (request.method === 'GET') {
      for (const [key, value] of Object.entries(request.body ?? {})) address.searchParams.set(key, String(value));
    }
    // A separate scoped client can abort a file transfer without disposing the
    // report client's cookie jar. Its derived cookies never persist outside Galleton.
    const client = yield* Effect.acquireRelease(browserCall(async () => browserRequest.newContext({
      storageState: { cookies: await context.cookies(), origins: [] },
      userAgent: 'OpenAI File Downloader, XaiImageApiFetch/1.0',
    })), client => browserCall(async () => {
      try {
        const state = await client.storageState();
        await context.clearCookies();
        await context.addCookies(state.cookies);
      }
      finally { await client.dispose(); }
    }).pipe(Effect.ignore));
    const fetchFile = browserCall(async () => {
      const encoding = request.encoding ?? 'json';
      const multipart = Object.fromEntries(Object.entries(request.body ?? {}).map(([key, value]) => [key, String(value)]));
      const requestHeaders = { Origin: browserOrigin, Referer: page.url(), ...headers };
      if (request.method !== 'GET' && encoding !== 'multipart') Object.assign(requestHeaders, {
        'Content-Type': encoding === 'form' ? 'application/x-www-form-urlencoded' : 'application/json', ...headers,
      });
      const options: NonNullable<Parameters<typeof client.fetch>[1]> = {
        method: request.method, headers: requestHeaders, timeout: 45000, maxRetries: 0,
      };
      if (request.method !== 'GET') {
        if (encoding === 'multipart') options.multipart = multipart;
        else options.data = encoding === 'form' ? new URLSearchParams(multipart).toString() : JSON.stringify(request.body);
      }
      const response = await client.fetch(address.href, options);
      try {
        const status = response.status();
        const contentType = response.headers()['content-type'] ?? '';
        if (status === 202 || !response.ok() || /text\/html|application\/(?:[^;]+\+)?json/i.test(contentType)) return { status };
        const disposition = response.headers()['content-disposition'] ?? '';
        const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const nativeFilename = downloadRequest.kind === 'job' ? downloadRequest.filename
          : encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"|filename=([^;]+)/i)?.slice(1).find(Boolean)?.trim() ?? 'semrush-export.' + extension;
        return { status, filename: basename(nativeFilename.replaceAll('\\', '/')).replaceAll(auth.apiKey, '[redacted]'), bytes: await response.body() };
      } finally { await response.dispose(); }
    });
    const file = yield* downloadRequest.kind === 'job' ? fetchFile.pipe(
      Effect.repeat({ schedule: Schedule.spaced('2 seconds'), until: response => response.status !== 202 }),
      Effect.timeoutOrElse({ duration: '5 minutes', orElse: () => Effect.fail(new ReportError({ message: 'Semrush CSV export did not finish within five minutes. Inspect the audit before starting another export.' })) }),
    ) : fetchFile;
    if (!file.bytes || !file.filename) return yield* Effect.fail(new ReportError({ message: 'Semrush did not return an export file (HTTP ' + file.status + '). Check your session, export permissions and selected resource.' }));
    const bytes = file.bytes;
    return yield* writer.create(file.filename, exportMimeTypes[extension], (destination, signal) => writeFile(destination, bytes, { mode: 0o600, signal }));
  });
  /** Native All reports starts separate downloads; stage them privately before publishing one archive. */
  const auditExportAll = Effect.fn('Semrush.auditExportAll')(function* (query: Query) {
    const snapshot = Schema.Struct({ snapshot_id: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,128}$/)), finish_date: Schema.Number });
    const metadata = Schema.Struct({ current_snapshot: Schema.NullOr(snapshot), jsImpactReportDataAvailable: Schema.NullOr(Schema.Boolean) });
    const infoPath = '/siteaudit/api/campaigns/' + query.campaign_id + '/info';
    const readInfo = Effect.fn('Semrush.auditExportInfo')(function* () {
      return yield* Schema.decodeUnknownEffect(metadata)(yield* request(infoPath, { key: auth.apiKey }, 'GET')).pipe(
        Effect.mapError(() => new ReportError({ message: 'Site Audit export metadata is unavailable. Inspect the campaign before exporting all reports.' })),
      );
    });
    const initial = yield* readInfo();
    const current = initial.current_snapshot;
    if (!current || current.finish_date <= 0) return yield* Effect.fail(new ReportError({ message: 'All reports requires a completed Site Audit crawl. Inspect the campaign with semrush audit-info.' }));
    const history = yield* Schema.decodeUnknownEffect(Schema.Struct({ snapshots: Schema.Array(snapshot) }))(
      yield* request('/siteaudit/api/campaigns/' + query.campaign_id + '/snapshots', { key: auth.apiKey }, 'GET'),
    ).pipe(Effect.mapError(() => new ReportError({ message: 'Site Audit snapshot history is unavailable. No report downloads were started.' })));
    if (!history.snapshots.some(row => row.snapshot_id === current.snapshot_id)) return yield* Effect.fail(new ReportError({ message: 'Site Audit history does not contain the current crawl. Retry after the crawl has finished.' }));
    const previous = history.snapshots.filter(row => row.snapshot_id !== current.snapshot_id && row.finish_date > 0 && row.finish_date < current.finish_date).sort((a, b) => b.finish_date - a.finish_date)[0];
    const format = query.format ?? 'csv';
    const table = { format, relative: query.relative ?? false, sort: query.sort ?? 'url_asc', filter: query.filter ?? '' };
    const pages = { snapshot_id: current.snapshot_id, ...table };
    const downloads: { name: ReportName; query: Query }[] = [
      { name: 'audit_export_pages', query: pages },
      { name: 'audit_export_page_issues', query: { campaign_id: query.campaign_id ?? null, ...table } },
      { name: 'audit_export_markup', query: pages },
      { name: 'audit_export_issues', query: { snapshot_id: current.snapshot_id, format } },
    ];
    const omitted: Schema.Json[] = [];
    if (previous) downloads.push({ name: 'audit_export_compare', query: { first_snapshot_id: previous.snapshot_id, second_snapshot_id: current.snapshot_id, format } });
    else omitted.push({ report: 'audit_export_compare', reason: 'No earlier completed snapshot is available.' });
    if (initial.jsImpactReportDataAvailable) downloads.push({ name: 'audit_export_js_impact', query: { campaign_id: query.campaign_id ?? null, format, sort: 'desc', status: 'all' } });
    else omitted.push({ report: 'audit_export_js_impact', reason: 'JS Impact data is unavailable for the selected crawl.' });
    return yield* exports.archive('semrush-site-audit-' + query.campaign_id + '.zip', writer => Effect.gen(function* () {
      const files: { uri: string; filename: string }[] = [];
      const manifestFiles: Schema.Json[] = [];
      for (const download of downloads) {
        const definition = reports[download.name];
        const prepared = yield* prepareWebRequest({ name: download.name, definition, query: download.query }, webRequest(definition, download.query));
        const artifact = yield* Effect.scoped(downloadExport({ kind: 'file', request: prepared, headers: prepared.headers }, format, writer));
        const filename = download.name.replaceAll('_', '-') + '.' + format;
        files.push({ uri: artifact.uri, filename });
        manifestFiles.push({ report: download.name, filename, provider_filename: artifact.filename, mime_type: artifact.mime_type, size_bytes: artifact.size_bytes });
      }
      const latest = yield* readInfo();
      if (latest.current_snapshot?.snapshot_id !== current.snapshot_id) return yield* Effect.fail(new ReportError({ message: 'The latest Site Audit crawl changed during download. No archive was saved. Retry after the crawl has finished.' }));
      return { files, manifest: { campaign_id: query.campaign_id ?? null, snapshot_id: current.snapshot_id, comparison: previous ? { first_snapshot_id: previous.snapshot_id, second_snapshot_id: current.snapshot_id } : null, format, files: manifestFiles, omitted } };
    }));
  });
  /** Prepare native tracking bodies. Settings replace all fields and require current values plus fresh edit metadata. */
  const trackingBody = Effect.fn('Semrush.trackingBody')(function* (definition: ReportRequest['definition'], query: Query, changes: Schema.Json) {
    if (definition.method === '/tracking/alerts/') return Object.assign({ key: auth.apiKey }, changes);
    if (definition.method !== '/positions/api/campaign_edit_domain_settings') return changes;
    const current = yield* request(`/tracking/web-api/management/campaign/${query.campaign_id}/info`, { api_key: auth.apiKey }, 'GET');
    const metadata = yield* Schema.decodeUnknownEffect(Schema.Struct({ data: Schema.Struct({
      can_edit: Schema.Boolean,
      campaign_settings: Schema.Struct({ tracking_url: Schema.String, tracking_url_type: Schema.String,
        business_name: Schema.NullOr(Schema.String), brands: Schema.NullOr(Schema.Array(Schema.String)) }),
      filters: Schema.Struct({ volume_type: Schema.String }),
    }) }))(current).pipe(Effect.mapError(() => new ReportError({ message: 'Tracking settings are unavailable. Inspect the target with semrush position-info before editing it.' })));
    if (!metadata.data.can_edit) return yield* Effect.fail(new ReportError({ message: 'Semrush reports this tracking target as read-only. Use a target you can edit.' }));
    const hashes = yield* request('/tracking/hashes', { id: query.campaign_id ?? null }, 'GET');
    const edit = yield* Schema.decodeUnknownEffect(Schema.Struct({ info: Schema.Struct({ campaign_edit: Schema.Struct({ hash: Schema.String, random: Schema.Number }) }) }))(hashes)
      .pipe(Effect.mapError(() => new ReportError({ message: 'Tracking edit metadata is unavailable. Reimport your signed-in session and inspect the target before another edit.' })));
    const settings = metadata.data.campaign_settings;
    // The native UI treats nullable business and brand values as empty.
    return Object.assign({ key: auth.apiKey, campaignId: query.campaign_id ?? null, domain: settings.tracking_url,
      type: settings.tracking_url_type, businessName: settings.business_name ?? '', brands: settings.brands ?? [],
      volume_type: metadata.data.filters.volume_type, display_hash: edit.info.campaign_edit.hash, rnd: edit.info.campaign_edit.random }, changes);
  });
  /** Target replacement clears history; retain the wizard's current settings and complete keyword/tag selection. */
  const targetBody = Effect.fn('Semrush.targetBody')(function* (name: string, query: Query, changes: Schema.Json) {
    if (name !== 'position_replace' && name !== 'position_delete') return changes;
    const current = yield* request(`/tracking/web-api/management/campaign/${query.campaign_id}/info`, { api_key: auth.apiKey }, 'GET');
    if (!objectValue(current) || !objectValue(current.data) || current.data.can_edit !== true) return yield* Effect.fail(new ReportError({ message: 'This tracking target is read-only or its settings are unavailable. Inspect position-info before changing it.' }));
    const hashes = yield* request('/tracking/hashes', { id: query.campaign_id ?? null }, 'GET');
    const hashName = name === 'position_delete' ? 'add_keywords' : 'campaign_create';
    const nativeHash = objectValue(hashes) && objectValue(hashes.info) ? hashes.info[hashName] : null;
    const capability = yield* Schema.decodeUnknownEffect(Schema.Struct({ hash: Schema.String, random: Schema.Number }))(nativeHash)
      .pipe(Effect.mapError(() => new ReportError({ message: 'Tracking target request metadata is unavailable. Inspect the target before another write.' })));
    const privateFields = { key: auth.apiKey, display_hash: capability.hash, rnd: capability.random };
    if (name === 'position_delete') return privateFields;
    const metadata = yield* Schema.decodeUnknownEffect(Schema.Struct({
      campaign_settings: Schema.Struct({ title: Schema.String, tracking_url: Schema.String, tracking_url_type: Schema.String,
        business_name: Schema.NullOr(Schema.String), brands: Schema.NullOr(Schema.Array(Schema.String)), weekly_notification: Schema.Boolean,
        targeting: Schema.Struct({ engine: Schema.String, device: Schema.String, language: Schema.String }) }),
      location: Schema.Struct({ id: Schema.Number }), filters: Schema.Struct({ volume_type: Schema.String }),
    }))(current.data).pipe(Effect.mapError(() => new ReportError({ message: 'Tracking replacement settings are unavailable. No target was replaced.' })));
    const allKeywords = yield* request(`/tracking/web-api/management/campaign/${query.campaign_id}/keywords`, {}, 'GET');
    const selected = yield* Schema.decodeUnknownEffect(Schema.Struct({ data: Schema.Array(Schema.Struct({ keyword: Schema.String, tags: Schema.Array(Schema.String) })) }))(allKeywords)
      .pipe(Effect.mapError(() => new ReportError({ message: 'The complete tracked keyword/tag selection is unavailable. No target was replaced.' })));
    const settings = metadata.campaign_settings;
    return Object.assign({ id: query.campaign_id ?? null, title: settings.title, engine: settings.targeting.engine,
      device_group: settings.targeting.device, location_id: metadata.location.id, language_code: settings.targeting.language,
      businessName: settings.business_name ?? '', brands: [...settings.brands ?? []], volume_type: metadata.filters.volume_type,
      trackingUrl: settings.tracking_url, trackingUrlType: settings.tracking_url_type, weekly_notification: settings.weekly_notification,
      keywords: selected.data.map(keyword => keyword.keyword),
      tags: Object.fromEntries(selected.data.filter(keyword => keyword.tags.length > 0).map(keyword => [keyword.keyword, [...keyword.tags]])),
    }, changes, privateFields);
  });
  /** Notes updates replace native fields; read ownership and retain omitted selections first. */
  const noteBody = Effect.fn('Semrush.noteBody')(function* (name: string, path: string, changes: Schema.Json) {
    if (name !== 'note_update' && name !== 'note_delete') return changes;
    const current = yield* request(path, {}, 'GET', { authorization: 'Token ' + auth.apiKey });
    const note = yield* Schema.decodeUnknownEffect(Schema.Struct({
      id: Schema.Union([Schema.String, Schema.Number]), user_id: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])),
      read_only: Schema.Boolean, category: Schema.String, title: Schema.String, note: Schema.NullOr(Schema.String),
      datetime: Schema.String, tools: Schema.Array(Schema.String), databases: Schema.Array(Schema.String),
      project: Schema.NullOr(Schema.Union([Schema.String, Schema.Number])), link: Schema.NullOr(Schema.String),
    }))(current).pipe(Effect.mapError(() => new ReportError({ message: 'Note metadata is unavailable. Read the note before sending another edit.' })));
    if (note.read_only || note.category !== 'USER_NOTE' || String(note.user_id) !== String(auth.userId)) return yield* Effect.fail(new ReportError({ message: 'Only your own editable user notes can be changed or deleted. Published notes are read-only.' }));
    if (name === 'note_delete') return changes;
    const body: Query = { id: note.id, title: note.title, note: note.note ?? '', datetime: note.datetime,
      tools: [...note.tools], databases: [...note.databases], project: note.project, category: 'USER_NOTE' };
    if (note.link) body.link = note.link;
    Object.assign(body, changes);
    if (!body.link) delete body.link;
    return body;
  });
  /** Acquire native metadata and credentials only after public validation and write consent. */
  const prepareWebRequest = Effect.fn('Semrush.prepareWebRequest')(function* ({ name, definition, query }: ReportRequest, planned: ReturnType<typeof webRequest>) {
    const family = definition.transport;
    if (family === 'bla_file') return yield* backlinkAuditFile(query, planned);
    // The web UI only allows adding a website to a project that has none.
    if (name === 'project_update' && query.domain !== undefined) {
      const current = yield* request('/apis/v4-raw/folders/api/v0/folders/folder', { folder_id: query.folder_id ?? null }, 'GET');
      if (!objectValue(current) || !objectValue(current.folder)) return yield* Effect.fail(new ReportError({ message: 'Project metadata unavailable. Inspect the project before adding a website.' }));
      if (Predicate.isString(current.folder.domain) && current.folder.domain.length > 0) return yield* Effect.fail(new ReportError({ message: 'This project already has a website. The Semrush web UI only allows adding a website when none is set.' }));
    }
    if (family === 'audit_web') yield* checkAuditSettings(name, query);
    const authParameter = family === 'audit_web' ? 'key' : 'auth_parameter' in definition ? definition.auth_parameter : '';
    const path = authParameter ? planned.path + '?' + new URLSearchParams({ [authParameter]: auth.apiKey }) : planned.path;
    const formEncoded = 'encoding' in planned && planned.encoding === 'form';
    const headers: Record<string, string> = family === 'notes_web' && !formEncoded ? { authorization: 'Token ' + auth.apiKey } : {};
    if (formEncoded) return { ...planned, path, headers, body: { token: auth.apiKey } };
    const body = family === 'tracking_web' ? yield* targetBody(name, query, yield* trackingBody(definition, query, planned.body))
      : family === 'notes_web' ? yield* noteBody(name, path, planned.body) : planned.body;
    return { ...planned, path, headers, body };
  });
  const checkSession = Effect.fn('Semrush.checkSession')(function* () {
    const session = yield* browserCall(() => page.evaluate(async () => {
      const response = await fetch('/home/', { method: 'HEAD', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      return { ok: response.ok, path: new URL(response.url).pathname };
    }));
    if (session.path === '/multilogin/') return yield* Effect.fail(new SessionError({ code: 'session_confirmation_required', message: 'Semrush requires session confirmation at /multilogin/. Open Semrush in your signed-in browser, resolve the prompt, then reimport that browser with semrush auth import --cdp-url <url>. No report was sent.' }));
    if (!session.ok || session.path !== '/home/') return yield* Effect.fail(new SessionError({ message: 'Semrush session expired. Run semrush auth login or import a signed-in browser.' }));
  });
  const report = Effect.fn('Semrush.report')(function* ({ name, definition, query }: ReportRequest) {
    yield* checkSession();
    if (name === 'audit_export_all') {
      const archive = yield* auditExportAll(query);
      yield* captureCookies(context, sessions.capture, browserOrigin);
      return { authenticated: true as const, report: name, data: archive.manifest, artifact: archive.artifact };
    }
    const family = definition.transport;
    const responseType = reportResponseType(definition);
    const planned = ['project_web', 'audit_web', 'tracking_web', 'saved_web', 'notes_web', 'bla_file'].includes(family) ? webRequest(definition, query) : undefined;
    const params = planned ? {} : reportParameters(definition, query);
    if (name === 'backlink_audit_export') {
      const prepared = yield* backlinkAuditCSV(query, params);
      const artifact = yield* Effect.scoped(downloadExport(prepared, query.format, exports));
      yield* captureCookies(context, sessions.capture, browserOrigin);
      return { authenticated: true as const, report: name, data: null, artifact };
    }
    let reportData: Schema.Json | undefined;
    let requestSecret = "";
    if (name === 'backlink_audit_replace_scope') {
      reportData = yield* replaceBacklinkAuditScope(params);
    } else if (name === 'backlink_audit_import' && planned) {
      reportData = yield* importBacklinks(query, planned);
    } else if (planned) {
      const prepared = yield* prepareWebRequest({ name, definition, query }, planned);
      if (objectValue(prepared.body) && 'display_hash' in prepared.body && Predicate.isString(prepared.body.display_hash)) requestSecret = prepared.body.display_hash;
      if (responseType === 'download') {
        const artifact = yield* Effect.scoped(downloadExport({ kind: 'file', request: prepared, headers: prepared.headers }, query.format, exports));
        yield* captureCookies(context, sessions.capture, browserOrigin);
        return { authenticated: true as const, report: name, data: null, artifact };
      }
      const wireResponseType = responseType === 'empty' ? 'empty' : 'json';
      reportData = yield* request(prepared.path, prepared.body, prepared.method, prepared.headers, wireResponseType, prepared.file);
    } else if (['keyword', 'domain', 'direct', 'magic', 'kwm', 'ksb', 'bla'].includes(family)) {
      if (name === 'backlink_audit_rerun') yield* checkBacklinkAuditControl(query);
      reportData = yield* rpc(definition.method, name === 'backlink_audit_create' ? yield* createBacklinkAudit(params) : params, family, definition.web_report);
      if (responseType === 'download_url' || responseType === 'export_id') {
        const href = yield* nativeExportURL(responseType, reportData, browserOrigin, auth);
        const artifact = yield* Effect.scoped(downloadExport({ kind: 'file', request: { method: 'GET', path: href, body: {} }, headers: {} }, query.format, exports));
        yield* captureCookies(context, sessions.capture, browserOrigin);
        return { authenticated: true as const, report: name, data: null, artifact };
      }
    } else {
      const extra: Record<string, string> = {};
      if (family === 'gap') {
        if (!spectrumToken) spectrumToken = yield* browserCall(() => observeSpectrum(page, browserOrigin));
        Object.assign(extra, { authorization: spectrumToken, 'x-report': 'gap.keywords', 'x-request-id': randomUUID() });
      }
      let path = definition.method;
      if (family.startsWith('backlink')) {
        path = '/analytics/backlinks/webapi2/';
        params.key = auth.apiKey;
        if (family === 'backlink_overview') {
          path += 'overview/' + definition.method;
          extra['x-request-id'] = randomUUID();
          yield* request('/analytics/backlinks/webapi2/overview/init', params, 'GET', extra);
        }
      } else if (path.startsWith('/siteaudit/')) params.key = auth.apiKey;
      reportData = yield* request(path, params, ['post', 'gap', 'projects'].includes(family) ? 'POST' : 'GET', extra);
    }
    if (responseType === 'boolean' && reportData !== true) return yield* Effect.fail(new ReportError({ message: 'Semrush did not apply the label change. Read labels and target pages before retrying.' }));
    if (definition.total_method) {
      const totalParams = name === 'domain_position_changes' ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'display')) : params;
      const total = yield* rpc(definition.total_method, totalParams, 'domain', definition.web_report);
      reportData = { rows: reportData, total, page: query.page ?? null, page_size: query.page_size ?? null };
    }
    if (name === 'keyword_overview') {
      const rows = objectValue(reportData) ? reportData.keywords : undefined;
      reportData = Array.isArray(rows) ? rows.find(item => objectValue(item) && item.database === query.database) : undefined;
      if (!reportData) return yield* Effect.fail(new ReportError({ message: 'No keyword data for the selected database.' }));
    } else if (name === 'domain_overview') {
      const search = Array.isArray(reportData) ? reportData.find(item => objectValue(item) && item.database === query.database) : undefined;
      if (!search) return yield* Effect.fail(new ReportError({ message: 'No domain data for the selected database.' }));
      reportData = { search, backlinks: yield* rpc('backlinks.Summary', { searchItem: query.domain ?? null, searchType: 'domain' }, 'domain') };
    }
    if (Predicate.isNumber(query.limit) && Array.isArray(reportData)) reportData = reportData.slice(0, query.limit);
    yield* captureCookies(context, sessions.capture, browserOrigin);
    return { authenticated: true as const, report: name, data: redact(reportData ?? null, [auth.apiKey, spectrumToken, spectrumToken.replace(/^Bearer /, ''), requestSecret, Predicate.isString(query.auth_password) ? query.auth_password : '']) };
  });
  return Semrush.of({ account: { email: email ?? null }, report: request => semaphore.withPermits(1)(report(request)) });
}));

export const semrushLive = makeSemrushLayer(origin);

interface BootstrapAuth { readonly apiKey: string; readonly userId: string | number; }
export function readBootstrap(html: string): BootstrapAuth & { readonly email?: string } {
  const match = /window\.sm2\.user\s*=\s*/.exec(html);
  if (!match) throw new Error('No bootstrap');
  const start = match.index + match[0].length;
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      const user = parseWire(html.slice(start, index + 1));
      if (objectValue(user) && Predicate.isString(user.api_key) && (Predicate.isString(user.id) || Predicate.isNumber(user.id))) {
        const auth = { apiKey: user.api_key, userId: user.id };
        if (Predicate.isString(user.email)) return { ...auth, email: user.email };
        return auth;
      }
      break;
    }
  }
  throw new Error('Invalid bootstrap');
}

async function observeSpectrum(page: Page, browserOrigin: string): Promise<string> {
  try {
    // Observe and navigate together so either timeout is handled immediately.
    const [observed] = await Promise.all([
      page.waitForRequest(request => request.url().startsWith(browserOrigin + '/spectrum/') && Boolean(request.headers().authorization), { timeout: 20000 }),
      page.goto(browserOrigin + '/analytics/keywordgap/?db=us', { waitUntil: 'domcontentloaded', timeout: 45000 }),
    ]);
    return observed.headers().authorization ?? '';
  } finally {
    await page.goto(browserOrigin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 45000 });
  }
}

const captureCookies = Effect.fn('Semrush.captureCookies')(function* (context: BrowserContext, capture: (cookies: string[]) => Effect.Effect<void, SessionError>, cookieOrigin: string) {
  const cookies = yield* browserCall(() => context.cookies(cookieOrigin));
  yield* capture(cookies.map(cookie => `${cookie.name}=${cookie.value}; Path=${cookie.path}${cookieOrigin.startsWith('https:') ? '; Secure' : ''}${cookie.httpOnly ? '; HttpOnly' : ''}${cookie.expires > 0 ? '; Expires=' + new Date(cookie.expires * 1000).toUTCString() : ''}`));
});
