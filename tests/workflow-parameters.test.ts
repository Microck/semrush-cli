import { Effect, Schema } from 'effect';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { parseReport } from '../src/validation.js';
import type { Query } from '../src/report-parameters.js';
import { webRequest, previewMutation } from '../src/report-parameters.js';

// Request contracts from the current Site Audit components and Position Tracking wizard.
// See docs/contract.md; the live probe uses the same bounded public-domain fixture.
const preview = async (name: string, input: Query) => {
  const parsed = await Effect.runPromise(parseReport(name, input));
  return webRequest(parsed.definition, parsed.query);
};

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
  expect(await preview('position_delete', { ...selected, dry_run: true })).toEqual({ method: 'DELETE', path: '/positions/api/targets/123_456', body: {} });
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
