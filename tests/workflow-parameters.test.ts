import reportingNative from './fixtures/reporting-document.json' with { type: 'json' };
import { Effect, Schema } from 'effect';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { parseReport } from '../src/validation.js';
import type { Query } from '../src/report-parameters.js';
import { webRequest, previewMutation, reportParameters } from '../src/report-parameters.js';

// Request contracts from the current Site Audit components and Position Tracking wizard.
// See docs/contract.md; the live probe uses the same bounded public-domain fixture.
const reportingRead = { ...reportingNative.read, content: Schema.decodeUnknownSync(Schema.Array(Schema.JsonObject))(reportingNative.read.content) };

const preview = async (name: string, input: Query) => {
  const parsed = await Effect.runPromise(parseReport(name, input));
  return webRequest(parsed.definition, parsed.query);
};


const keywordParameters = async (name: string, input: Query) => {
  const parsed = await Effect.runPromise(parseReport(name, input));
  return reportParameters(parsed.definition, parsed.query);
};

test('organic comparison ranges and selectors use the current native request context', async () => {
  const daily = { domain: 'example.com', date_range: { start_date: '20261015', end_date: '20261016' }, change_types: ['new', 'improved'], positions_type: 'serp' };
  expect(await keywordParameters('domain_position_changes', daily)).toMatchObject({ database: 'us', dateType: 'daily', dateRange: { startDate: '20261015', endDate: '20261016' }, positionsType: 'serpFeatures', changesTypes: ['new', 'improved'] });
  expect(await keywordParameters('domain_position_changes', { domain: 'example.com', date_type: 'monthly', date_range: { start_date: '202608', end_date: '202609' } })).toMatchObject({ dateType: 'monthly', dateRange: { startDate: '20260815', endDate: '20260915' }, positionsType: 'all', changesTypes: null });
  expect(await keywordParameters('domain_position_changes', { domain: 'example.com' })).toMatchObject({ dateRange: null, changesTypes: null });
  expect(await keywordParameters('domain_keywords', { domain: 'example.com', database: 'mobile-us', positions_type: 'organic' })).toMatchObject({ database: 'mobile-us', positionsType: 'organic' });
});

test('organic presets and trends accept only their native report context', async () => {
  expect(await keywordParameters('domain_position_changes_presets', { domain: 'example.com', search_type: 'subdomain' })).toEqual({ searchItem: 'example.com', searchType: 'subdomain', database: 'us', dateType: 'daily', dateRange: null });
  for (const name of ['domain_position_changes_daily_trend', 'domain_position_changes_monthly_trend']) expect(await keywordParameters(name, { domain: 'example.com', database: 'mobile-us', search_type: 'subfolder' })).toEqual({ searchItem: 'example.com', searchType: 'subfolder', database: 'mobile-us' });
});

test('organic comparison boundaries reject invalid dates, mixed precisions and conflicting selectors', async () => {
  const invalid: Query[] = [
    { date_range: { start_date: '20260230', end_date: '20260301' } },
    { date_range: { start_date: '20261017', end_date: '20261016' } },
    { date_range: { start_date: '202610', end_date: '20261016' } },
    { date_range: { start_date: '20261015\n', end_date: '20261016' } },
    { date_range: { start_date: '20261015', end_date: '20261016', method: 'export.Get' } },
    { date_type: 'monthly', date_range: { start_date: '202613', end_date: '202614' } },
    { date_type: 'monthly', date_range: { start_date: '20260815', end_date: '20260915' } },
    { date_range: { start_date: '20261015' } },
  ];
  for (const name of ['domain_position_changes', 'domain_position_changes_presets']) for (const query of invalid) await expect(keywordParameters(name, { domain: 'example.com', ...query })).rejects.toThrow();
  await expect(keywordParameters('domain_position_changes', { domain: 'example.com', date: 1792108800, date_range: { start_date: '20261015', end_date: '20261016' } })).rejects.toThrow('snapshot date or a comparison date_range');
  expect(await keywordParameters('domain_position_changes', { domain: 'example.com', date_range: { start_date: '20240229', end_date: '20240301' } })).toMatchObject({ dateRange: { startDate: '20240229', endDate: '20240301' } });
});

test('organic report selections reject unsupported or ignored controls before authentication', async () => {
  const invalidSelections: Query[] = [{ positions_type: 'serpFeatures' }, { positions_type: 'unknown' }, { database: 'mobile-us\n' }, { search_type: 'domain\r' }, { sort_field: 'traffic\n' }];
  for (const name of ['domain_keywords', 'domain_position_changes']) {
    for (const query of invalidSelections) await expect(keywordParameters(name, { domain: 'example.com', ...query })).rejects.toThrow();
  }
  for (const change_types of [['new', 'new'], ['rising']]) await expect(keywordParameters('domain_position_changes', { domain: 'example.com', change_types })).rejects.toThrow();
  const ignoredControls: Query[] = [{ positions_type: 'organic' }, { change_types: ['new'] }, { filters: {} }, { page: 2 }, { currency: 'EUR' }, { method: 'export.Get' }];
  for (const name of ['domain_position_changes_presets', 'domain_position_changes_daily_trend', 'domain_position_changes_monthly_trend']) {
    for (const query of ignoredControls) await expect(keywordParameters(name, { domain: 'example.com', ...query })).rejects.toThrow();
  }
  for (const name of ['domain_position_changes_daily_trend', 'domain_position_changes_monthly_trend']) await expect(keywordParameters(name, { domain: 'example.com', date_type: 'monthly' })).rejects.toThrow();
});

test('Keyword Magic discovery and personalized selections retain native request contexts', async () => {
  expect(await keywordParameters('keyword_magic_access', {})).toEqual({});
  for (const name of ['keyword_magic', 'keyword_magic_summary', 'keyword_magic_groups', 'keyword_magic_groups_summary', 'keyword_magic_topic_suggestions']) {
    const params = await keywordParameters(name, { keyword: 'typescript', domain: 'github.com', groups: ['typescript programming'] });
    expect(params).toMatchObject({ phrase: 'typescript', database: 'us', currency: 'USD', mode: 4, domain: 'github.com', groups: ['typescript programming'], topics_enabled: true, groups_order: { direction: 1, field: 'relevance' } });
    expect(await keywordParameters(name, { keyword: 'typescript' })).toMatchObject({ groups: [] });
    expect(await keywordParameters(name, { keyword: 'typescript' })).not.toHaveProperty('domain');
  }
  expect(await keywordParameters('keyword_magic_groups_summary', { keyword: 'typescript' })).not.toHaveProperty('groups_page');
});

test('Keyword Magic word grouping sends native count or volume order and omits the topic flag', async () => {
  for (const name of ['keyword_magic', 'keyword_magic_summary', 'keyword_magic_groups', 'keyword_magic_groups_summary']) {
    const defaults = await keywordParameters(name, { keyword: 'typescript', group_by: 'words' });
    expect(defaults.order).toEqual({ direction: 1, field: 'volume' });
    expect(defaults.groups_order).toEqual({ direction: 1, field: 'count' }); expect(defaults).not.toHaveProperty('topics_enabled');
    const selected = await keywordParameters(name, { keyword: 'typescript', group_by: 'words', groups_sort_field: 'volume', groups_descending: false });
    expect(selected.groups_order).toEqual({ direction: 0, field: 'volume' }); expect(selected).not.toHaveProperty('topics_enabled');
  }
});

test('Keyword Magic rejects ignored topic sort controls and malformed personalization before authentication', async () => {
  const ignoredControls: Query[] = [{ groups_sort_field: 'count' }, { groups_descending: true }, { group_by: 'topics', groups_sort_field: 'volume' }, { group_by: 'words', groups_sort_field: 'name' }, { group_by: 'unknown' }];
  const unsupported: Query[] = [{ device: 'mobile' }, { date: '202609' }, { confirm: true }, { method: 'domains.GetStatus' }, { database: 'us\n' }, { database: 'us\r' }, { currency: 'USD\n' }, { currency: 'USD\r' }, { sort_field: 'volume\n' }, { sort_field: 'volume\r' }];
  for (const name of ['keyword_magic', 'keyword_magic_summary', 'keyword_magic_groups', 'keyword_magic_groups_summary']) {
    for (const query of ignoredControls) await expect(keywordParameters(name, { keyword: 'typescript', ...query })).rejects.toThrow();
  }
  for (const name of ['keyword_magic', 'keyword_magic_summary', 'keyword_magic_groups', 'keyword_magic_groups_summary', 'keyword_magic_topic_suggestions']) {
    for (const domain of ['', 'https://example.com/', 'example.com/path', 'example.com\n']) await expect(keywordParameters(name, { keyword: 'typescript', domain })).rejects.toThrow();
    for (const input of unsupported) await expect(keywordParameters(name, { keyword: 'typescript', ...input })).rejects.toThrow();
  }
  await expect(keywordParameters('keyword_magic_topic_suggestions', { keyword: 'typescript', group_by: 'words' })).rejects.toThrow();
  await expect(keywordParameters('keyword_magic_access', { keyword: 'typescript' })).rejects.toThrow();
});

test('domain discovery, preparation and status use distinct native request shapes and offline previews', async () => {
  expect(await keywordParameters('keyword_domain_suggestions', {})).toEqual({});
  expect(await keywordParameters('keyword_domain_root', { domain: 'www.example.com' })).toEqual({ domain: 'www.example.com' });
  expect(await keywordParameters('keyword_domain_prepare', { domain: 'www.example.com', confirm: true })).toEqual({ domain: 'www.example.com' });
  expect(await keywordParameters('keyword_domain_status', { domain: 'example.com', job_id: 'native-domain-job-id' })).toEqual({ domain: 'example.com', id: 'native-domain-job-id' });
  const parsed = await Effect.runPromise(parseReport('keyword_domain_prepare', { domain: 'www.example.com', dry_run: true }));
  expect(previewMutation(parsed.name, parsed.definition, parsed.query)).toEqual({ dry_run: true, report: 'keyword_domain_prepare', request: { method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'domains.GetStatus', params: { domain: 'www.example.com' } } } });
});

test('prepared domain reads retain current mobile support, omit absent domains and reject historical personalization', async () => {
  for (const name of ['keyword_overview', 'keyword_countries', 'keyword_ideas', 'keyword_ideas_summary', 'keyword_serp', 'keyword_clusters']) {
    const current = { keyword: 'typescript', domain: 'github.com' };
    expect(await keywordParameters(name, current)).toMatchObject({ phrase: 'typescript', domain: 'github.com', device: 0, date: '', location: 0 });
    expect(await keywordParameters(name, { keyword: 'typescript' })).not.toHaveProperty('domain');
    await expect(keywordParameters(name, { ...current, date: '202609' })).rejects.toThrow();
    if (name !== 'keyword_clusters') expect(await keywordParameters(name, { ...current, device: 'mobile' })).toMatchObject({ device: 1, domain: 'github.com', date: '' });
  }
  expect(await keywordParameters('keyword_serp', { keyword: 'typescript', limit: 1000 })).not.toHaveProperty('limit');
  await expect(keywordParameters('keyword_serp', { keyword: 'typescript', limit: 1001 })).rejects.toThrow();
});

test('Keyword Overview AI reads retain the native current national serializer and an explicit database', async () => {
  expect(await keywordParameters('keyword_ai_databases', {})).toEqual({});
  for (const name of ['keyword_ai_summary', 'keyword_ai_topics']) {
    expect(await keywordParameters(name, { keyword: 'running shoes', database: 'uk' })).toEqual({ phrase: 'running shoes', database: 'uk', device: 0, date: '', location: 0, currency: 'USD' });
    expect(await keywordParameters(name, { keyword: 'running shoes', domain: 'example.com' })).toMatchObject({ domain: 'example.com', database: 'us' });
  }
});

test('domain and AI boundaries reject empty job IDs, ambiguous hosts and unconfirmed initialization before authentication', async () => {
  await expect(keywordParameters('keyword_domain_prepare', { domain: 'example.com' })).rejects.toThrow('changes your Semrush account');
  for (const job_id of ['', ' ', 'native-id\n', '\u0000', 'x'.repeat(513)]) await expect(keywordParameters('keyword_domain_status', { domain: 'example.com', job_id })).rejects.toThrow();
  await expect(keywordParameters('keyword_domain_status', { domain: 'example.com' })).rejects.toThrow();
  for (const domain of ['', 'https://example.com/', 'example.com/path', 'example.com\n', 'example.com:443']) {
    await expect(keywordParameters('keyword_domain_root', { domain })).rejects.toThrow();
    await expect(keywordParameters('keyword_domain_prepare', { domain, dry_run: true })).rejects.toThrow();
    await expect(keywordParameters('keyword_ai_summary', { domain, keyword: 'typescript' })).rejects.toThrow();
  }
  for (const name of ['keyword_ai_summary', 'keyword_ai_topics']) {
    const unsupported: Query[] = [{ device: 'mobile' }, { date: '202609' }, { location_id: 21167 }, { database: 'us\n' }, { api_key: 'injected' }];
    for (const query of unsupported) await expect(keywordParameters(name, { keyword: 'running shoes', ...query })).rejects.toThrow();
  }
  await expect(keywordParameters('keyword_domain_prepare', { domain: 'example.com', job_id: 'cannot-poll-through-start', dry_run: true })).rejects.toThrow();
});

test('local keyword research uses native locations and current desktop serializers without implicit refresh', async () => {
  expect(await keywordParameters('keyword_locations', {})).toEqual({ database: 'us', input: '' });
  expect(await keywordParameters('keyword_locations', { database: 'uk', input: 'London' })).toEqual({ database: 'uk', input: 'London' });
  const input = { keyword: 'café', location_id: 21167, currency: 'EUR' };
  const native = { phrase: 'café', database: 'us', device: 0, date: '', currency: 'EUR', location: 21167 };
  expect(await keywordParameters('keyword_local_overview', input)).toEqual(native);
  expect(await keywordParameters('keyword_local_serp', { ...input, limit: 1000 })).toEqual(native);
  expect(await keywordParameters('keyword_local_serp_organic_metrics', { ...input, urls: ['https://example.com/', 'https://example.com/'] })).toEqual({ ...native, urls: ['https://example.com/', 'https://example.com/'] });
  const exportInput = { keyword: 'café', location_id: 21167 };
  for (const [format, code] of [['csv', 1], ['csv_semicolon', 2], ['xlsx', 0]] as const) {
    expect(await keywordParameters('keyword_local_serp_export', { ...exportInput, format })).toEqual({ phrase: 'café', database: 'us', location: 21167, format: code, filename: 'semrush-keyword-local-serp' });
  }
});

test('SERP domain enrichment sends native lexical domain selections and retains snapshot controls', async () => {
  for (const name of ['keyword_serp_domain_organic_metrics', 'keyword_serp_domain_backlink_metrics']) {
    expect(await keywordParameters(name, { keyword: 'typescript', domains: ['z.example', 'a.example'], device: 'mobile', date: '202609' })).toEqual({ phrase: 'typescript', database: 'us', device: 1, date: '202609', currency: 'USD', location: 0, domains: ['a.example', 'z.example'] });
  }
});

test('explicit keyword refresh previews native phrase records and status uses epoch seconds without polling', async () => {
  const input = { keywords: ['café', 'one, whole phrase'], database: 'uk', location_id: 21167 };
  const phrases = input.keywords.map(phrase => ({ phrase, database: 'uk', location: 21167 }));
  const parsed = await Effect.runPromise(parseReport('keyword_refresh', { ...input, dry_run: true }));
  expect(previewMutation(parsed.name, parsed.definition, parsed.query)).toEqual({ dry_run: true, report: 'keyword_refresh', request: { method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'updates.RequestUpdates', params: { phrases } } } });
  expect(await keywordParameters('keyword_refresh', { keywords: ['typescript'], confirm: true })).toEqual({ phrases: [{ phrase: 'typescript', database: 'us', location: 0 }] });
  expect(await keywordParameters('keyword_refresh_status', { ...input, location_id: 0, status_updated_at: 1792221173.25, currency: 'EUR', domain: 'example.com' })).toEqual({ phrases: phrases.map(phrase => ({ ...phrase, location: 0, status_updated_at: 1792221173.25 })), include_updating: true, currency: 'EUR', domain: 'example.com' });
  expect(await keywordParameters('keyword_refresh_status', { keywords: ['typescript'] })).toEqual({ phrases: [{ phrase: 'typescript', database: 'us', location: 0, status_updated_at: 0 }], include_updating: true, currency: 'USD' });
});

test('local research and refresh reject unsupported selectors, arbitrary RPC fields and invalid selections before authentication', async () => {
  const invalidLocal: Query[] = [{ location_id: 0 }, { location_id: 1.5 }, { location_id: 9007199254740992 }, { device: 'mobile' }, { date: '202609' }, { domain: 'example.com' }, { method: 'updates.RequestUpdates' }, { api_key: 'injected' }];
  for (const name of ['keyword_local_overview', 'keyword_local_serp', 'keyword_local_serp_organic_metrics', 'keyword_local_serp_export']) {
    const valid: Query = { keyword: 'typescript', location_id: 21167 };
    if (name === 'keyword_local_serp_organic_metrics') valid.urls = ['https://example.com/'];
    for (const invalid of invalidLocal) await expect(keywordParameters(name, { ...valid, ...invalid })).rejects.toThrow();
  }
  for (const domains of [[], ['example.com', 'example.com'], ['https://example.com/'], ['example.com/path'], ['example.com\n']]) await expect(keywordParameters('keyword_serp_domain_organic_metrics', { keyword: 'typescript', domains })).rejects.toThrow();
  await expect(keywordParameters('keyword_refresh', { keywords: ['typescript'] })).rejects.toThrow('changes your Semrush account');
  const invalidRefresh: Query[] = [{ keywords: [] }, { keywords: ['same', 'same'] }, { keywords: Array.from({ length: 101 }, (_, i) => 'keyword ' + i) }, { device: 'mobile' }, { date: '202609' }, { location_id: -1 }, { status_updated_at: 1 }];
  for (const invalid of invalidRefresh) await expect(keywordParameters('keyword_refresh', { keywords: ['typescript'], dry_run: true, ...invalid })).rejects.toThrow();
  await expect(keywordParameters('keyword_refresh_status', { keywords: ['typescript'], status_updated_at: -1 })).rejects.toThrow();
  await expect(keywordParameters('keyword_refresh_status', { keywords: ['typescript'], location_id: 21167, domain: 'example.com' })).rejects.toThrow();
});

test('On Page setup uses the native country name, mobile value and explicit configuration-only request', async () => {
  const landings = [{ url: 'https://example.com/', keywords: ['one, whole phrase'] }];
  expect(await preview('onpage_create', { campaign_id: 793, landings, dry_run: true })).toEqual({ method: 'POST', path: '/on-page-seo-checker/api/create', body: {
    id: 793, landings, timezone: 0, settings: { location: { location: 'United States', language: 'en', device: 'desktop', country: 'United States' }, notify: false, schedule: 0, default_agent: true },
  } });
  expect(await preview('onpage_create', { campaign_id: 793, landings, country_name: 'France', language: 'fr', device: 'mobile', crawler: 'googlebot', timezone_offset: -60, schedule: 'weekly', dry_run: true })).toMatchObject({ body: {
    timezone: -60, settings: { location: { location: 'France', language: 'fr', device: 'phone', country: 'France' }, schedule: 1, default_agent: false },
  } });
});

test('On Page report paths preserve exact native snapshot IDs and encode keyword path segments', async () => {
  const base = '/on-page-seo-checker/api/campaigns/793';
  for (const [name, suffix] of Object.entries({ info: '', limits: '/limits', settings: '/settings/', overview: '/overview/', pages: '/landings/', progress: '/progress/', serps: '/serps/' })) {
    expect(await preview('onpage_' + name, { campaign_id: 793 })).toEqual({ method: 'GET', path: base + suffix, body: {} });
  }
  const ids = { campaign_id: 793, page_id: '111111111111111111111111', snapshot_id: '222222222222222222222222' };
  const snapshot = base + '/landings/' + ids.page_id + '/snapshots/' + ids.snapshot_id;
  for (const detail of ['density', 'related', 'backlinks', 'length', 'video', 'readability']) expect(await preview('onpage_page_details', { ...ids, detail })).toEqual({ method: 'GET', path: snapshot + '/' + detail + '/', body: {} });
  expect(await preview('onpage_page_keyword_details', { ...ids, detail: 'serp', keyword: 'one / whole phrase' })).toEqual({ method: 'GET', path: snapshot + '/serp/one%20%2F%20whole%20phrase/', body: {} });
  expect(await preview('onpage_serp', { campaign_id: 793, keyword: 'café' })).toEqual({ method: 'GET', path: base + '/serps/caf%C3%A9/', body: {} });
});

test('On Page confirmed edits and batch operations retain their distinct native bodies without implicit launches', async () => {
  const campaign_id = 793, page_id = '111111111111111111111111', url = 'https://example.com/', keywords = ['example domain'];
  expect(await preview('onpage_configure', { campaign_id, crawler: 'googlebot', notify: false, dry_run: true })).toEqual({ method: 'PUT', path: '/on-page-seo-checker/api/campaigns/793/settings/', body: { default_agent: false, notify: false } });
  expect(await preview('onpage_location_set', { campaign_id, country_code: 'es', location: 'Madrid,Spain', language: 'es', device: 'mobile', dry_run: true })).toMatchObject({ body: { country: 'es', location: 'Madrid,Spain', language: 'es', device: 'phone' } });
  expect(await preview('onpage_page_add', { campaign_id, url, keywords, dry_run: true })).toMatchObject({ method: 'POST', body: { url, keywords } });
  expect(await preview('onpage_page_update', { campaign_id, page_id, url, keywords, switch_scheme: true, dry_run: true })).toMatchObject({ method: 'PUT', body: { url, keywords, id: page_id, is_switch_scheme: true } });
  expect(await preview('onpage_pages_add', { campaign_id, landings: [{ url, keywords }], dry_run: true })).toMatchObject({ method: 'POST', body: [{ url, keywords }] });
  expect(await preview('onpage_pages_delete', { campaign_id, page_ids: [page_id], dry_run: true })).toMatchObject({ method: 'DELETE', body: { ids: [page_id] } });
  expect(await preview('onpage_run', { campaign_id, dry_run: true })).toEqual({ method: 'POST', path: '/on-page-seo-checker/api/campaigns/793/landings/launch', body: null });
  expect(await preview('onpage_page_run', { campaign_id, page_id, dry_run: true })).toMatchObject({ method: 'POST', body: null });
  const unconfirmed: [string, Query][] = [['onpage_configure', { campaign_id, notify: false }], ['onpage_run', { campaign_id }], ['onpage_page_run', { campaign_id, page_id }], ['onpage_pages_delete', { campaign_id, page_ids: [page_id] }]];
  for (const [name, query] of unconfirmed) await expect(preview(name, query)).rejects.toThrow('changes your Semrush account');
});

test('On Page boundaries reject ambiguous assignments, path injection, empty selections and caller account metadata', async () => {
  const valid = { campaign_id: 793, landings: [{ url: 'https://example.com/', keywords: ['example domain'] }], dry_run: true };
  const invalid: Query[] = [{ landings: [] }, { landings: [{ url: 'relative', keywords: ['seo'] }] }, { landings: [{ url: 'https://example.com/\n', keywords: ['seo'] }] },
    { landings: [{ url: 'https://example.com/', keywords: [] }] }, { landings: [{ url: 'https://example.com/', keywords: [' '] }] },
    { landings: [{ url: 'https://example.com/', keywords: ['same'] }, { url: 'https://example.com/two', keywords: ['same'] }] },
    { landings: [{ url: 'https://example.com/', keywords: ['one'] }, { url: 'https://example.com/', keywords: ['two'] }] },
    { paid: true }, { key: 'injected' }, { timezone_offset: 841 }, { device: 'phone' }, { country_name: 'France\n' }];
  for (const input of invalid) await expect(preview('onpage_create', { ...valid, ...input })).rejects.toThrow();
  await expect(preview('onpage_configure', { campaign_id: 793, dry_run: true })).rejects.toThrow();
  for (const page_id of ['111111111111111111111111\n', '../settings', 'AAAAAAAAAAAAAAAAAAAAAAAA']) await expect(preview('onpage_page_run', { campaign_id: 793, page_id, dry_run: true })).rejects.toThrow();
  const maximum = Array.from({ length: 1001 }, (_, i) => 'keyword ' + i);
  await expect(preview('onpage_create', { ...valid, landings: [{ url: 'https://example.com/', keywords: maximum }] })).rejects.toThrow();
});

test('keyword controls preserve default requests and use native monthly, device and currency values', async () => {
  const defaults = { phrase: 'typescript', database: 'us', device: 0, currency: 'USD', location: 0, date: '' };
  expect(await keywordParameters('keyword_overview', { keyword: 'typescript' })).toEqual(defaults);
  for (const name of ['keyword_overview', 'keyword_ideas', 'keyword_ideas_summary', 'keyword_serp', 'keyword_ads', 'keyword_countries', 'keyword_product_ads']) {
    expect(await keywordParameters(name, { keyword: 'typescript', device: 'mobile', date: '202609', currency: 'EUR' })).toMatchObject({ ...defaults, device: 1, date: '202609', currency: 'EUR' });
  }
  const invalidControls: Query[] = [{ device: 'tablet' }, { date: '202613' }, { date: '2026-09' }, { date: '202609\n' }, { currency: 'eur' }, { currency: 'EUR\n' }, { database: 'us\n' }];
  for (const query of invalidControls) {
    await expect(keywordParameters('keyword_overview', { keyword: 'typescript', ...query })).rejects.toThrow('Invalid keyword_overview');
  }
  await expect(keywordParameters('keyword_clusters', { keyword: 'typescript', device: 'mobile' })).rejects.toThrow('Invalid keyword_clusters');
});

test('Bulk Analysis uses the current native serializer and rejects unsupported or ambiguous input before authentication', async () => {
  for (const keywords of [['one, whole phrase'], Array.from({ length: 100 }, (_, i) => 'keyword ' + i)]) {
    expect(await keywordParameters('keyword_bulk', { keywords })).toEqual({ phrases: keywords, database: 'us', currency: 'USD', date: '' });
  }
  expect(await keywordParameters('keyword_bulk', { keywords: ['typescript'], domain: 'github.com', currency: 'EUR' })).toEqual({ phrases: ['typescript'], database: 'us', currency: 'EUR', date: '', domain: 'github.com' });
  const invalid: Query[] = [{}, { keywords: [] }, { keywords: 'typescript,javascript' }, { keywords: [1] }, { keywords: ['  '] }, { keywords: ['x'.repeat(201)] }, { keywords: ['same', 'same'] }, { keywords: Array.from({ length: 101 }, (_, i) => 'keyword ' + i) }, { keywords: ['typescript'], device: 'mobile' }, { keywords: ['typescript'], date: '202609' }];
  for (const query of invalid) await expect(keywordParameters('keyword_bulk', query)).rejects.toThrow('Invalid keyword_bulk');
});

test('SERP enrichment preserves repeated URL selections and the native keyword context', async () => {
  for (const name of ['keyword_serp_organic_metrics', 'keyword_serp_backlink_metrics']) {
    const urls = ['https://example.com/path?q=a,b', 'https://example.com/path?q=a,b'];
    expect(await keywordParameters(name, { keyword: 'typescript', urls, device: 'mobile', date: '202609', currency: 'EUR' })).toEqual({ phrase: 'typescript', database: 'us', device: 1, currency: 'EUR', location: 0, date: '202609', urls });
    for (const urls of [[], ['relative'], ['https://example.com/\n'], Array.from({ length: 101 }, (_, i) => 'https://example.com/' + i)]) {
      await expect(keywordParameters(name, { keyword: 'typescript', urls })).rejects.toThrow('Invalid ' + name);
    }
  }
});

test('native keyword export serializers use closed methods, formats and data columns without wire control flags', async () => {
  for (const [format, code] of Object.entries({ xlsx: 0, csv: 1, csv_semicolon: 2 })) {
    expect(await keywordParameters('keyword_bulk_export', { keywords: ['typescript'], format })).toEqual({ phrases: ['typescript'], database: 'us', currency: 'USD', format: code, filename: 'semrush-keyword-bulk', columns: [0, 1, 2, 3, 4, 5, 7] });
    for (const name of ['keyword_serp_export', 'keyword_serp_domains_export']) {
      expect(await keywordParameters(name, { keyword: 'typescript', device: 'mobile', date: '202609', format })).toEqual({ phrase: 'typescript', database: 'us', device: 1, date: '202609', format: code, filename: name === 'keyword_serp_export' ? 'semrush-keyword-serp' : 'semrush-keyword-serp-domains' });
    }
  }
  expect(await keywordParameters('keyword_bulk_export', { keywords: ['typescript'], domain: 'github.com', columns: ['potential_traffic', 'keyword', 'personalized_difficulty', 'positions'] })).toMatchObject({ domain: 'github.com', columns: [0, 10, 11, 12] });
  const invalidExports: Query[] = [{ columns: [] }, { columns: ['unknown'] }, { columns: ['keyword', 'keyword'] }, { columns: ['potential_traffic'] }, { filename: '../file' }, { format: 'pdf' }, { method: 'user.SetSettings' }, { date: '202609' }];
  for (const query of invalidExports) {
    await expect(keywordParameters('keyword_bulk_export', { keywords: ['typescript'], ...query })).rejects.toThrow('Invalid keyword_bulk_export');
  }
  await expect(keywordParameters('keyword_serp_export', { keyword: 'typescript', currency: 'EUR' })).rejects.toThrow('Invalid keyword_serp_export');
});

test('Core Web Vitals uses fixed GET paths and exact signed decimal URL IDs', async () => {
  const base = '/siteaudit/api/campaigns/793/page-speed-metrics/';
  for (const [suffix, path] of [['status', 'status'], ['overview', 'web-vitals/main-statistics'], ['pages', 'web-vitals/snapshot-metrics'], ['improvements', 'lighthouse-audits/recommendations/top-improvements'], ['settings', 'settings']]) {
    expect(await preview('audit_web_vitals_' + suffix, { campaign_id: 793 })).toEqual({ method: 'GET', path: base + path, body: {} });
  }
  for (const url_id of ['-9223372036854775808', '9223372036854775807']) {
    expect(await preview('audit_web_vitals_history', { campaign_id: 793, url_id })).toEqual({ method: 'GET', path: base + 'web-vitals/history/' + url_id, body: {} });
    expect(await preview('audit_web_vitals_recommendations', { campaign_id: 793, url_id })).toEqual({ method: 'GET', path: base + 'lighthouse-audits/recommendations/' + url_id, body: {} });
  }
  const invalidInputs: Query[] = [{ campaign_id: 793, url_id: 123 }, { campaign_id: 793, url_id: '../settings' }, { campaign_id: 793, url_id: '1e3' }, { campaign_id: 793, url_id: '' }, ...['123\n', '123\r', '123\r\n'].map(url_id => ({ campaign_id: 793, url_id }))];
  for (const invalid of invalidInputs) await expect(preview('audit_web_vitals_history', invalid)).rejects.toThrow('Invalid audit_web_vitals_history');
});

test('Core Web Vitals replacement requires explicit URLs and confirmation, and supports one native offline preview', async () => {
  for (const urls of [['https://example.com/'], Array.from({ length: 10 }, (_, i) => 'https://example.com/' + i)]) {
    const parsed = await Effect.runPromise(parseReport('audit_web_vitals_settings_set', { campaign_id: 793, urls, dry_run: true }));
    expect(previewMutation(parsed.name, parsed.definition, parsed.query)).toEqual({ dry_run: true, report: parsed.name,
      request: { method: 'POST', path: '/siteaudit/api/campaigns/793/page-speed-metrics/settings', body: { urls } } });
  }
  await expect(preview('audit_web_vitals_settings_set', { campaign_id: 793, urls: ['https://example.com/'] })).rejects.toThrow('Use --confirm');
  const invalidInputs: Query[] = [{}, { urls: [] }, { urls: ['relative'] }, { urls: ['file:///etc/passwd'] }, { urls: ['https://example.com/with space'] }, ...['https://example.com/\n', 'https://example.com/\r', 'https://example.com/\r\n'].map(url => ({ urls: [url] })), { urls: ['https://example.com/', 'https://example.com/'] }, { urls: Array.from({ length: 11 }, (_, i) => 'https://example.com/' + i) }];
  for (const input of invalidInputs) await expect(preview('audit_web_vitals_settings_set', { campaign_id: 793, confirm: true, ...input })).rejects.toThrow('Invalid audit_web_vitals_settings_set');
});

test('My Reports discovery is one fixed read-only query and rejects caller GraphQL and control flags', async () => {
  const parsed = await Effect.runPromise(parseReport('reporting_overview', {}));
  expect(parsed.definition).toMatchObject({ mutation: false, destructive: false });
  const request = webRequest(parsed.definition, parsed.query);
  expect(request).toMatchObject({ method: 'POST', path: '/my_reports/graphql/', body: { operationName: 'ReportingOverview' } });
  expect(request.body).toHaveProperty('query', expect.stringContaining('isCommonPrivacyAccepted'));
  const invalidInputs: Query[] = [{ query: 'mutation { createReport }' }, { url: 'https://example.com/' }, { limit: 100 }, { confirm: true }, { dry_run: true }, { offset: -1 }, { offset: 0.5 }, { offset: 2147483648 }, { ownership: 'other' }, { branding: 'other' }, { schedule: 'yearly' }];
  for (const input of invalidInputs) {
    await expect(preview('reporting_overview', input)).rejects.toThrow('Invalid reporting_overview');
  }
});

test('My Reports pagination and grid filters use fixed GraphQL variables without interpolating search text', async () => {
  const initial = await preview('reporting_overview', {});
  expect(initial.body).toHaveProperty('variables', { offset: 0, where: {} });
  const search = 'quote" \n mutation { createReport }';
  const filtered = await preview('reporting_overview', { offset: 30, ownership: 'shared', branding: 'standard', schedule: 'weekly', search });
  const initialQuery = Schema.decodeUnknownSync(Schema.Struct({ query: Schema.String }))(initial.body).query;
  expect(filtered.body).toHaveProperty('query', initialQuery);
  expect(filtered.body).toHaveProperty('variables', { offset: 30, where: {
    ownedByMe: false, isVirtualShare: false, isBranded: false, schedulePeriods: ['weekly'], name: { method: 'Contains', value: search },
  } });
  expect((await preview('reporting_overview', { ownership: 'own', branding: 'branded', schedule: 'daily' })).body)
    .toHaveProperty('variables.where', { ownedByMe: true, isBranded: true, schedulePeriods: ['daily'] });
  expect((await preview('reporting_overview', { ownership: 'team', schedule: 'monthly' })).body)
    .toHaveProperty('variables.where', { isVirtualShare: true, schedulePeriods: ['monthly'] });
  expect((await preview('reporting_overview', { offset: 2147483647 })).body).toHaveProperty('variables.offset', 2147483647);
});

test('protected audit credentials match the native settings payload and disappear from previews', async () => {
  const input = { campaign_id: 123, domain: 'example.com', page_limit: 1, auth_enabled: true, auth_username: 'private-user', auth_password: ' private-password ', dry_run: true };
  const parsed = await Effect.runPromise(parseReport('audit_create', input));
  expect(webRequest(parsed.definition, parsed.query).body).toMatchObject({ authEnabled: true, authUsername: 'private-user', authPassword: ' private-password ' });
  expect(previewMutation(parsed.name, parsed.definition, parsed.query)?.request.body).toMatchObject({ authPassword: '[redacted]' });
  const base = { campaign_id: 123, domain: 'example.com', page_limit: 1, dry_run: true };
  const invalidInputs: Query[] = [{ auth_enabled: true }, { auth_enabled: true, auth_username: 'user' }, { auth_enabled: false, auth_username: 'user', auth_password: 'password' }, { auth_username: 'user', auth_password: 'password' }];
  for (const invalid of invalidInputs) await expect(preview('audit_create', { ...base, ...invalid })).rejects.toThrow();
  expect((await preview('audit_configure', { ...base, auth_enabled: true })).body).toMatchObject({ authEnabled: true, authUsername: '', authPassword: '' });
});

test('crawl URL uploads use the native multipart file field without configuring or starting an audit', async () => {
  const request = await preview('audit_urls_upload', { campaign_id: 123, contents: '/one\nhttps://example.com/two\n', dry_run: true });
  expect(request).toEqual({ method: 'POST', path: '/siteaudit/api/campaigns/123/settings/urls/upload', body: null, encoding: 'multipart', file: { field: 'file-urls', filename: 'semrush-crawl-urls.txt', contents: '/one\nhttps://example.com/two\n' } });
  await expect(preview('audit_urls_upload', { campaign_id: 123, contents: '/one' })).rejects.toThrow('--confirm');
  await expect(preview('audit_urls_upload', { campaign_id: 123, contents: '/one', filename: '../one.txt', dry_run: true })).rejects.toThrow('pattern');
  expect((await preview('audit_create', { campaign_id: 123, domain: 'example.com', page_limit: 1, crawl_source_type: 3, dry_run: true })).body).toMatchObject({ crawlSourceType: 3, crawlSourceUrl: '' });
  await expect(preview('audit_create', { campaign_id: 123, domain: 'example.com', page_limit: 1, crawl_source_type: 3, crawl_source_url: 'semrush-crawl-urls.txt', dry_run: true })).rejects.toThrow('constant');
});

test('Web Bot Auth uses the native headers and preserves secret structure in offline previews', async () => {
  const credentials = { signature_agent: 'private-agent', signature_input: 'private-input', signature: 'private-signature' };
  const input = { campaign_id: 123, domain: 'example.com', page_limit: 10, web_bot_auth_enabled: true, web_bot_auth: credentials, dry_run: true };
  const parsed = await Effect.runPromise(parseReport('audit_create', input));
  expect(webRequest(parsed.definition, parsed.query).body).toMatchObject({ webBotAuthEnabled: true,
    webBotAuthSignatureAgent: credentials.signature_agent, webBotAuthSignatureInput: credentials.signature_input, webBotAuthSignature: credentials.signature });
  const hidden = previewMutation(parsed.name, parsed.definition, parsed.query);
  expect(hidden?.request.body).toMatchObject({ webBotAuthEnabled: true,
    webBotAuthSignatureAgent: '[redacted]', webBotAuthSignatureInput: '[redacted]', webBotAuthSignature: '[redacted]' });
  for (const value of Object.values(credentials)) expect(JSON.stringify(hidden)).not.toContain(value);
  expect(input.web_bot_auth).toEqual(credentials);
  expect((await preview('audit_configure', { campaign_id: 123, domain: 'example.com', page_limit: 10, web_bot_auth_enabled: true, dry_run: true })).body)
    .toMatchObject({ webBotAuthEnabled: true, webBotAuthSignatureAgent: '', webBotAuthSignatureInput: '', webBotAuthSignature: '' });
});

test('Web Bot Auth rejects incomplete credentials, header injection and implicit enabling before authentication', async () => {
  const base = { campaign_id: 123, domain: 'example.com', page_limit: 10, dry_run: true };
  const credentials = { signature_agent: 'agent', signature_input: 'input', signature: 'signature' };
  const invalid: Query[] = [
    { web_bot_auth_enabled: true }, { web_bot_auth: credentials },
    { web_bot_auth_enabled: false, web_bot_auth: credentials },
    { web_bot_auth_enabled: true, web_bot_auth: { signature: 'signature' } },
    { web_bot_auth_enabled: true, web_bot_auth: { ...credentials, signature_input: 'input\r\ninjected: header' } },
    // JavaScript's $ also matches before a final newline; header validation must reach the true end.
    { web_bot_auth_enabled: true, web_bot_auth: { ...credentials, signature_agent: 'agent\n' } },
    { web_bot_auth_enabled: true, web_bot_auth: { ...credentials, signature: 'signature\r' } },
    { web_bot_auth_enabled: true, web_bot_auth: { ...credentials, extra: 'unknown' } },
  ];
  for (const selection of invalid) await expect(preview('audit_create', { ...base, ...selection })).rejects.toThrow('Invalid audit_create');
});

test('Position Tracking creation matches the web wizard without billing or emails', async () => {
  expect(await preview('position_create', { project_id: 123, domain: 'example.com', keywords: ['example domain'], location_id: 2840, dry_run: true })).toEqual({
    method: 'POST', path: '/tracking/web-api/management/123/create_targets', body: {
      url: 'example.com', url_type: 'rootdomain', keywords: [{ keyword: 'example domain', tags: [] }],
      targeting: [{ timezone: 0, title: 'example.com', weekly_notification: false,
        device: 'desktop', engine: 'google', business_name: '', brands: [],
        location: { language_code: 'en', location_id: 2840, volume_type: 'national' } }],
    },
  });
});

test('incremental tracking keyword changes preserve the web state API shapes', async () => {
  const target = { campaign_id: '123_456', keywords: ['example domain'], dry_run: true };
  expect((await preview('position_keywords_add', { ...target, tags: ['test'] })).body).toEqual({ create: [{ keyword: 'example domain', tags: ['test'] }] });
  expect((await preview('position_keywords_delete', target)).body).toEqual({ delete: ['example domain'] });
  expect((await preview('position_keyword_tags', { ...target, add_tags: ['test'], remove_tags: ['old'] })).body).toEqual({
    'update-attributes': [{ keyword: 'example domain', tags: { create: ['test'], delete: ['old'] } }],
  });
  expect((await preview('position_competitors_set', { campaign_id: '123_456', competitors: ['example.org'], dry_run: true })).body).toEqual([{ domain: 'example.org', url: 'example.org' }]);
});

test('audit detail paths use opaque IDs and preserve the two pagination conventions', async () => {
  expect(await preview('audit_pages', { campaign_id: 123 })).toEqual({ method: 'GET', path: '/siteaudit/api/campaigns/123/pages', body: { page: 0, limit: 20, sort: 'url_asc' } });
  expect(await preview('audit_issue', { campaign_id: 123, snapshot_id: '6ad0d55074f45d963976d36d', issue_id: 2 })).toEqual({ method: 'GET', path: '/siteaudit/api/campaigns/123/snapshot/6ad0d55074f45d963976d36d/issue/2', body: { page: 1, limit: 10, sort: 'index_asc', visible: true } });
  expect(await preview('audit_page', { campaign_id: 123, page_id: '6ad0d569b38e056b84148653' })).toEqual({ method: 'GET', path: '/siteaudit/api/campaigns/123/pageData/6ad0d569b38e056b84148653', body: {} });
  for (const name of ['audit_abort', 'audit_finalize']) {
    expect((await preview(name, { campaign_id: 123, dry_run: true })).body).toBeNull();
  }
  expect((await preview('audit_recrawl', { campaign_id: 123, page_id: 'opaque_123', dry_run: true })).body).toBeNull();
});

test('target validation respects defaults, URL types and engine device support', async () => {
  const base = { project_id: 123, domain: 'example.com', keywords: ['example'], location_id: 2840, dry_run: true };
  await expect(preview('position_create', { ...base, device: 'phone' })).resolves.toMatchObject({ body: { targeting: [{ engine: 'google', device: 'phone' }] } });
  await expect(preview('position_create', { ...base, domain: 'https://example.com/page', url_type: 'url' })).resolves.toMatchObject({ body: { url_type: 'url' } });
  await expect(preview('position_create', { ...base, domain: 'https://example.com/page' })).rejects.toThrow('pattern');
  await expect(preview('position_create', { ...base, engine: 'baidu', device: 'phone' })).rejects.toThrow('constant');
  await expect(preview('audit_page', { campaign_id: 123, page_id: '../other' })).rejects.toThrow('pattern');
  await expect(preview('position_keyword_tags', { campaign_id: '123_456', keywords: ['example'], add_tags: [], remove_tags: [], dry_run: true })).rejects.toThrow('must NOT have fewer');
});

test('every new workflow mutation requires consent before runtime acquisition', async () => {
  for (const name of ['audit_abort', 'audit_finalize']) {
    await expect(preview(name, { campaign_id: 123 })).rejects.toThrow('--confirm');
  }
  await expect(preview('position_create', { project_id: 123, domain: 'example.com', keywords: ['example'], location_id: 2840 })).rejects.toThrow('--confirm');
});

test('tracking reports preserve repeated target parameters and bracketed sort keys', async () => {
  expect(await preview('position_overview', { campaign_id: '123_456', date_begin: '20261015', date_end: '20261015', competitors: ['*.example.com/*', '*.example.org/*'] })).toEqual({
    method: 'GET', path: '/tracking/web-api/reports/overview', body: {
      campaign_id: '123_456', date_begin: '20261015', date_end: '20261015',
      'competitors[]': ['*.example.com/*', '*.example.org/*'], type: 'organic', volume_level: 'national',
      limit: 20, offset: 0, 'sort[field]': 'visibility', 'sort[order]': 'desc', 'sort[date]': 'end', 'sort[competitor]': 0,
    },
  });
});


test('domain strategies match the current auditor RPC without basket credentials or control flags', async () => {
  expect(await preview('domain_strategy_create', { domain: 'example.com', dry_run: true })).toEqual({
    method: 'POST', path: '/ksb/rpc', body: { id: 1, jsonrpc: '2.0', method: 'audit.Create',
      params: { domain: 'example.com', seedPhrases: [], database: 'us', geoMarkers: [] } },
  });
  expect((await preview('domain_strategies', { ownership: 'own', sort_field: 'name', descending: false, limit: 10, offset: 20 })).body).toMatchObject({
    params: { ownership: 'own', sortBy: 'name', sortOrder: 'asc', nameFilter: '', limit: 10, offset: 20 },
  });
  await expect(preview('domain_strategy_create', { domain: 'example.com' })).rejects.toThrow('--confirm');
  await expect(preview('domain_strategy_delete', { strategy_ids: [], dry_run: true })).rejects.toThrow('fewer');
  await expect(preview('domain_strategy_get', { strategy_id: 9007199254740992 })).rejects.toThrow('<=');
});


test('domain page filters, intent codes and exports match the current audit client', async () => {
  const request = await preview('domain_strategy_pages', { strategy_id: 123, preset: 'create', text: '  python  ', volume_min: 1000, difficulty_max: 50, primary_intents: ['commercial'], limit: 10, offset: 20 });
  expect(request.body).toMatchObject({ params: { auditId: 123, preset: 3, limit: 10, offset: 20, filters: {
    textSearch: 'python', potentialVolume: { min: 1000, max: null }, difficulty: { min: null, max: 50 }, primaryIntent: [3],
  } } });
  expect((await preview('domain_strategy_export', { strategy_id: 123, format: 'csv_semicolon' })).body).toMatchObject({ method: 'export.GetAudit', params: { auditId: 123, format: 'csvs' } });
  await expect(preview('domain_strategy_pages', { strategy_id: 123, volume_min: 100, volume_max: 10 })).rejects.toThrow('must not exceed');
  await expect(preview('domain_strategy_keywords_delete', { keyword_ids: [], dry_run: true })).rejects.toThrow('fewer');
  for (const filename of ['../export', 'folder\\export', 'two\nlines']) await expect(preview('domain_strategy_export', { strategy_id: 123, filename })).rejects.toThrow('pattern');
});


test('seed-based page requests match captured native UI calls without using domain preset codes', async () => {
  const selected = { basket_id: 456, owner_id: 123 };
  expect((await preview('keyword_list_pages', selected)).body).toEqual({ id: 1, jsonrpc: '2.0', method: 'baskets.BasketGetPages', params: {
    BasketID: 456, OwnerID: 123, Preset: 1, Filter: { Phrase: [], TopicName: [], Volume: [], Difficulty: [], Intents: [], Includes: [], IsFavorite: { Value: false } },
    Order: [{ Direction: 1, Field: 'metrics_score_v2' }],
  } });
  expect((await preview('keyword_list_clusters', { ...selected, parent_id: 789, page: 2, page_size: 10, descending: false, sort_field: 'volume' })).body).toMatchObject({ params: {
    ParentID: 789, Page: { Number: 2, Size: 10 }, Order: [{ Direction: 0, Field: 'volume' }],
  } });
  expect((await preview('keyword_list_cluster_keywords', { ...selected, cluster_id: 789 })).body).toMatchObject({ params: {
    ClusterID: 789, Page: { Number: 1, Size: 100 }, Order: { Direction: 1, Field: 'difficulty' },
  } });
  for (const name of ['keyword_list_page_favorite', 'keyword_list_page_unfavorite']) {
    await expect(preview(name, { ...selected, page_id: 789 })).rejects.toThrow('--confirm');
    expect((await preview(name, { ...selected, page_id: 789, dry_run: true })).body).toMatchObject({ params: { BasketID: 456, OwnerID: 123, ID: 789 } });
  }
  await expect(preview('keyword_list_clusters_delete', { ...selected, cluster_ids: [], dry_run: true })).rejects.toThrow('fewer');
  await expect(preview('keyword_list_pages', { ...selected, page_filters: { unknown: [] } })).rejects.toThrow('additional');
});

test('seed exports keep page and keyword filters separate and match native export selection formats', async () => {
  const selected = { basket_id: 456, owner_id: 123 };
  expect((await preview('keyword_list_export_keywords', { ...selected, keywords: ['email marketing'], database: 'us', format: 'csv_semicolon' })).body).toEqual({
    id: 1, jsonrpc: '2.0', method: 'export_v2.ExportKeywordsByIDs', params: {
      BasketID: 456, OwnerID: 123, KeywordIDs: [{ Phrase: 'email marketing', Database: 'us' }], Format: 2, Filename: 'semrush-keyword-list',
    },
  });
  expect((await preview('keyword_list_export_pages', { ...selected, page_filters: { IsFavorite: { Value: true } } })).body).toMatchObject({ params: { Filter: { IsFavorite: { Value: true }, TopicName: [] }, Format: 1 } });
  expect((await preview('keyword_list_export', { ...selected, filters: { ClusterIDs: [789] } })).body).toMatchObject({ params: { Filter: { ClusterIDs: [789], Databases: [] } } });
  expect((await preview('keyword_list_export_clusters', { ...selected, cluster_ids: [789], format: 'xlsx' })).body).toMatchObject({ params: { ClusterIDs: [789], Format: 0 } });
  await expect(preview('keyword_list_export_keywords', { ...selected, keywords: [] })).rejects.toThrow('fewer');
});


test('tracking partial edits preview only supplied fields and validate address/type pairs before authentication', async () => {
  const selected = { campaign_id: '123_456' };
  expect(await preview('position_configure', { ...selected, business_name: 'example', dry_run: true })).toEqual({
    method: 'POST', path: '/positions/api/campaign_edit_domain_settings', body: { campaignId: '123_456', businessName: 'example' },
  });
  expect((await preview('position_configure', { ...selected, brands: ['example'], dry_run: true })).body).toEqual({ campaignId: '123_456', brands: ['example'] });
  await expect(preview('position_configure', { ...selected, brands: [], dry_run: true })).rejects.toThrow('fewer');
  await expect(preview('position_configure', { ...selected, business_name: 'example' })).rejects.toThrow('--confirm');
  await expect(preview('position_configure', { ...selected, dry_run: true })).rejects.toThrow('required');
  await expect(preview('position_configure', { ...selected, domain: 'example.com', dry_run: true })).rejects.toThrow('url_type');
  await expect(preview('position_configure', { ...selected, url_type: 'url', dry_run: true })).rejects.toThrow('domain');
  await expect(preview('position_configure', { ...selected, domain: 'example.com', url_type: 'url', dry_run: true })).rejects.toThrow('pattern');
});


test('basket transfers use nested source/target selectors and reject self-transfers before authentication', async () => {
  const selected = { basket_id: 456, owner_id: 123, target_basket_id: 789, target_owner_id: 321 };
  expect((await preview('keyword_list_keywords_copy', { ...selected, keywords: ['email marketing'], database: 'us', dry_run: true })).body).toEqual({
    id: 1, jsonrpc: '2.0', method: 'baskets.CopyKeywordsByIDs', params: {
      SourceShareID: { BasketID: 456, OwnerID: 123 }, TargetShareID: { BasketID: 789, OwnerID: 321 }, KeywordIDs: [{ Phrase: 'email marketing', Database: 'us' }],
    },
  });
  expect((await preview('keyword_list_clusters_move', { ...selected, cluster_ids: [1008], dry_run: true })).body).toMatchObject({
    method: 'baskets.MoveKeywordsByClusterIDs', params: { SourceShareID: { BasketID: 456, OwnerID: 123 }, TargetShareID: { BasketID: 789, OwnerID: 321 }, ClusterIDs: [1008] },
  });
  await expect(preview('keyword_list_clusters_copy', { ...selected, cluster_ids: [1008] })).rejects.toThrow('--confirm');
  await expect(preview('keyword_list_keywords_move', { ...selected, target_basket_id: 456, keywords: ['email marketing'], dry_run: true })).rejects.toThrow('different');
  await expect(preview('keyword_list_keywords_copy', { ...selected, keywords: [], dry_run: true })).rejects.toThrow('fewer');
  await expect(preview('keyword_list_clusters_move', { ...selected, cluster_ids: [], dry_run: true })).rejects.toThrow('fewer');
});


test('tracking alert request types are catalog-owned and rule writes require explicit selections', async () => {
  const campaign = { campaign_id: '123_456' };
  expect(await preview('position_alerts', { ...campaign, page: 2, limit: 10 })).toEqual({ method: 'POST', path: '/tracking/alerts/', body: { ...campaign, request_type: 'alert_list_read', page: 2, display_limit: 10 } });
  for (const [name,kind] of [['position_triggers','trigger_list_read'],['position_trigger_count','trigger_items_count'],['position_alert_counts','alert_items_count']] as const) {
    expect((await preview(name, campaign)).body).toEqual({ ...campaign, request_type: kind });
  }
  const rule = { ...campaign, domain: 'example.com', condition: 'enters_top', threshold: 10, dry_run: true };
  expect((await preview('position_trigger_create', rule)).body).toEqual({ ...campaign, request_type: 'trigger_create', trigger_body: { domain: 'example.com', condition: 'enters_top', threshold: 10, parameter: 'position', scope: 'all' } });
  expect((await preview('position_trigger_update', { ...rule, trigger_id: 'opaque-rule' })).body).toMatchObject({ trigger_id: 'opaque-rule', trigger_body: { id: 'opaque-rule' } });
  expect((await preview('position_trigger_delete', { ...campaign, trigger_id: 'opaque-rule', dry_run: true })).body).toEqual({ ...campaign, request_type: 'trigger_delete', trigger_id: 'opaque-rule' });
  await expect(preview('position_alerts', { ...campaign, request_type: 'alert_read' })).rejects.toThrow('additional');
  await expect(preview('position_trigger_create', { ...rule, threshold: 0 })).rejects.toThrow('>=');
  await expect(preview('position_trigger_create', { ...rule, threshold: 101 })).rejects.toThrow('<=');
  await expect(preview('position_trigger_create', { ...rule, dry_run: false })).rejects.toThrow('--confirm');
});


test('alert event writes require confirmation and preserve opaque selected IDs in fixed native requests', async () => {
  const campaign = { campaign_id: '123_456' };
  const selected = { ...campaign, alert_id: '900719925474099312345', dry_run: true };
  for (const [name, request_type] of [['position_alert_read', 'alert_read'], ['position_alert_delete', 'alert_delete']] as const) {
    expect((await preview(name, selected)).body).toEqual({ ...campaign, alert_id: selected.alert_id, request_type });
    await expect(preview(name, campaign)).rejects.toThrow();
    await expect(preview(name, { ...selected, dry_run: false })).rejects.toThrow('--confirm');
    await expect(preview(name, { ...selected, alert_id: '' })).rejects.toThrow('fewer');
  }
  expect((await preview('position_alert_mark_all_read', { ...campaign, dry_run: true })).body).toEqual({ ...campaign, request_type: 'alert_mark_as_read' });
  await expect(preview('position_alert_mark_all_read', campaign)).rejects.toThrow('--confirm');
  await expect(preview('position_alert_mark_all_read', { ...selected })).rejects.toThrow('additional');
});

test('tracking comparison keeps composite target IDs, native intersection codes and target sort keys', async () => {
  const dates = { campaign_id: '123_456', date_begin: '20261015', date_end: '20261015' };
  expect((await preview('position_distribution', { ...dates, competitors: ['*.example.com/*'] })).body).not.toHaveProperty('limit');
  expect((await preview('position_competitors', { ...dates, main_competitor: 'example.com' })).path).toBe('/tracking/web-api/reports/competitors');
  expect((await preview('position_distribution', { ...dates, competitors: ['*.example.com/*'], sort_field: 'top10' })).body).toMatchObject({ 'sort[field]': 'top10', 'sort[top]': 'all' });
  await expect(preview('position_distribution', { ...dates, competitors: ['*.example.com/*'], sort_field: 'visibility', sort_top: 'improved' })).rejects.toThrow('allowed values');
  const selected = { ...dates, competitors: ['*.example.com/*'], target_ids: ['123_456', '123_789'] };
  const all = await preview('position_targets_compare', selected);
  expect(all).toMatchObject({ method: 'GET', path: '/tracking/web-api/reports/multi_overview', body: { 'targets[]': selected.target_ids, main_target: dates.campaign_id, 'competitors[]': selected.competitors, 'sort[target]': 0, 'sort[field]': 'position' } });
  expect(all.body).not.toHaveProperty('target_ids'); expect(all.body).not.toHaveProperty('intersection_type'); expect(all.body).not.toHaveProperty('main_competitor');
  for (const intersection_type of ['shared','not_in_main','only_in_main']) expect((await preview('position_targets_compare', { ...selected, intersection_type })).body).toHaveProperty('intersection_type', intersection_type);
  await expect(preview('position_targets_compare', { ...selected, target_ids: ['123_456','123_456'] })).rejects.toThrow('duplicate');
  await expect(preview('position_targets_compare', { ...selected, target_ids: ['123'] })).rejects.toThrow('pattern');
});

test('notes plans retain native selections, nullable project scope and chart category arrays', async () => {
  expect(await preview('notes_export', {})).toEqual({ method: 'POST', path: '/notes/api/notes/export/', body: {}, encoding: 'form' });
  expect((await preview('notes', { tools: ['POSITION_TRACKING'], project_ids: [123], database: 'us', include_hidden: false })).body).toEqual({
    tools: 'POSITION_TRACKING', projects: '123', databases: 'US,ALL', get_hidden: 'false', ordering: '-datetime,-created', page: 1, per_page: 20, locale: 'en',
  });
  expect(await preview('note_hidden_categories_set', { tool: 'POSITION_TRACKING', project_id: 123, categories: [], dry_run: true })).toEqual({
    method: 'PUT', path: '/notes/api/notes/v2/hidden/categories/?tool=POSITION_TRACKING&project_id=123', body: [],
  });
  expect((await preview('note_create', { title: 'Owned', datetime: '2026-10-15T00:00:00Z', tools: ['POSITION_TRACKING'], dry_run: true })).body).toMatchObject({ category: 'USER_NOTE', project: null, databases: [], note: '', datetime: '2026-10-15T00:00:00.000Z' });
  expect((await preview('note_update', { note_id: 'owned-1', project_id: null, dry_run: true })).body).toEqual({ project: null });
  await expect(preview('note_update', { note_id: 'owned-1', dry_run: true })).rejects.toThrow();
  await expect(preview('note_delete', { note_id: '../published', dry_run: true })).rejects.toThrow('pattern');
  await expect(preview('note_hide', { note_id: 'owned-1' })).rejects.toThrow('--confirm');
  await expect(preview('note_hidden_categories', { tool: 'POSITION_TRACKING' })).rejects.toThrow('project_id');
  await expect(preview('note_create', { title: 'Owned', datetime: '2026-10-15T00:00:00Z', tools: ['DOMAIN_OVERVIEW'], dry_run: true })).rejects.toThrow();
  await expect(preview('note_create', { title: 'Owned', datetime: '2026-02-30T00:00:00Z', tools: ['POSITION_TRACKING'], dry_run: true })).rejects.toThrow('valid UTC');
  await expect(preview('notes', { datetime_from: '2026-10-16T00:00:00Z', datetime_to: '2026-10-15T00:00:00Z' })).rejects.toThrow('must not exceed');
});


test('target replacement and deletion require consent and expose no runtime capabilities in previews', async () => {
  const selected = { campaign_id: '123_456' };
  expect(await preview('position_replace', { ...selected, device: 'phone', dry_run: true })).toEqual({ method: 'POST', path: '/positions/api/replace_target', body: { id: '123_456', device_group: 'phone', timezone: 0 } });
  expect(await preview('position_delete', { ...selected, dry_run: true })).toEqual({ method: 'DELETE', path: '/positions/api/targets/123_456', body: {}, encoding: 'query' });
  await expect(preview('position_replace', { ...selected, dry_run: true })).rejects.toThrow('required');
  await expect(preview('position_replace', { ...selected, device: 'phone' })).rejects.toThrow('--confirm');
  await expect(preview('position_delete', selected)).rejects.toThrow('--confirm');
  await expect(preview('position_delete', { campaign_id: '../bad', dry_run: true })).rejects.toThrow('pattern');
});


test('tracking engine-specific location lookup matches native selectors', async () => {
  const parsed = await Effect.runPromise(parseReport('position_locations', { query: 'United Kingdom', engine: 'bing' }));
  expect(webRequest(parsed.definition, parsed.query).body).toEqual({ q: 'United Kingdom', filter_engine: 'bing' });
});


test('Backlink Audit read requests match captured native wizard and overview contracts', async () => {
  const contract = Schema.decodeUnknownSync(Schema.Struct({ source: Schema.String, requests: Schema.Array(Schema.Struct({ name: Schema.String, input: Schema.Record(Schema.String, Schema.Json), method: Schema.String, params: Schema.Record(Schema.String, Schema.Json) })) }))(JSON.parse(await readFile(new URL('./fixtures/backlink-audit-requests.json', import.meta.url), 'utf8')));
  for (const sample of contract.requests) {
    const parsed = await Effect.runPromise(parseReport(sample.name, sample.input));
    expect(webRequest(parsed.definition, parsed.query)).toEqual({ method: 'POST', path: '/backlink_audit/rpc/?method=' + sample.method, body: { id: 1, jsonrpc: '2.0', method: sample.method, params: sample.params } });
  }
});

test('Backlink Audit creation has manual defaults and configuration includes only supplied fields', async () => {
  const created = await preview('backlink_audit_create', { project_id: 789, dry_run: true });
  expect(created.body).toMatchObject({ method: 'domains.AddByProjectId', params: { projectId: 789, scope: 'root', params: { recrawl: 'never', recrawlNotify: false, recrawlMajestic: false } } });
  const configured = await preview('backlink_audit_configure', { audit_id: 456, brands: [], dry_run: true });
  expect(configured.body).toEqual({ id: 1, jsonrpc: '2.0', method: 'domains.ApplySettings', params: { userDomainId: 456, params: { brands: [] } } });
  await expect(preview('backlink_audit_configure', { audit_id: 456, dry_run: true })).rejects.toThrow('required');
  await expect(preview('backlink_audit_create', { project_id: 789 })).rejects.toThrow('--confirm');
  const categories = await preview('backlink_audit_configure', { audit_id: 456, categories: [6], dry_run: true });
  expect(categories.body).toMatchObject({ params: { params: { categories: ['6'] } } });
});


test('Backlink Audit disavow export requires consent and its preview excludes runtime account metadata', async () => {
  await expect(preview('backlink_audit_disavow_export', { audit_id: 456 })).rejects.toThrow('--confirm');
  expect(await preview('backlink_audit_disavow_export', { audit_id: 456, dry_run: true })).toEqual({ method: 'POST', path: '/backlink_audit/files/disavow/download/456', body: {}, encoding: 'multipart' });
});


test('Backlink Audit list moves require consent and native selection identifiers', async () => {
  for (const [operation, method, ids] of [
    ['move_domains', 'MoveDomains', ['00000000-0000-0000-0000-000000000001']],
    ['move_links', 'MoveUrls', ['00000000-0000-0000-0000-000000000001']],
    ['move_networks', 'MoveLinkNetworks', [19387720322]],
  ] as const) {
    const input = { audit_id: 456, ids: [...ids], list: 'whitelist' };
    await expect(preview('backlink_audit_' + operation, input)).rejects.toThrow('--confirm');
    expect((await preview('backlink_audit_' + operation, { ...input, dry_run: true })).body).toEqual({ id: 1, jsonrpc: '2.0', method: 'backlinks.' + method, params: { userDomainId: 456, ids, list: 'whitelist' } });
  }
  await expect(preview('backlink_audit_move_links', { audit_id: 456, ids: ['9007199254740993'], list: 'whitelist', dry_run: true })).rejects.toThrow('pattern');
});


test('Disavow row actions use numeric item IDs and require consent', async () => {
  for (const operation of ['move', 'delete']) {
    const input: Query = { audit_id: 456, item_id: 101 };
    const params: Query = { userDomainId: 456, userListItemId: 101 };
    if (operation === 'move') { input.list = 'for-review'; params.list = 'for-review'; }
    await expect(preview('backlink_audit_disavow_' + operation, input)).rejects.toThrow('--confirm');
    expect((await preview('backlink_audit_disavow_' + operation, { ...input, dry_run: true })).body).toEqual({ id: 1, jsonrpc: '2.0', method: operation === 'move' ? 'disavow.Move' : 'disavow.Delete', params });
  }
});


test('Disavow bulk clearing requires an explicit source selection and consent', async () => {
  await expect(preview('backlink_audit_disavow_clear', { audit_id: 456, dry_run: true })).rejects.toThrow("required property 'with_file'");
  await expect(preview('backlink_audit_disavow_clear', { audit_id: 456, with_manual: false, with_file: false, with_gdt: false, dry_run: true })).rejects.toThrow('constant');
  await expect(preview('backlink_audit_disavow_clear', { audit_id: 456, with_file: true })).rejects.toThrow('--confirm');
  expect((await preview('backlink_audit_disavow_clear', { audit_id: 456, with_file: true, dry_run: true })).body).toEqual({ id: 1, jsonrpc: '2.0', method: 'disavow.Clear', params: { userDomainId: 456, withManual: false, withFile: true, withGDT: false } });
});


test('Backlink Audit target-page filters preserve native flat fields and sorting', async () => {
  const filters = { audit_id: 456, query: '/docs', query_mode: 'targetUrl', by_domain: false, target_error: true, labels: ['review'], is_new: true };
  const native = { userDomainId: 456, query: '/docs', queryMode: 'targetUrl', collapse: null, targetUrlError: true, userTags: ['review'], isNew: true };
  expect((await preview('backlink_audit_target_pages', { ...filters, page: 2, page_size: 10, sort_field: 'lost', descending: false })).body).toMatchObject({ params: { ...native, sort: '+lost', page: 2, pageSize: 10 } });
  expect((await preview('backlink_audit_target_pages_count', filters)).body).toMatchObject({ params: native });
});

test('Backlink Audit annotation writes use native fields and require explicit consent', async () => {
  const cases: [string, Query, string, Query][] = [
    ['comment_save', { domain: 'example.net', comment: 'Check this domain' }, 'comments.Save', { domain: 'example.net', comment: 'Check this domain' }],
    ['comment_delete', { comment_id: 321 }, 'comments.Delete', { id: 321 }],
    ['target_tag_add', { label: 'review', target_url: 'https://example.com/' }, 'usertags.AddTargetUrlTag', { label: 'review', targetUrl: 'https://example.com/' }],
    ['target_tag_remove', { label: 'review', target_url: 'https://example.com/' }, 'usertags.RemoveTargetUrlTag', { label: 'review', targetUrl: 'https://example.com/' }],
    ['tag_delete', { label: 'review' }, 'usertags.Delete', { label: 'review' }],
  ];
  for (const [operation, input, method, params] of cases) {
    await expect(preview('backlink_audit_' + operation, { audit_id: 456, ...input })).rejects.toThrow('--confirm');
    expect((await preview('backlink_audit_' + operation, { audit_id: 456, ...input, dry_run: true })).body).toEqual({ id: 1, jsonrpc: '2.0', method, params: { userDomainId: 456, ...params } });
  }
  await expect(preview('backlink_audit_comment_save', { audit_id: 456, domain: 'example.net', comment: 'x'.repeat(501), dry_run: true })).rejects.toThrow('500');
});

test('Backlink Audit reruns have explicit native plans', async () => {
  await expect(preview('backlink_audit_rerun', { audit_id: 456 })).rejects.toThrow('--confirm');
  expect((await preview('backlink_audit_rerun', { audit_id: 456, dry_run: true })).body).toMatchObject({ method: 'domains.PushIncImport', params: { userDomainId: 456 } });
});


test('Backlink Audit CSV uses the current filtered search without table pagination', async () => {
  const request = await preview('backlink_audit_export', { audit_id: 456, query: 'example.net', query_mode: 'url', by_domain: false });
  expect(request.body).toMatchObject({ method: 'backlinks.StartBacklinksCSVExport', params: { userDomainId: 456, search: { query: 'example.net', queryMode: 'url', collapse: null } } });
  expect(request.body).not.toHaveProperty('params.page'); expect(request.body).not.toHaveProperty('params.pageSize');
});


test('Backlink Audit CSV import previews file bytes without staging or exposing runtime credentials', async () => {
  const contents = '"https://example.net/link"\r\n';
  await expect(preview('backlink_audit_import', { audit_id: 456, contents })).rejects.toThrow('--confirm');
  expect(await preview('backlink_audit_import', { audit_id: 456, contents, dry_run: true })).toEqual({
    method: 'POST', path: '/backlink_audit/files/backlinks/upload/456', encoding: 'multipart', body: null,
    file: { field: 'backlinks', filename: 'semrush-backlinks.csv', contents },
  });
  await expect(preview('backlink_audit_import', { audit_id: 456, contents: '', dry_run: true })).rejects.toThrow();
  await expect(preview('backlink_audit_import', { audit_id: 456, contents, filename: '../bad.csv', dry_run: true })).rejects.toThrow();
});


test('Backlink Audit scope replacement previews only explicit inputs before runtime preservation reads', async () => {
  await expect(preview('backlink_audit_replace_scope', { project_id: 789, scope: 'both' })).rejects.toThrow('--confirm');
  expect((await preview('backlink_audit_replace_scope', { project_id: 789, scope: 'both', dry_run: true })).body).toEqual({
    id: 1, jsonrpc: '2.0', method: 'domains.AddByProjectId', params: { projectId: 789, scope: 'both', params: {} },
  });
  await expect(preview('backlink_audit_replace_scope', { project_id: 789, dry_run: true })).rejects.toThrow();
  await expect(preview('backlink_audit_replace_scope', { project_id: 789, scope: 'invalid', dry_run: true })).rejects.toThrow();
});

test('Site Audit export selections preserve native resource IDs and format fields', async () => {
  const options = { format: 'xlsx', relative: true, sort: 'url_desc', filter: 'café' };
  expect(await preview('audit_export_page_issues', { campaign_id: 789, ...options })).toMatchObject({
    method: 'GET', path: '/siteaudit/export/campaigns/789', body: { export: 'xlsx', relative: true, sort: 'url_desc', filter: 'café' },
  });
  expect(await preview('audit_export_markup', { snapshot_id: 'opaque_snapshot', ...options })).toMatchObject({
    method: 'GET', path: '/siteaudit/export/pagesStructuredData/opaque_snapshot', body: { export: 'xlsx', relative: true, sort: 'url_desc', filter: 'café' },
  });
});

test('Site Audit comparisons keep native snapshot ordering and require distinct explicit IDs', async () => {
  const selection = { first_snapshot_id: 'old_snapshot', second_snapshot_id: 'new_snapshot' };
  expect(await preview('audit_export_compare', selection)).toEqual({
    method: 'GET', path: '/siteaudit/export/snapshot/new_snapshot/compare/old_snapshot', body: { export: 'csv' },
  });
  expect(await preview('audit_export_compare', { ...selection, format: 'xlsx' })).toEqual({
    method: 'GET', path: '/siteaudit/export/snapshot/new_snapshot/compare/old_snapshot', body: { export: 'xlsx' },
  });
  await expect(preview('audit_export_compare', { ...selection, second_snapshot_id: 'old_snapshot' })).rejects.toThrow('two different Site Audit snapshots');
  await expect(preview('audit_export_compare', { first_snapshot_id: 'old_snapshot' })).rejects.toThrow();
  await expect(preview('audit_export_compare', { ...selection, first_snapshot_id: '../old' })).rejects.toThrow();
});

test('JS Impact guide and counts use fixed campaign reads without table filters', async () => {
  for (const [name, suffix] of [['audit_js_impact_guide', 'guide'], ['audit_js_impact_changed_pages', 'changed-pages']] satisfies [string, string][]) {
    expect(await preview(name, { campaign_id: 123 })).toEqual({ method: 'GET', path: '/siteaudit/api/campaigns/123/js-impact/' + suffix, body: {} });
    await expect(preview(name, { campaign_id: 123, status: 'changed' })).rejects.toThrow('additional properties');
  }
});

test('JS Impact pagination, filters and sorting match the current native client', async () => {
  expect(await preview('audit_js_impact_pages', { campaign_id: 123 })).toEqual({ method: 'GET', path: '/siteaudit/api/campaigns/123/js-impact/details', body: { sort: 'DESC', page: 0, limit: 10 } });
  expect((await preview('audit_js_impact_pages', { campaign_id: 123, page: 2, limit: 25, query: '/café', status: 'changed', parameters: ['title', 'wordsCount'], sort: 'asc' })).body).toEqual({ sort: 'ASC', page: 2, limit: 25, url: '/café', changed: 'true', parameters: 'title,wordsCount' });
  expect((await preview('audit_js_impact_pages', { campaign_id: 123, status: 'unchanged' })).body).toEqual({ sort: 'DESC', page: 0, limit: 10, changed: 'false' });
});

test('JS Impact exports keep filters while downloading all matching rows', async () => {
  expect(await preview('audit_export_js_impact', { campaign_id: 123 })).toEqual({ method: 'GET', path: '/siteaudit/export/js-impact/123', body: { sort: 'DESC', page: 0, limit: 100000, export: 'csv' } });
  expect((await preview('audit_export_js_impact', { campaign_id: 123, status: 'changed', parameters: ['canonical'], query: '/one', sort: 'asc', format: 'xlsx' })).body).toEqual({ sort: 'ASC', page: 0, limit: 100000, url: '/one', changed: 'true', parameters: 'canonical', export: 'xlsx' });
  await expect(preview('audit_export_js_impact', { campaign_id: 123, page: 1 })).rejects.toThrow('additional properties');
});

test('invalid JS Impact selections fail at the public boundary', async () => {
  const invalidInputs: Query[] = [{ parameters: ['title'] }, { status: 'unchanged', parameters: ['title'] }, { status: 'changed', parameters: ['unknown'] }, { status: 'changed', parameters: ['title', 'title'] }, { page: -1 }, { limit: 0 }, { sort: 'url_desc' }];
  for (const invalid of invalidInputs) {
    await expect(preview('audit_js_impact_pages', { campaign_id: 123, ...invalid })).rejects.toThrow();
  }
});

test('My Reports lifecycle uses fixed native template, document and generation requests', async () => {
  const parameters = { domain: 'example.com', database: 'us' };
  expect(await preview('reporting_create', { template: 'tc_organic_search_positions', parameters, dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/template/system/tc_organic_search_positions/create-document', body: { parameters } });
  expect(await preview('reporting_get', { report_id: 71 })).toEqual({ method: 'GET', path: '/my_reports/api/v1/document/71', body: {} });
  const document = { ...reportingRead, areSettingsTouched: true };
  expect(await preview('reporting_save', { document, timezone: 5.5, dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/document/71', body: { document: reportingNative.save, timezone: 5.5, commonPrivacyAccepted: true } });
  expect(await preview('reporting_clone', { report_id: 71, name: 'Copied report', dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/document/71/clone', body: { documentName: 'Copied report' } });
  expect((await preview('reporting_generate', { report_id: 71, dry_run: true })).body).toEqual({ operationName: 'GenerateReport', query: 'mutation GenerateReport($reportId: Int!) { generateReport(reportId: $reportId) { id state } }', variables: { reportId: 71 } });
  const generated = await Effect.runPromise(parseReport('reporting_generate', { report_id: 71, dry_run: true }));
  expect(previewMutation(generated.name, generated.definition, generated.query)).toHaveProperty('preparation', [{ action: 'read_report', report_id: 71 }, { action: 'save_current_document', commonPrivacyAccepted: true, timezone: 0 }]);
  expect((await preview('reporting_delete', { report_ids: [71, 72], dry_run: true })).body).toEqual({ operationName: 'DeleteReports', query: 'mutation DeleteReports($reportIds: [Int!]!) { deleteReports(reportIds: $reportIds) }', variables: { reportIds: [71, 72] } });
  expect((await preview('reporting_tasks', { report_id: 71 })).body).not.toHaveProperty('query', expect.stringContaining('pdfPath'));
  expect((await preview('reporting_download', { report_id: 71, task_id: '1001' })).body).toHaveProperty('query', expect.stringContaining('pdfPath'));
});

test('My Reports rejects invalid identities, empty documents, injected paths and unconfirmed writes before authentication', async () => {
  const invalid: [string, Query][] = [
    ['reporting_delete', { report_ids: [], confirm: true }], ['reporting_delete', { report_ids: [71, 71], confirm: true }],
    ['reporting_delete', { report_ids: [2147483648], confirm: true }],
    ['reporting_get', { report_id: 0 }], ['reporting_get', { report_id: 2147483648 }],
    ['reporting_create', { template: '../outside', parameters: {}, confirm: true }],
    ['reporting_create', { template: 'valid\n', parameters: {}, confirm: true }],
    ['reporting_save', { document: { ...reportingRead, content: [] }, confirm: true }],
    ['reporting_save', { document: { ...reportingRead, id: '71' }, confirm: true }],
    ['reporting_save', { document: { id: 71, content: [{}] }, confirm: true }],
    ['reporting_save', { document: { ...reportingRead, content: [{ widgetType: 'vsplit', publicId: 'nested', isSetup: true, isEditable: true, ownerId: null, settings: {}, content: [{ widgetType: 'header' }] }] }, confirm: true }],
    ['reporting_download', { report_id: 71, task_id: '1001\n' }],
    ['reporting_download', { report_id: 71, task_id: '1001', url: 'https://example.com' }],
  ];
  for (const [name, query] of invalid) await expect(Effect.runPromise(parseReport(name, query))).rejects.toThrow('Invalid reporting_');
  await expect(Effect.runPromise(parseReport('reporting_generate', { report_id: 71 }))).rejects.toThrow('Use --confirm');
  await expect(Effect.runPromise(parseReport('reporting_delete', { report_ids: [71] }))).rejects.toThrow('Use --confirm');
});


test('My Reports save preserves explicit delivery, schedule and nested widget settings without stored metadata', async () => {
  const document = structuredClone(reportingRead);
  document.isScheduled = true; document.schedulePeriod = 'monthly';
  Object.assign(document, { scheduleDayOfPeriod: 15, generationStartHour: 8.5, recipients: 'first@example.invalid,second@example.invalid',
    titlePageTexts: { title: 'Custom title', subtitle: 'Custom subtitle', extra: { preserve: true } },
    publicDashboard: { url: 'https://example.invalid/native-dashboard', readOnlyMetadata: true } });
  Object.assign(document.emailing, { mailSubject: 'Monthly SEO', mailMessageText: 'Attached report', senderName: 'Sender', emailToReplyTo: 'reply@example.invalid', signText: 'Thanks' });
  const settings = { preserve: { exactId: '9223372036854775807' }, layout: { x: '0', y: '2', w: '4', h: '1' } };
  const leaf = { widgetType: 'header', publicId: 'leaf', isSetup: true, isEditable: true, ownerId: null, settings, content: [], isDeprecated: false };
  const container = { widgetType: 'vsplit', publicId: 'columns', isSetup: true, isEditable: true, ownerId: null, settings: { columns: '2' }, content: [leaf] };
  const input = { ...document, content: [container] };
  const request = await preview('reporting_save', { document: input, dry_run: true });
  expect(request.body).toMatchObject({ document: { isScheduled: true, reportPeriod: 'monthly', reportValue: 15, generationStartHour: 8.5,
    titlePageTexts: { title: 'Custom title', subtitle: 'Custom subtitle', extra: { preserve: true } }, publicDashboard: {},
    emailing: { isEnabled: true, emails: ['first@example.invalid', 'second@example.invalid'], subject: 'Monthly SEO', message: 'Attached report', senderName: 'Sender', emailToReplyTo: 'reply@example.invalid', signText: 'Thanks' },
    content: [{ content: [{ settings }] }] } });
  expect(request.body).not.toHaveProperty('document.createdAt'); expect(request.body).not.toHaveProperty('document.ownerId');
  expect(request.body).not.toHaveProperty('document.content.0.content.0.isDeprecated');
  expect(input.content[0]?.content[0]?.isDeprecated).toBe(false);
});


test('Keyword Overview PDF previews preserve the selected context, disable delivery and expose no template key', async () => {
  await expect(preview('keyword_overview_pdf', { keyword: 'typescript' })).rejects.toThrow('--confirm');
  const input = { keyword: 'café', database: 'es', device: 'mobile', date: '202609', currency: 'EUR', dry_run: true };
  const parsed = await Effect.runPromise(parseReport('keyword_overview_pdf', input));
  const plan = previewMutation(parsed.name, parsed.definition, parsed.query);
  expect(plan).toMatchObject({ retains_report: true, preparation: [{ action: 'create_essential_report' }, { action: 'generate_pdf' }, { action: 'download_ready_task' }], request: {
    method: 'POST', path: '/my_reports/graphql/', body: { operationName: 'CreateLiteOrder', variables: { templateType: 'keyword_overview', input: {
      commonPrivacyAccepted: true, emailing: { recipients: [] }, scheduling: { isScheduled: false },
      templateParameters: { action: 'report', phrase: 'café', db: 'es', db_date: '202609', device_type: 'Mobile', currency: 'eur' }, state: 'essential',
    } } },
  } });
  expect(JSON.stringify(plan)).not.toContain('"key"');
  await expect(preview('keyword_overview_pdf', { ...input, recipients: ['outside@example.invalid'] })).rejects.toThrow('additional properties');
});

test('project sharing plans preserve native array bodies, explicit roles and opaque share IDs', async () => {
  expect(await preview('project_shares', { folder_id: '9223372036854775807' })).toEqual({ method: 'GET', path: '/share/json/shares/project-smb/9223372036854775807', body: {} });
  expect(await preview('project_share', { folder_id: '9223372036854775807', emails: ['first@example.com', 'second@example.com'], role: 'viewer', dry_run: true })).toEqual({ method: 'POST', path: '/share/json/share/project-smb', body: [
    { email: 'first@example.com', object_id: '9223372036854775807', role: 'viewer' },
    { email: 'second@example.com', object_id: '9223372036854775807', role: 'viewer' },
  ] });
  const share_ids = ['0123456789abcdef01234567'];
  expect(await preview('project_share_set_role', { share_ids, role: 'editor', dry_run: true })).toEqual({ method: 'POST', path: '/share/json/set-role/editor', body: share_ids });
  expect(await preview('project_share_revoke', { share_ids, dry_run: true })).toEqual({ method: 'POST', path: '/share/json/stop-sharing', body: share_ids });
  const invalidInputs: Query[] = [
    { folder_id: '123', emails: ['first@example.com'] },
    { folder_id: '123', emails: ['not-an-email'], role: 'viewer' },
    { folder_id: '123', emails: ['first@example.com\n'], role: 'viewer' },
    { folder_id: '123', emails: ['first@example.com', 'first@example.com'], role: 'viewer' },
  ];
  for (const input of invalidInputs) await expect(preview('project_share', { ...input, dry_run: true })).rejects.toThrow();
  await expect(preview('project_share_revoke', { share_ids: ['123'], dry_run: true })).rejects.toThrow();
});

test('My Reports sharing uses report resources and string IDs in the native grant array', async () => {
  expect(await preview('reporting_shares', { report_id: 71 })).toEqual({ method: 'GET', path: '/share/json/shares/report/71', body: {} });
  expect(await preview('reporting_share', { report_id: 71, emails: ['recipient@example.com'], role: 'viewer', dry_run: true })).toEqual({ method: 'POST', path: '/share/json/share/report', body: [{ email: 'recipient@example.com', object_id: '71', role: 'viewer' }] });
  const share_ids = ['0123456789abcdef01234568'];
  expect(await preview('reporting_share_set_role', { share_ids, role: 'editor', dry_run: true })).toEqual({ method: 'POST', path: '/share/json/set-role/editor', body: share_ids });
  expect(await preview('reporting_share_revoke', { share_ids, dry_run: true })).toEqual({ method: 'POST', path: '/share/json/stop-sharing', body: share_ids });
  await expect(preview('reporting_share', { folder_id: '71', emails: ['recipient@example.com'], role: 'viewer', dry_run: true })).rejects.toThrow();
  await expect(preview('reporting_share', { report_id: 2147483648, emails: ['recipient@example.com'], role: 'viewer', dry_run: true })).rejects.toThrow();
});

test('custom report templates use distinct template and report IDs with native payloads', async () => {
  expect(await preview('reporting_templates', { page: 2, search: 'a & b?' })).toEqual({ method: 'GET', path: '/my_reports/api/v1/templates/', body: { currentPage: 2, limit: 30, searchQuery: 'a & b?', timezone: 0 } });
  expect(await preview('reporting_template_create', { report_id: 71, name: 'Reusable report', dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/template/71', body: { templateName: 'Reusable report', userDocumentId: '71' } });
  expect(await preview('reporting_template_report', { template_id: 501, name: 'New report', dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/template/501/document', body: { documentName: 'New report' } });
  expect(await preview('reporting_template_delete', { template_id: 501, dry_run: true })).toEqual({ method: 'DELETE', path: '/my_reports/api/v1/template/501', body: null });
  expect(await preview('reporting_template_restore', { template_id: 501, dry_run: true })).toEqual({ method: 'POST', path: '/my_reports/api/v1/template/501/restore', body: null });
  for (const [name, method] of [['reporting_template_share', 'POST'], ['reporting_template_share_revoke', 'DELETE']] as const) {
    expect(await preview(name, { template_id: 501, emails: ['person@example.com'], dry_run: true })).toEqual({ method, path: '/my_reports/api/v1/template/501/share', body: { emails: ['person@example.com'] } });
  }
  await expect(preview('reporting_template_create', { template_id: 501, name: 'Wrong ID type', dry_run: true })).rejects.toThrow();
  await expect(preview('reporting_template_report', { template_id: 2147483648, name: 'Overflow', dry_run: true })).rejects.toThrow();
  await expect(preview('reporting_templates', { page: 0 })).rejects.toThrow();
  await expect(preview('reporting_template_share', { template_id: 501, emails: ['person@example.com'], role: 'viewer', dry_run: true })).rejects.toThrow();
});


test('Core Web Vitals PDF requires confirmation and previews its campaign read and native template without credentials', async () => {
  await expect(preview('audit_web_vitals_pdf', { campaign_id: 794 })).rejects.toThrow('--confirm');
  const parsed = await Effect.runPromise(parseReport('audit_web_vitals_pdf', { campaign_id: 794, dry_run: true }));
  expect(previewMutation(parsed.name, parsed.definition, parsed.query)).toHaveProperty('preparation.0.request', { method: 'GET', path: '/siteaudit/api/campaigns/794/info', body: {} });
  expect(previewMutation(parsed.name, parsed.definition, parsed.query)).toMatchObject({ retains_report: true,
    preparation: [{ action: 'read_campaign', request: { method: 'GET', path: '/siteaudit/api/campaigns/794/info', body: {} } }, { action: 'create_essential_report' }, { action: 'generate_pdf' }, { action: 'download_ready_task' }],
    request: { method: 'POST', path: '/my_reports/graphql/', body: { operationName: 'CreateLiteOrder', variables: {
      templateType: 'tc_siteaudit_core_web_vitals', input: { emailing: { recipients: [] }, scheduling: { isScheduled: false },
        templateParameters: { project_id: 794, domain: '<audit-info.projectDomain>', language: 'en',
          SiteAuditDatasource: [{ name: 'project', group: 'FIELD', state: { value: '794', title: '<audit-info.projectDomain>' } }] },
      },
    } } },
  });
  const invalidInputs: Query[] = [{ campaign_id: 0 }, { campaign_id: '794' }, { campaign_id: 794, recipients: [] }, { campaign_id: 794, domain: 'unrelated.example' }];
  for (const invalid of invalidInputs) {
    await expect(preview('audit_web_vitals_pdf', { ...invalid, dry_run: true })).rejects.toThrow('Invalid audit_web_vitals_pdf');
  }
});


test('native PDF previews include AI summary settings only with explicit opt-in', async () => {
  for (const name of ['keyword_overview_pdf', 'audit_web_vitals_pdf']) {
    const selection: Query = name === 'keyword_overview_pdf' ? { keyword: 'typescript' } : { campaign_id: 794 };
    const disabled = await preview(name, { ...selection, dry_run: true });
    expect(disabled.body).toHaveProperty('variables.input.aiSummaryWidget', null);
    const enabled = await preview(name, { ...selection, ai_summary: true, dry_run: true });
    expect(enabled.body).toHaveProperty('variables.input.aiSummaryWidget', { settings: { x: 0, y: 0, w: 12, h: 14, minH: 14, maxH: 14, minW: 12, maxW: 12 } });
    await expect(preview(name, { ...selection, ai_summary: 'yes', dry_run: true })).rejects.toThrow('Invalid');
  }
});
