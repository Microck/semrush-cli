import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';

export const webVitalsPath = '/siteaudit/api/campaigns/793/page-speed-metrics/';
export const negativeURLId = '-9223372036854775808';
export const positiveURLId = '9223372036854775807';
type Scenario = 'complete' | 'empty' | 'denied' | 'business-error' | 'uninitialized' | 'partial' | 'malformed' | 'dropped';
const replacement = Schema.Struct({ urls: Schema.Array(Schema.String) });

/** Stateful native HTTP boundary; failed receipts may follow an already committed replacement. */
export function makeWebVitalsFixture() {
  let scenario: Scenario = 'complete'; let urls: ReadonlyArray<string> = ['https://example.com/']; let writes = 0;
  const page = { url: 'https://example.com/', urlId: negativeURLId, pageId: 'opaque-page', score: 'good', previousScore: 'improve',
    lcp: { value: 1800, difference: -400 }, tbt: { value: 40, difference: -10 }, cls: { value: 0.01, difference: -0.02 } };
  const responses = new Map<string, Schema.Json>([
    ['status', { campaignId: 793, status: 'exists', score: 100, scoreDelta: 5 }],
    ['web-vitals/main-statistics', { campaignId: 793, score: 100, scoreDelta: 5, pageStatistics: [{ date: 2000, good: 1 }, { date: 1000, good: 0 }] }],
    ['web-vitals/snapshot-metrics', { campaignId: 793, snapshotId: 'opaque-snapshot', scales: { lcp: [2500, 4000], tbt: [300, 600], cls: [0.1, 0.25] }, pageMetricsValues: [page] }],
    ['lighthouse-audits/recommendations/top-improvements', { campaignId: 793, snapshotId: 'opaque-snapshot', lcpData: { pageStatistics: { good: 1 }, improvements: [{ auditId: 'render-blocking-resources', affectedPages: [negativeURLId] }] } }],
  ]);
  return {
    use(value: Scenario) { scenario = value; },
    reset() { scenario = 'complete'; urls = ['https://example.com/']; writes = 0; },
    get writes() { return writes; },
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(request.headers.cookie).toContain('session=authorized');
      expect(url.searchParams.get('key')).toBe('fixture-secret');
      expect([...url.searchParams.keys()]).toEqual(['key']);
      const path = url.pathname.slice(webVitalsPath.length);
      response.setHeader('Content-Type', 'application/json');
      if (scenario === 'denied') { response.writeHead(403); response.end('{"error":"denied fixture-secret"}'); return; }
      if (scenario === 'business-error') { response.end('{"error":"native failure fixture-secret"}'); return; }
      if (scenario === 'uninitialized') { response.writeHead(404); response.end('{"status":404,"message":"no previously saved page speed properties"}'); return; }
      if (path === 'settings' && request.method === 'POST') {
        expect(request.headers['content-type']).toBe('application/json');
        const body = JSON.parse(await readText(request)); expect(Object.keys(body)).toEqual(['urls']);
        const incoming = Schema.decodeUnknownSync(replacement)(body).urls;
        writes++; urls = scenario === 'partial' ? incoming.slice(0, 1) : incoming;
        if (scenario === 'dropped') { response.socket?.destroy(); return; }
        response.setHeader('Set-Cookie', 'web_vitals_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
        response.end(JSON.stringify(scenario === 'malformed' ? { changed: true } : { urls, changed: true })); return;
      }
      expect(request.method).toBe('GET');
      expect(await readText(request)).toBe('');
      response.setHeader('Set-Cookie', 'web_vitals_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      if (path === 'settings') { response.end(JSON.stringify({ urls, changed: writes > 0 })); return; }
      for (const id of [negativeURLId, positiveURLId]) {
        if (path === 'web-vitals/history/' + id) { response.end(JSON.stringify({ score: 'good', auditUrl: page.url, lcpData: { values: [{ date: 2000, value: 1800 }, { date: 1000, value: 2200 }] }, tbtData: {}, clsData: {} })); return; }
        if (path === 'lighthouse-audits/recommendations/' + id) { response.end(JSON.stringify({ campaignId: 793, auditUrl: page.url, recommendations: scenario === 'empty' ? [] : [{ id: 'render-blocking-resources', type: 'warning', title: 'Eliminate render-blocking resources' }] })); return; }
      }
      const data = responses.get(path);
      expect(data, 'Unexpected Core Web Vitals fixture path ' + path).toBeDefined();
      response.end(JSON.stringify(scenario === 'empty' && path === 'web-vitals/snapshot-metrics' ? { campaignId: 793, snapshotId: null, scales: {}, pageMetricsValues: [] } : data));
    },
  };
}
