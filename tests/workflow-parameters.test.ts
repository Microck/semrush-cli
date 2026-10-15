import { Effect } from 'effect';
import { expect, test } from 'vitest';
import { parseReport } from '../src/validation.js';
import type { Query } from '../src/report-parameters.js';
import { webRequest } from '../src/report-parameters.js';

// Request contracts from the current Site Audit components and Position Tracking wizard.
// See docs/contract.md; the live probe uses the same bounded public-domain fixture.
const preview = async (name: string, input: Query) => {
  const parsed = await Effect.runPromise(parseReport(name, input));
  return webRequest(parsed.definition, parsed.query);
};

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
