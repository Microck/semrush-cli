import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';

export const onpagePath = '/on-page-seo-checker/api/';
export const onpagePageId = '111111111111111111111111';
export const onpageSnapshotId = '222222222222222222222222';
const orphanId = '000000000000000000000000';
const landingSchema = Schema.Struct({ url: Schema.String, keywords: Schema.Array(Schema.String) });
const settingsFields = { notify: Schema.Boolean, default_agent: Schema.Boolean, schedule: Schema.Int, location: Schema.NullOr(Schema.Record(Schema.String, Schema.Json)) };
const settingsSchema = Schema.Struct({ ...settingsFields, timezone: Schema.Int });
type Settings = Schema.Schema.Type<typeof settingsSchema>;
type Page = { id: string; url: string; keywords: string[]; need_re_run: boolean; status: string; snapshot?: Schema.Json; };
type Scenario = 'configured' | 'unconfigured' | 'missing-campaigns' | 'busy' | 'missing-settings' | 'denied' | 'business-error' | 'stale' | 'lost-create' | 'lost-settings' | 'lost-page' | 'unexpected-create' | 'envelope-failure' | 'analysis-error';

/** Stateful native HTTP boundaries. Status on a page is data, not an RPC envelope. */
export function makeOnpageFixture() {
  let scenario: Scenario = 'configured', configured = true, productAccess: boolean | null = true;
  let sequence = 16, runs = 0, writes = 0, collected = true;
  let settings: Settings = {
    notify: false, default_agent: true, timezone: 0, schedule: 0, location: { location: 'United States', country: 'us', language: 'en', device: 'desktop' } };
  let pages: Page[] = [];
  const observed: { method: string; path: string; body: Schema.Json }[] = [];
  const snapshot = () => ({ id: onpageSnapshotId, status_code: 200, total_volume: 0, summary: [], last_update: '2026-10-17T00:00:00Z' });
  const reset = (value: Scenario) => {
    scenario = value; configured = !['unconfigured', 'lost-create', 'unexpected-create', 'missing-campaigns', 'busy'].includes(value);
    productAccess = true; sequence = 16; runs = 0; writes = 0; collected = configured; observed.length = 0;
    settings = { notify: false, default_agent: true, timezone: 0, schedule: 0,
      location: configured ? { location: 'United States', country: 'us', language: 'en', device: 'desktop' } : null };
    pages = configured ? [{ id: onpagePageId, url: 'https://example.com/', keywords: ['café'], need_re_run: false, status: value === 'analysis-error' ? 'ERROR' : 'COMPLETED', snapshot: snapshot() }] : [];
  };
  reset('configured');
  const add = (url: string, keywords: readonly string[]) => {
    // The native add endpoint moves these assignments away from other landing pages.
    for (const page of pages) page.keywords = page.keywords.filter(keyword => !keywords.includes(keyword));
    pages = pages.filter(page => page.keywords.length > 0);
    const page: Page = { id: (++sequence).toString(16).padStart(24, '0'), url, keywords: [...keywords], need_re_run: true, status: 'COMPLETED' };
    pages.push(page); return page;
  };
  const reply = (response: ServerResponse, payload: Schema.Json) => response.end(JSON.stringify(payload));
  const serveSnapshot = (route: string, response: ServerResponse) => {
    if (scenario === 'stale') { response.writeHead(409); reply(response, { reason: 'fixture-secret stale snapshot', new_snapshot_id: '333333333333333333333333' }); return; }
    const segments = route.split('/'); expect(segments.slice(1, 5)).toEqual(['landings', onpagePageId, 'snapshots', onpageSnapshotId]);
    const detail = segments[5], keyword = segments[6] ? decodeURIComponent(segments[6]) : '';
    if (keyword) { reply(response, detail === 'serp' ? { urls: ['https://example.com/'] } : detail === 'length' ? { url: 'https://example.com/', keyword, expanded_lengths: [] } : { keyword, expanded_videos: [] }); return; }
    switch (detail) {
      case 'keywords': reply(response, [{ phrase: 'café', volume: 0 }]); return;
      case 'ideas': reply(response, { language: 'english', is_supported_language: true, ideas: { content: [], strategy: [] } }); return;
      case 'density': reply(response, { url: 'https://example.com/', density_summaries: [], tfidf_summaries: [], word_density_summaries: [], last_collect_date: '2026-10-17' }); return;
      case 'related': reply(response, { related_words: [{ word: 'native', weight: 0 }] }); return;
      case 'backlinks': response.end('[{"domain":"example.org","backlinks_count":9223372036854775807}]'); return;
      case 'length': reply(response, { url: 'https://example.com/', length_summaries: [] }); return;
      case 'video': reply(response, [{ keyword: 'café', has_video: false }]); return;
      case 'readability': reply(response, [{ keyword: 'café', readability_score: 0 }]); return;
      default: response.writeHead(404); reply(response, { reason: 'Unknown fixture report' });
    }
  };
  const servePageWrites = (route: string, request: IncomingMessage, response: ServerResponse, body: Schema.Json): boolean => {
    if (route === '/landings/' && request.method === 'DELETE') {
      expect(request.headers['content-type']).toBe('application/json');
      const selection = Schema.decodeUnknownSync(Schema.Struct({ ids: Schema.Array(Schema.String) }))(body); pages = pages.filter(page => !selection.ids.includes(page.id)); writes++; response.end(); return true;
    }
    if (route === '/landings/' && request.method === 'POST') {
      const input = Schema.decodeUnknownSync(landingSchema)(body); const page = add(input.url, input.keywords); writes++;
      if (scenario === 'lost-page') response.socket?.destroy(); else reply(response, page); return true;
    }
    if (route === '/landings/create/') {
      expect(request.method).toBe('POST'); const selections = Schema.decodeUnknownSync(Schema.Array(landingSchema))(body);
      for (const landing of selections) add(landing.url, landing.keywords); writes++; response.end(); return true;
    }
    const selectedId = route.split('/')[2]; const page = pages.find(page => page.id === selectedId);
    if (request.method === 'PUT' && route === '/landings/' + selectedId + '/') {
      const input = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String, url: Schema.String, keywords: Schema.Array(Schema.String), is_switch_scheme: Schema.Boolean }))(body);
      expect(input.id).toBe(selectedId); if (!page) throw Error('Unknown fixture page'); Object.assign(page, { url: input.url, keywords: [...input.keywords], need_re_run: true }); writes++; reply(response, page); return true;
    }
    if (route === '/landings/' + selectedId + '/snapshots/' && request.method === 'POST') {
      expect(body).toBeNull(); if (!page) throw Error('Unknown fixture page'); page.snapshot = snapshot(); page.need_re_run = false; runs++; writes++; collected = true; response.end(); return true;
    }

    return false;
  };
  return {
    observed, use: reset,
    get runs() { return runs; }, get writes() { return writes; }, get pages() { return pages; }, get settings() { return settings; },
    product(value: boolean | null) { productAccess = value; },
    bootstrap: () => productAccess === null ? '' : ';window.sm2.billingInfo=' + JSON.stringify({ has_product: productAccess, is_paid: !productAccess, product_group: 'App Center access' }),
    envelopeFailure(response: ServerResponse) {
      if (scenario !== 'envelope-failure') return false;
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ status: 'FAILED', error_message: 'fixture-secret rejected', data: null })); return true;
    },
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(request.headers.cookie).toContain('session=authorized'); expect(url.searchParams.get('key')).toBe('fixture-secret');
      if (request.method === 'DELETE') expect(url.searchParams.has('ids')).toBe(false);
      const encoded = await readText(request); const body = encoded ? Schema.decodeUnknownSync(Schema.Json)(JSON.parse(encoded)) : null;
      if (body && !Array.isArray(body)) { expect(body).not.toHaveProperty('confirm'); expect(body).not.toHaveProperty('dry_run'); expect(body).not.toHaveProperty('paid'); }
      observed.push({ method: request.method ?? '', path: url.pathname, body });
      response.setHeader('Content-Type', 'application/json'); response.setHeader('Set-Cookie', 'onpage_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      if (scenario === 'denied') { response.writeHead(403); reply(response, { error: 'fixture-secret access denied' }); return; }
      if (scenario === 'business-error') { reply(response, { error: 'fixture-secret provider failure' }); return; }
      if (url.pathname === onpagePath + 'campaigns/') {
        reply(response, scenario === 'missing-campaigns' ? [] : [{ id: 793, operational: configured, landings_count: pages.length, last_collect_date: collected ? 1792195200 : 0, running_landings_count: scenario === 'busy' ? 1 : 0 }]); return;
      }
      if (url.pathname === onpagePath + 'create') {
        expect(request.method).toBe('POST'); writes++;
        const input = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.Int, landings: Schema.Array(landingSchema), timezone: Schema.Int, settings: Schema.Struct(settingsFields) }))(body);
        expect(input.id).toBe(793); expect(configured).toBe(false); configured = true; collected = false; settings = { ...input.settings, timezone: input.timezone };
        if (settings.location?.country === 'United States') settings = { ...settings, location: { ...settings.location, country: 'us' } };
        for (const landing of input.landings) add(landing.url, landing.keywords);
        if (scenario === 'lost-create') response.socket?.destroy();
        else if (scenario === 'unexpected-create') reply(response, { accepted: 'partial' });
        else response.end();
        return;
      }
      const route = url.pathname.replace(onpagePath + 'campaigns/793', '');
      if (route === '/limits') { reply(response, { used: runs, max: 800 }); return; }
      if (route === '/settings/') {
        if (request.method === 'GET') { reply(response, scenario === 'missing-settings' ? { schedule: 0 } : settings); return; }
        expect(request.method).toBe('PUT'); settings = Schema.decodeUnknownSync(settingsSchema)(body); writes++;
        if (scenario === 'lost-settings') response.socket?.destroy(); else reply(response, settings); return;
      }
      if (!configured) { response.writeHead(400); reply(response, { reason: 'Campaign is not configured' }); return; }
      if (route === '') { reply(response, { id: 793, operational: true, running_landings_count: 0, landings_count: pages.length, last_collect_date: collected ? 1792195200 : 0 }); return; }
      if (route === '/overview/') { reply(response, { ideas: { content: 1 }, pages: pages.map(page => ({ id: page.id, url: page.url })), volume: 0, optimized: false, crawl_accessible: true }); return; }
      if (route === '/progress/') { reply(response, { ideas: [{ category: 'content', done: false, count: 1 }], optimized: false, trend: [{ date: '2026-10-17', traffic: 0, keywords: 1 }] }); return; }
      if (route === '/serps/') { reply(response, [{ keyword: 'café', status: 200 }, { keyword: 'unavailable', status: 204 }]); return; }
      if (route.startsWith('/serps/')) { reply(response, { landing: pages[0]?.url ?? '', summary: { keyword: decodeURIComponent(route.slice(7, -1)), volume: 0 }, serp: [] }); return; }
      if (route === '/location/') {
        expect(request.method).toBe('PUT'); const location = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(body);
        expect(location).not.toHaveProperty('country_code'); settings = { ...settings, location }; writes++; reply(response, location); return;
      }
      if (route === '/landings/launch') {
        expect(request.method).toBe('POST'); expect(body).toBeNull(); expect(url.searchParams.get('paid')).toBe(String(productAccess));
        runs++; writes++; collected = true; for (const page of pages) { page.need_re_run = false; page.snapshot = snapshot(); } response.end(); return;
      }
      if (route === '/landings/' && request.method === 'GET') { reply(response, [...pages, { id: orphanId, url: 'ORPHANS', keywords: [], need_re_run: false, status: 'COMPLETED', snapshot: null }]); return; }
      if (request.method !== 'GET' && servePageWrites(route, request, response, body)) return;
      serveSnapshot(route, response);
    },
  };
}
