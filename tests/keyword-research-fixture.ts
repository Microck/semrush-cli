import type { IncomingMessage, ServerResponse } from 'node:http';
import { Schema } from 'effect';
import { expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';

export const keywordDownloadPath = '/kwogw/v2/download-export';
export const keywordFixturePhrase = 'keyword research fixture';
const rpcSchema = Schema.Struct({ method: Schema.String, params: Schema.Record(Schema.String, Schema.Json) });
const refreshPhrase = Schema.Struct({ phrase: Schema.String, database: Schema.String, location: Schema.Int });
type RefreshPhrase = Schema.Schema.Type<typeof refreshPhrase>;
const jobId = 'private-keyword-export-token';
const exportFilenames = new Map([['keywords.Export', 'semrush-keyword-bulk'], ['serp.ExportURLs', 'semrush-keyword-serp'], ['serp.ExportDomains', 'semrush-keyword-serp-domains'], ['serp.ExportURLsLocal', 'semrush-keyword-local-serp']]);
const exports = new Set(exportFilenames.keys());
const methods = new Set(['keywords.GetBulk', 'pla.GetCopies', 'serp.GetURLsOrganicMetrics', 'serp.GetURLsBacklinksMetrics', 'export.Wait', 'locations.Get', 'keywords.GetLocalInfo', 'serp.GetURLsOrganicMetricsLocal', 'serp.GetDomainsOrganicMetrics', 'serp.GetDomainsBacklinksMetrics', 'updates.RequestUpdates', 'updates.GetKeywords', 'domains.GetSuggestions', 'domains.GetSiteRoot', 'domains.GetStatus', 'aiSeo.GetDatabases', 'aiSeo.GetTopicsSummary', 'aiSeo.GetTopics', ...exports]);
type Scenario = 'complete' | 'pending' | 'forever' | 'denied' | 'rate-limited' | 'missing-id' | 'lost-init' | 'slow-download' | 'empty' | 'read-failed' | 'countries-malformed' | 'lost-refresh' | 'missing-refresh-receipt' | 'domain-pending' | 'domain-lost-init' | 'domain-empty-root' | 'domain-missing-root' | 'domain-bad-root' | 'domain-missing-id' | 'domain-unknown-state' | 'domain-ready-absent-id' | 'domain-lost-status';
// A real, small XLSX workbook keeps binary/resource tests independent of an office suite.
const xlsx = Buffer.from(zipSync(Object.fromEntries(Object.entries({
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Keywords" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Keyword</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>café</t></is></c></row></sheetData></worksheet>',
}).map(([name, value]) => [name, strToU8(value)]))));

/** Real RPC and download boundaries, including an already-created job with a pending wait. */
export function makeKeywordResearchFixture() {
  let scenario: Scenario = 'complete'; let format = 1; let initializations = 0; let waits = 0; let downloads = 0;
  let waitStarted = () => {}; let downloadStarted = () => {}; let disconnected = () => {};
  let waiting = Promise.resolve(); let downloading = Promise.resolve(); let closed = Promise.resolve();
  let refreshes = 0, statusReads = 0; let refreshSelection: readonly RefreshPhrase[] = [];
  const serveRefresh = (method: string, params: Schema.JsonObject, response: ServerResponse, reply: (result: Schema.Json) => void): boolean => {
    if (method !== 'updates.RequestUpdates' && method !== 'updates.GetKeywords') return false;
    const phrases = Schema.decodeUnknownSync(Schema.Array(refreshPhrase))(params.phrases);
    if (method === 'updates.RequestUpdates') {
      expect(params).toEqual({ phrases }); refreshes++;
      if (scenario === 'denied' || scenario === 'rate-limited') { response.end(JSON.stringify({ error: { code: scenario === 'denied' ? -32002 : -32003, message: 'fixture-secret refresh is unavailable' } })); return true; }
      refreshSelection = phrases;
      if (scenario === 'lost-refresh') { response.socket?.destroy(); return true; }
      reply(scenario === 'missing-refresh-receipt' ? {} : { change: { before: 44, delta: phrases.length, limit: 1000 }, phrases: phrases.map(phrase => ({ ...phrase, update_status: 1 })), native_extra: false }); return true;
    }
    expect(params.include_updating).toBe(true); expect(params.currency).toBeTypeOf('string'); statusReads++;
    for (const phrase of Schema.decodeUnknownSync(Schema.Array(Schema.Record(Schema.String, Schema.Json)))(params.phrases)) expect(phrase.status_updated_at).toBeTypeOf('number');
    reply(refreshSelection.filter(selected => phrases.some(phrase => phrase.phrase === selected.phrase && phrase.database === selected.database && phrase.location === selected.location)).map(phrase => ({ ...phrase, update_status: statusReads > 1 ? 2 : 1, status_updated_at: 1792221173, results: null, serp_id: 's-d-99-1017-13394082193748469000' }))); return true;
  };
  let preparations = 0, domainStatusReads = 0; let activeDomain = false;
  const domainJob = 'native-domain-job-id';
  const servePersonal = (method: string, params: Schema.JsonObject, response: ServerResponse, reply: (result: Schema.Json) => void): boolean => {
    if (method.startsWith('domains.') || method.startsWith('aiSeo.')) response.setHeader('Set-Cookie', 'keyword_personal_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
    if (method === 'domains.GetSuggestions') { expect(params).toEqual({}); reply({ history: ['example.com'], projects: ['project.example'], competitors: ['competitor.example'] }); return true; }
    if (method === 'domains.GetSiteRoot') {
      expect(params).not.toHaveProperty('id');
      reply(scenario === 'domain-missing-root' ? {} : { site_root_domain: scenario === 'domain-empty-root' ? '' : scenario === 'domain-bad-root' ? 'https://example.com/' : 'example.com' }); return true;
    }
    if (method === 'domains.GetStatus') {
      const initializing = params.id === undefined;
      if (initializing) preparations++; else { domainStatusReads++; expect(params.id).not.toBe(''); }
      if (scenario === 'denied' || scenario === 'rate-limited') { response.end(JSON.stringify({ error: { code: scenario === 'denied' ? -32002 : -32003, message: 'fixture-secret domain access denied' } })); return true; }
      if (params.domain !== 'example.com' || !initializing && (params.id !== domainJob || !activeDomain)) { response.end(JSON.stringify({ error: { code: -10401, message: 'fixture-secret Domain fail' } })); return true; }
      if (initializing) {
        expect(params).toEqual({ domain: 'example.com' }); activeDomain = true;
        if (scenario === 'domain-lost-init') { response.socket?.destroy(); return true; }
        if (scenario === 'domain-missing-id') { reply({ id: '', status: 1 }); return true; }
        if (scenario === 'domain-unknown-state') { reply({ id: domainJob, status: 3 }); return true; }
        if (scenario === 'domain-ready-absent-id') { reply({ status: 2, native_extra: 0 }); return true; }
        reply(scenario === 'domain-pending' || scenario === 'domain-lost-status' ? { id: domainJob, status: 1, native_extra: false } : { id: '', status: 2, native_extra: false }); return true;
      }
      if (scenario === 'domain-lost-status') { response.socket?.destroy(); return true; }
      reply({ id: domainStatusReads > 1 ? '' : domainJob, status: domainStatusReads > 1 ? 2 : 1, native_extra: false }); return true;
    }
    if (method === 'serp.GetURLs' && params.domain) { reply(Array.from({ length: 106 }, (_, index) => ({ position: Math.min(index + 1, 100), domain: 'example.com', url: 'https://example.com/result/' + index, kind: index < 100 ? 0 : 4, features: [] }))); return true; }
    if (method === 'ideas.GetKeywordsSummary' && params.domain) { reply({ total: 30, total_volume: 0 }); return true; }
    if (method === 'clusters.Get') { reply([{ name: 'TypeScript libraries', intents: [0] }]); return true; }
    if (method === 'aiSeo.GetDatabases') { expect(params).toEqual({}); reply(['us', 'uk', 'es']); return true; }
    if (method === 'aiSeo.GetTopicsSummary' || method === 'aiSeo.GetTopics') {
      expect(params).toMatchObject({ device: 0, date: '', location: 0, currency: 'USD' });
      if (scenario === 'read-failed' || params.database === 'zz') { response.writeHead(403); response.end('{"error":"fixture-secret AI access denied"}'); return true; }
      reply(method === 'aiSeo.GetTopicsSummary' ? { volume_by_llm: [{ volume: 0, llm: 'aio' }, { volume: 1209244, llm: 'gpt' }], topics_count: 1000 } : [{ topic: 'Running Shoes and Reviews', volume: 0 }]); return true;
    }
    return false;
  };
  const observed: { method: string; params: Schema.JsonObject }[] = [];
  const bytes = (code: number) => code === 0 ? xlsx : Buffer.from(code === 2 ? 'Keyword;Volume\r\ncafé;33\r\n' : 'Keyword,Volume\r\ncafé,33\r\n');
  return {
    observed, bytes,
    get preparations() { return preparations; }, get domainStatusReads() { return domainStatusReads; },
    get refreshes() { return refreshes; }, get statusReads() { return statusReads; },
    get initializations() { return initializations; }, get waits() { return waits; }, get downloads() { return downloads; },
    waiting: () => waiting, downloading: () => downloading, disconnected: () => closed,
    use(value: Scenario = 'complete') {
      scenario = value; preparations = 0; domainStatusReads = 0; activeDomain = false; refreshes = 0; statusReads = 0; refreshSelection = []; format = 1; initializations = 0; waits = 0; downloads = 0; observed.length = 0;
      waiting = new Promise<void>(resolve => { waitStarted = resolve; });
      downloading = new Promise<void>(resolve => { downloadStarted = resolve; });
      closed = new Promise<void>(resolve => { disconnected = resolve; });
    },
    serveRPC(request: IncomingMessage, payload: Schema.Json, response: ServerResponse) {
      const { method, params } = Schema.decodeUnknownSync(rpcSchema)(payload);
      if (!methods.has(method) && params.phrase !== keywordFixturePhrase) return false;
      expect(request.headers.cookie).toContain('session=authorized'); expect(request.headers['content-type']).toBe('application/json');
      expect(params).not.toHaveProperty('confirm'); expect(params).not.toHaveProperty('dry_run'); expect(params).not.toHaveProperty('api_key');
      observed.push({ method, params });
      response.setHeader('Content-Type', 'application/json');
      const reply = (result: Schema.Json) => response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
      if (servePersonal(method, params, response, reply)) return true;
      if (serveRefresh(method, params, response, reply)) return true;
      if (exports.has(method)) {
        initializations++; expect(params.format).toBeTypeOf('number'); expect([0, 1, 2]).toContain(params.format);
        format = Number(params.format);
        expect(params.filename).toBe(exportFilenames.get(method));
        if (method === 'keywords.Export') { expect(params).not.toHaveProperty('date'); expect(params).not.toHaveProperty('device'); expect(Array.isArray(params.columns)).toBe(true); }
        else if (method === 'serp.ExportURLsLocal') { expect(params).toEqual({ phrase: keywordFixturePhrase, database: 'us', location: 21167, format, filename: 'semrush-keyword-local-serp' }); }
        else { expect(params).not.toHaveProperty('currency'); expect(params).not.toHaveProperty('location'); expect(params.device).toBe(1); expect(params.date).toBe('202609'); }
        if (scenario === 'lost-init') { response.socket?.destroy(); return true; }
        reply(scenario === 'missing-id' ? {} : { export_id: jobId }); return true;
      }
      if (method === 'export.Wait') {
        waits++; waitStarted(); expect(params).toEqual({ export_id: jobId });
        response.setHeader('Set-Cookie', 'keyword_wait_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
        const code = scenario === 'denied' ? -32002 : scenario === 'rate-limited' ? -32003 : 0;
        if (scenario === 'denied' || scenario === 'rate-limited' || scenario === 'forever' || scenario === 'pending' && waits === 1) response.end(JSON.stringify({ error: { code, message: `Export ${jobId} fixture-secret is unavailable` } }));
        else reply(null);
        return true;
      }
      if (scenario === 'read-failed') { response.writeHead(403); response.end('{"error":"fixture-secret denied"}'); return true; }
      response.setHeader('Set-Cookie', 'keyword_read_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      const row = { phrase: keywordFixturePhrase, database: String(params.database), volume: params.date ? 80 : params.device === 1 ? 50 : 100,
        cpc: params.currency === 'EUR' ? 3.6196808999999996 : 4.1, serp_id: 'b-g-9223372036854775807', intents: [0], trend: [1, 2] };
      if (params.domain) Object.assign(row, { domain_difficulty: 0, domain_traffic: 123 });
      if (method === 'locations.Get') { reply(scenario === 'empty' ? [] : { history: [{ name: 'California,United States', location: 21137, type: 20 }], results: [{ name: 'New York,United States', location: 21167, type: 20 }] }); return true; }
      if (method === 'keywords.GetLocalInfo') { reply({ global_metrics: [{ ...row, location: 0, results: null }], local_metrics: { ...row, location: params.location ?? 0, update_status: refreshSelection.length ? 2 : 0, results: null } }); return true; }
      if (method === 'serp.GetURLs' && params.location !== 0) { reply([{ position: 1, kind: 0, domain: 'example.com', url: 'https://example.com/', features: [] }, { position: 2, kind: 0, domain: 'example.org', url: 'https://example.org/', features: [6] }]); return true; }
      if (method === 'serp.GetDomainsOrganicMetrics' || method === 'serp.GetDomainsBacklinksMetrics') { const domains = Schema.decodeUnknownSync(Schema.Array(Schema.String))(params.domains); reply(domains.map((domain): Schema.JsonObject => method === 'serp.GetDomainsOrganicMetrics' ? { domain, traffic: 0 } : { domain, authority_score: 58, backlinks_count: 2336444 })); return true; }
      if (method === 'keywords.GetBulk') {
        expect(params.date).toBe(''); expect(params).not.toHaveProperty('device');
        const phrases = Schema.decodeUnknownSync(Schema.Array(Schema.String))(params.phrases);
        reply(scenario === 'empty' ? [] : phrases.map(phrase => ({ ...row, phrase }))); return true;
      }
      if (method === 'keywords.GetInfo') { reply({ keywords: scenario === 'countries-malformed' ? null : scenario === 'empty' ? [] : [row, { ...row, database: 'uk', volume: 20 }] }); return true; }
      if (method === 'serp.GetURLsOrganicMetrics' || method === 'serp.GetURLsBacklinksMetrics' || method === 'serp.GetURLsOrganicMetricsLocal') {
        const urls = Schema.decodeUnknownSync(Schema.Array(Schema.String))(params.urls);
        reply(scenario === 'empty' ? [] : [...urls].reverse().map((url): Schema.JsonObject => method !== 'serp.GetURLsBacklinksMetrics' ? { url, keywords_count: 12, traffic: 34 } : { url, authority_score: 80, backlinks_count: 456, domains_count: 78 })); return true;
      }
      if (method === 'pla.GetCopies') { reply(scenario === 'empty' ? [] : [{ title: 'café shoes', url: 'https://example.com/product', price: 42 }, { title: 'second product', url: 'https://example.com/two', price: 50 }]); return true; }
      reply([row]); return true;
    },
    async serveDownload(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(url.pathname).toBe(keywordDownloadPath); expect(request.method).toBe('GET');
      expect(Object.fromEntries(url.searchParams)).toEqual({ export_id: jobId });
      expect(request.headers.cookie).toContain('session=authorized'); expect(request.headers.cookie).toContain('keyword_wait_rotation=retained'); downloads++;
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', 'attachment; filename="keyword native.' + (format === 0 ? 'xlsx' : 'csv') + '"');
      response.setHeader('Set-Cookie', 'keyword_download_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      if (scenario === 'slow-download') { response.once('close', () => disconnected()); response.setHeader('Content-Length', 1048576); response.write(bytes(format).subarray(0, 12)); downloadStarted(); return; }
      response.end(bytes(format));
    },
  };
}
