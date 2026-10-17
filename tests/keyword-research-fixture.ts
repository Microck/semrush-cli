import type { IncomingMessage, ServerResponse } from 'node:http';
import { Schema } from 'effect';
import { expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';

export const keywordDownloadPath = '/kwogw/v2/download-export';
export const keywordFixturePhrase = 'keyword research fixture';
const rpcSchema = Schema.Struct({ method: Schema.String, params: Schema.Record(Schema.String, Schema.Json) });
const jobId = 'private-keyword-export-token';
const exports = new Set(['keywords.Export', 'serp.ExportURLs', 'serp.ExportDomains']);
const methods = new Set(['keywords.GetBulk', 'pla.GetCopies', 'serp.GetURLsOrganicMetrics', 'serp.GetURLsBacklinksMetrics', 'export.Wait', ...exports]);
type Scenario = 'complete' | 'pending' | 'forever' | 'denied' | 'rate-limited' | 'missing-id' | 'lost-init' | 'slow-download' | 'empty' | 'read-failed' | 'countries-malformed';
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
  const observed: { method: string; params: Schema.JsonObject }[] = [];
  const bytes = (code: number) => code === 0 ? xlsx : Buffer.from(code === 2 ? 'Keyword;Volume\r\ncafé;33\r\n' : 'Keyword,Volume\r\ncafé,33\r\n');
  return {
    observed, bytes,
    get initializations() { return initializations; }, get waits() { return waits; }, get downloads() { return downloads; },
    waiting: () => waiting, downloading: () => downloading, disconnected: () => closed,
    use(value: Scenario = 'complete') {
      scenario = value; format = 1; initializations = 0; waits = 0; downloads = 0; observed.length = 0;
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
      if (exports.has(method)) {
        initializations++; expect(params.format).toBeTypeOf('number'); expect([0, 1, 2]).toContain(params.format);
        format = Number(params.format);
        expect(params.filename).toBe(method === 'keywords.Export' ? 'semrush-keyword-bulk' : method === 'serp.ExportDomains' ? 'semrush-keyword-serp-domains' : 'semrush-keyword-serp');
        if (method === 'keywords.Export') { expect(params).not.toHaveProperty('date'); expect(params).not.toHaveProperty('device'); expect(Array.isArray(params.columns)).toBe(true); }
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
      if (method === 'keywords.GetBulk') {
        expect(params.date).toBe(''); expect(params).not.toHaveProperty('device');
        const phrases = Schema.decodeUnknownSync(Schema.Array(Schema.String))(params.phrases);
        reply(scenario === 'empty' ? [] : phrases.map(phrase => ({ ...row, phrase }))); return true;
      }
      if (method === 'keywords.GetInfo') { reply({ keywords: scenario === 'countries-malformed' ? null : scenario === 'empty' ? [] : [row, { ...row, database: 'uk', volume: 20 }] }); return true; }
      if (method === 'serp.GetURLsOrganicMetrics' || method === 'serp.GetURLsBacklinksMetrics') {
        const urls = Schema.decodeUnknownSync(Schema.Array(Schema.String))(params.urls);
        reply(scenario === 'empty' ? [] : [...urls].reverse().map((url): Schema.JsonObject => method === 'serp.GetURLsOrganicMetrics' ? { url, keywords_count: 12, traffic: 34 } : { url, authority_score: 80, backlinks_count: 456, domains_count: 78 })); return true;
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
