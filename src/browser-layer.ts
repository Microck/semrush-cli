import { randomUUID } from 'node:crypto';
import { Config, Effect, Layer, Option, Semaphore, Schema, Predicate } from 'effect';
import { chromium, type BrowserContext, type Download, type Page, type Response } from 'patchright';
import JSONbig from 'json-bigint';
import { Semrush } from './browser-service.js';
import { Sessions } from './session-service.js';
import { origin } from './session-layer.js';
import { ReportError, SessionError } from './errors.js';
import { reportParameters, webRequest, rpcBody, type Query } from './report-parameters.js';
import type { ReportRequest } from './validation.js';
import { Exports } from './exports.js';

interface ExportState { download?: Download; cancel: () => void; }

const transportPaths = new Map([['domain', '/dpa/rpc'], ['direct', '/dpa/rpc'], ['magic', '/kmtgw/v2/webapi'], ['keyword', '/kwogw/v2/webapi'], ['kwm', '/kwm/rpc'], ['ksb', '/ksb/rpc']]);
const json = JSONbig({ storeAsString: true, protoAction: 'error', constructorAction: 'error' });
const safeBrowserError = () => new ReportError({ message: 'Semrush browser request failed. Run semrush doctor. If your session expired, sign in again with semrush auth login.' });
const browserCall = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: safeBrowserError });
const objectValue = (value: Schema.Json | undefined): value is Schema.JsonObject => Predicate.isObject(value) && !Array.isArray(value);

/** JSON never passes through the browser's number parser, preserving 64-bit IDs. */
export function parseWire(text: string): Schema.Json { return Schema.decodeUnknownSync(Schema.Json)(json.parse(text)); }

/** Remove credential fields and echoed secrets, including nested provider errors. */
export function redact(value: Schema.Json, secrets: string[]): Schema.Json {
  if (Array.isArray(value)) return value.map(item => redact(item, secrets));
  if (objectValue(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(api_?key|key|user_?id|access_token|refresh_token|authorization|cookie|set-cookie|hashes|display_hash|rnd)$/i.test(key)).map(([key, item]) => [key, redact(item, secrets)]));
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
  const auth = yield* Effect.try({ try: () => readBootstrap(bootstrap.text), catch: () => new SessionError({ message: 'Semrush sign-in metadata unavailable. Run semrush auth login or import a signed-in browser.' }) });
  const semaphore = yield* Semaphore.make(1);
  let spectrumToken = '';
  const request = Effect.fn('Semrush.request')(function* (path: string, payload: Schema.Json, method = 'POST', extraHeaders: Record<string, string> = {}, responseType: 'json' | 'empty' = 'json') {
    const wire = yield* browserCall(() => page.evaluate(async ({ path, encodedPayload, method, extraHeaders }) => {
      const payload: Schema.Json = JSON.parse(encodedPayload);
      const query = new URLSearchParams();
      const get = method === 'GET';
      if (get) for (const [key, value] of Object.entries(payload ?? {})) for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
      const options: RequestInit = { method, credentials: 'include', headers: extraHeaders, signal: AbortSignal.timeout(45000) };
      // The web clients send JSON content type even for bodyless POST/PUT/PATCH actions.
      if (['POST', 'PUT', 'PATCH'].includes(method)) options.headers = { 'Content-Type': 'application/json', ...extraHeaders };
      if (!get && method !== 'DELETE' && payload !== null) options.body = JSON.stringify(payload);
      const response = await fetch(get && query.size > 0 ? path + (path.includes('?') ? '&' : '?') + query : path, options);
      return { status: response.status, text: await response.text() };
    }, { path, encodedPayload: JSON.stringify(payload), method, extraHeaders }));
    if (wire.status < 200 || wire.status >= 300) {
      const detail = yield* Effect.try({ try: () => JSON.stringify(redact(parseWire(wire.text), [auth.apiKey, spectrumToken, spectrumToken.replace(/^Bearer /, '')])).slice(0, 500), catch: safeBrowserError }).pipe(Effect.option);
      return yield* Effect.fail(new ReportError({ message: `Semrush request returned HTTP ${wire.status}.${Option.isSome(detail) ? ' ' + detail.value : ' Check your session and account permissions.'}` }));
    }
    if (wire.status === 204 && !wire.text) return null;
    if (responseType === 'empty') {
      if (wire.text.length > 0) return yield* Effect.fail(new ReportError({ message: 'Semrush completed the action but returned an unexpected body. Inspect the current campaign before sending another write.' }));
      return null;
    }
    const body = yield* Effect.try({ try: () => parseWire(wire.text), catch: () => new ReportError({ message: 'Semrush returned a page or challenge instead of JSON. Sign in again or retry later.' }) });
    if (path === '/tracking/alerts/' && objectValue(body) && body.error_code !== 0) return yield* Effect.fail(new ReportError({ message: `Semrush tracking alert request failed: ${JSON.stringify(redact(body.error_message ?? body, [auth.apiKey])).slice(0, 500)}` }));
    if (objectValue(body) && ('error' in body || (!path.startsWith('/siteaudit/') && 'status' in body && !(body.status === null || body.status === 'SUCCESS' || body.status === 'success' || body.status === 'ok')))) return yield* Effect.fail(new ReportError({ message: `Semrush report failed: ${JSON.stringify(redact(body.error ?? body.error_message ?? body.status ?? null, [auth.apiKey, spectrumToken, spectrumToken.replace(/^Bearer /, '')])).slice(0, 500)}` }));
    return body;
  });
  const rpc = Effect.fn('Semrush.rpc')(function* (method: string, params: Query, transport = 'keyword', webReport = 'domain.overview') {
    const payload = transport === 'domain' ? { request_id: randomUUID(), report: webReport, args: params, ...auth } : transport === 'direct' ? { ...params, ...auth } : params;
    const rpcParams = transport === 'kwm' ? { ...payload, ...(method.startsWith('user.') ? { api_key: auth.apiKey, user_id: auth.userId } : { APIKey: auth.apiKey, UserID: auth.userId }) } : payload;
    const extra: Record<string, string> = ['kwm', 'ksb'].includes(transport) ? { 'api-key': auth.apiKey, 'user-id': String(auth.userId) } : {};
    const body = yield* request(transportPaths.get(transport) ?? '/kwogw/v2/webapi', rpcBody(method, rpcParams), 'POST', extra);
    if (!objectValue(body) || !('result' in body)) return yield* Effect.fail(new ReportError({ message: `Semrush ${method}: missing report result.` }));
    return body.result ?? null;
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
      if (objectValue(current) && (Boolean(current.authEnabled) || Boolean(current.webBotAuthEnabled) || (objectValue(current.gaSettings) && Object.keys(current.gaSettings).length > 0))) return yield* Effect.fail(new ReportError({ message: 'This audit uses protected-site authentication or Google Analytics. Edit its settings in the Semrush web UI to preserve those connections.' }));
    }
  });
  const downloadExport = Effect.fn('Semrush.downloadExport')(function* (request: ReturnType<typeof webRequest>, format: Schema.Json | undefined) {
    const address = new URL(request.path, browserOrigin);
    if (request.method === 'GET') {
      for (const [key, value] of Object.entries(request.body ?? {})) address.searchParams.set(key, String(value));
    }
    // Own a separate page so a GET error or redirect cannot navigate the report page.
    const state = yield* Effect.acquireRelease(Effect.sync(() => {
      const state: ExportState = { cancel: () => {} };
      return state;
    }), state => Effect.gen(function* () {
      state.cancel();
      const download = state.download;
      if (download) {
        yield* browserCall(() => download.cancel()).pipe(Effect.ignore);
        yield* browserCall(() => download.delete()).pipe(Effect.ignore);
      }
    }));
    const exportPage = yield* Effect.acquireRelease(browserCall(() => context.newPage()), page => browserCall(() => page.close()).pipe(Effect.ignore));
    let file = { url: address.href, filename: '' };
    if (request.method !== 'GET') {
      // JSON POSTs need the web origin. Closing this page aborts fetch and revokes its Blob URL.
      yield* browserCall(() => exportPage.goto(browserOrigin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 45000 }));
      const attachment = yield* browserCall(() => exportPage.evaluate(async ({ address, body, extension }) => {
        const response = await fetch(address, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok || /text\/html|application\/(?:[^;]+\+)?json/i.test(contentType)) return { status: response.status, url: '', filename: '' };
        const disposition = response.headers.get('content-disposition') ?? '';
        const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const filename = encoded ? decodeURIComponent(encoded) : (disposition.match(/filename="([^"]+)"|filename=([^;]+)/i)?.slice(1).find(Boolean)?.trim() ?? 'semrush-export.' + extension);
        return { status: response.status, url: URL.createObjectURL(await response.blob()), filename };
      }, { address: address.href, body: request.body, extension: format === 'xlsx' ? 'xlsx' : 'csv' }));
      if (!attachment.url) return yield* Effect.fail(new ReportError({ message: `Semrush did not return an export file (HTTP ${attachment.status}). Check your session, export permissions and selected resource.` }));
      file = attachment;
    }
    const download = yield* Effect.tryPromise({ try: signal => new Promise<Download>((resolve, reject) => {
      let triggerSettled = false;
      let responseSeen = request.method !== 'GET';
      let responseFailure: ReportError | undefined;
      const cleanup = () => { clearTimeout(timer); exportPage.off('download', onDownload); exportPage.off('response', onResponse); signal.removeEventListener('abort', cancel); };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const cancel = () => fail(new Error('Export cancelled'));
      const complete = () => {
        if (!triggerSettled) return;
        if (responseFailure) { fail(responseFailure); return; }
        if (state.download && responseSeen) { cleanup(); resolve(state.download); }
      };
      const onDownload = (download: Download) => { state.download = download; complete(); };
      const onResponse = (response: Response) => {
        let root = response.request();
        let previous = root.redirectedFrom();
        while (previous) { root = previous; previous = root.redirectedFrom(); }
        if (root.url() !== address.href || response.status() >= 300 && response.status() < 400) return;
        const contentType = response.headers()['content-type'] ?? '';
        if (response.status() < 200 || response.status() >= 300 || /text\/html|application\/(?:[^;]+\+)?json/i.test(contentType)) {
          responseFailure = new ReportError({ message: `Semrush did not return an export file (HTTP ${response.status()}). Check your session, export permissions and selected resource.` }); complete(); return;
        }
        responseSeen = true; complete();
      };
      const timer = setTimeout(() => fail(new Error('Export timed out')), 45000);
      state.cancel = cancel;
      signal.addEventListener('abort', cancel, { once: true });
      exportPage.on('download', onDownload);
      if (request.method === 'GET') exportPage.on('response', onResponse);
      if (request.method === 'GET') {
        // Native navigation settles before cleanup; the driver signals attachment navigation this way.
        exportPage.goto(file.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).then(response => {
          triggerSettled = true;
          responseFailure ??= new ReportError({ message: `Semrush did not return an export file (HTTP ${response?.status() ?? 'unknown'}). Check your session and export permissions.` });
          complete();
        }, error => {
          triggerSettled = true;
          if (error instanceof Error && error.message.includes('Download is starting')) complete();
          else fail(error);
        });
      } else {
        exportPage.evaluate(({ url, filename }) => {
          const link = document.createElement('a'); link.href = url; link.download = filename;
          document.body.appendChild(link); link.click(); link.remove();
        }, file).then(() => { triggerSettled = true; complete(); }, fail);
      }
    }), catch: error => error instanceof ReportError ? error : new ReportError({ message: 'Semrush did not produce an export download. Check your session and export permissions.' }) });

    const filename = download.suggestedFilename().replaceAll(auth.apiKey, '[redacted]');
    const mimeType = format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
    return yield* exports.create(filename, mimeType, destination => download.saveAs(destination));
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
  const report = Effect.fn('Semrush.report')(function* ({ name, definition, query }: ReportRequest) {
    const valid = yield* browserCall(() => page.evaluate(async () => {
      const response = await fetch('/home/', { method: 'HEAD', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      return response.ok && new URL(response.url).pathname === '/home/';
    }));
    if (!valid) return yield* Effect.fail(new SessionError({ message: 'Semrush session expired. Run semrush auth login or import a signed-in browser.' }));
    const family = definition.transport;
    const planned = ['project_web', 'audit_web', 'tracking_web', 'saved_web'].includes(family) ? webRequest(definition, query) : undefined;
    const params = planned ? {} : reportParameters(definition, query);
    let reportData: Schema.Json | undefined;
    if (planned) {
      // The web UI only allows adding a website to a project that has none.
      if (name === 'project_update' && query.domain !== undefined) {
        const current = yield* request('/apis/v4-raw/folders/api/v0/folders/folder', { folder_id: query.folder_id ?? null }, 'GET');
        if (!objectValue(current) || !objectValue(current.folder)) return yield* Effect.fail(new ReportError({ message: 'Project metadata unavailable. Inspect the project before adding a website.' }));
        if (Predicate.isString(current.folder.domain) && current.folder.domain.length > 0) return yield* Effect.fail(new ReportError({ message: 'This project already has a website. The Semrush web UI only allows adding a website when none is set.' }));
      }
      if (family === 'audit_web') yield* checkAuditSettings(name, query);
      const authParameter = family === 'audit_web' ? 'key' : 'auth_parameter' in definition ? definition.auth_parameter : '';
      const path = authParameter ? planned.path + '?' + new URLSearchParams({ [authParameter]: auth.apiKey }) : planned.path;
      if ('response_type' in definition && definition.response_type === 'download') {
        const artifact = yield* Effect.scoped(downloadExport({ ...planned, path }, query.format));
        yield* captureCookies(context, sessions.capture, browserOrigin);
        return { authenticated: true as const, report: name, data: null, artifact };
      }
      const responseType = 'response_type' in definition && definition.response_type === 'empty' ? 'empty' : 'json';
      const body = family === 'tracking_web' ? yield* trackingBody(definition, query, planned.body) : planned.body;
      reportData = yield* request(path, body, planned.method, {}, responseType);
    } else if (['keyword', 'domain', 'direct', 'magic', 'kwm', 'ksb'].includes(family)) {
      reportData = yield* rpc(definition.method, params, family, definition.web_report);
      if ('response_type' in definition && ['download_url', 'export_id'].includes(definition.response_type)) {
        const href = yield* nativeExportURL(definition.response_type, reportData, browserOrigin, auth);
        const artifact = yield* Effect.scoped(downloadExport({ method: 'GET', path: href, body: {} }, query.format));
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
    return { authenticated: true as const, report: name, data: redact(reportData ?? null, [auth.apiKey, spectrumToken, spectrumToken.replace(/^Bearer /, '')]) };
  });
  return Semrush.of({ report: request => semaphore.withPermits(1)(report(request)) });
}));

export const semrushLive = makeSemrushLayer(origin);

interface BootstrapAuth { readonly apiKey: string; readonly userId: string | number; }
export function readBootstrap(html: string): BootstrapAuth {
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
      if (objectValue(user) && Predicate.isString(user.api_key) && (Predicate.isString(user.id) || Predicate.isNumber(user.id))) return { apiKey: user.api_key, userId: user.id };
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
