import { Effect, Schema } from 'effect';
import { expect, test } from 'vitest';
import cases from './reference-cases.json' with { type: 'json' };
import { isReportName, parseReport } from '../src/validation.js';
import { reportParameters, reports, webRequest, type Query } from '../src/report-parameters.js';
for (const sample of cases) {
  test(`matches Python reference: ${sample.name}`, () => {
    if (!isReportName(sample.name)) throw new Error('Unknown reference report');
    expect(reportParameters(reports[sample.name], Schema.decodeUnknownSync(Schema.JsonObject)(sample.query))).toEqual(sample.params);
  });
}


// Exact JSON shapes observed in the current project-selector and Crossroad clients.
const folderRoot = '/apis/v4-raw/folders/api/v0/folders';
const crossroadRoot = '/apis/v4-raw/crossroad/api/v0/crossroad';
const projectCases: { name: string; input: Query; method: string; path: string; body: Query }[] = [
  { name: 'project_create', input: { name: 'example', domain: 'example.com', confirm: true }, method: 'POST', path: folderRoot, body: { properties: [{ name: { value: 'example' } }, { domain: { value: 'example.com' } }] } },
  { name: 'project_get', input: { folder_id: '123' }, method: 'GET', path: folderRoot + '/folder', body: { folder_id: '123' } },
  { name: 'project_update', input: { folder_id: '123', name: 'renamed', confirm: true }, method: 'PUT', path: folderRoot + '/123', body: { properties: [{ name: { value: 'renamed' } }] } },
  { name: 'project_delete', input: { folder_id: '123', confirm: true }, method: 'DELETE', path: folderRoot + '/123', body: {} },
  { name: 'project_leave', input: { folder_id: '123', confirm: true }, method: 'POST', path: '/share/json/leave/project-smb', body: { object_ids: ['123'] } },
  { name: 'project_limits', input: {}, method: 'GET', path: folderRoot + '/limits', body: {} },
  { name: 'project_tags', input: {}, method: 'GET', path: folderRoot + '/tags', body: {} },
  { name: 'project_set_tags', input: { folder_id: '123', tags: [], confirm: true }, method: 'POST', path: folderRoot + '/tags/123', body: { tags: [] } },
  { name: 'project_check_domain', input: { domain: 'example.com' }, method: 'GET', path: folderRoot + '/check-domain', body: { domain: 'example.com' } },
  { name: 'project_pin', input: { folder_id: '123', pinned: false, confirm: true }, method: 'POST', path: crossroadRoot + '/set-pinned', body: { id: '123', is_pinned: false } },
  { name: 'project_toolkits', input: { folder_ids: ['123'] }, method: 'POST', path: crossroadRoot + '/toolkits', body: { folders: ['123'], withPromo: false } },
  { name: 'project_tools', input: { folder_id: '123', tools: [23,31] }, method: 'POST', path: crossroadRoot + '/tools', body: { items: [{ folder_id: '123', tool: 23 }, { folder_id: '123', tool: 31 }] } },
  { name: 'project_enable_seo', input: { folder_id: '123', confirm: true }, method: 'POST', path: '/projects/api/projects', body: { folder_id: '123' } },
  { name: 'project_seo_auto_setup', input: { folder_id: '123', confirm: true }, method: 'POST', path: '/projects/api/projects/seo_auto_setup', body: { folder_id: '123' } },
];
for (const sample of projectCases) {
  test(`matches current web project contract: ${sample.name}`, async () => {
    const parsed = await Effect.runPromise(parseReport(sample.name, sample.input));
    expect(webRequest(parsed.definition, parsed.query)).toEqual({ method: sample.method, path: sample.path, body: sample.body });
  });
}


const listTarget = { basket_id: 456, owner_id: 123 };
const keywordIds = [{ Phrase: 'fixture', Database: 'us' }];
const sharedList = { BasketID: 456, OwnerID: 123 };
const keywordFilter = { ClusterIDs: [], Databases: [], Phrase: [], CompetitionLevel: [], Cpc: [], Difficulty: [], SERPFeatures: [], Volume: [], ClickPotential: [], Tags: [], Intents: [] };
const keywordListCases: { name: string; input: Query; params: Query }[] = [
  { name: 'keyword_strategy_create', input: { name: 'strategy', domain: 'example.com', confirm: true }, params: { Name: 'strategy', Clusterization: { Databases: ['us'], Domain: 'example.com', Competitors: [], SeedPhrases: [] } } },
  { name: 'keyword_list_limits', input: {}, params: {} },
  { name: 'keyword_lists', input: {}, params: { Order: { Direction: 1, Field: 'updated_at' }, Page: { Number: 1, Size: 100 }, Filter: { Name: '', OwningType: 7 } } },
  { name: 'keyword_list_create', input: { name: 'fixture', confirm: true }, params: { Name: 'fixture', Clusterization: null } },
  { name: 'keyword_list_get', input: listTarget, params: sharedList },
  { name: 'keyword_list_rename', input: { ...listTarget, name: 'renamed', confirm: true }, params: { ...sharedList, Name: 'renamed' } },
  { name: 'keyword_list_delete', input: { basket_id: 456, confirm: true }, params: { BasketIDs: [456] } },
  { name: 'keyword_list_keywords', input: listTarget, params: { ...sharedList, Filter: keywordFilter, Order: { Direction: 1, Field: 'phrase' }, Page: { Number: 1, Size: 100 } } },
  { name: 'keyword_list_summary', input: listTarget, params: { ...sharedList, Filter: keywordFilter } },
  { name: 'keyword_list_import', input: { ...listTarget, keywords: ['fixture'], confirm: true }, params: { ...sharedList, Keywords: [{ Phrase: 'fixture', Database: 'us', Tags: [] }] } },
  { name: 'keyword_list_delete_keywords', input: { ...listTarget, keywords: ['fixture'], confirm: true }, params: { ...sharedList, KeywordIDs: keywordIds } },
  { name: 'keyword_list_undo_delete', input: { undo_id: 'fixture-undo', confirm: true }, params: { UndoID: 'fixture-undo' } },
  { name: 'keyword_list_update_metrics', input: { ...listTarget, keywords: ['fixture'], confirm: true }, params: { ...sharedList, KeywordIDs: keywordIds } },
  { name: 'keyword_list_tags', input: listTarget, params: sharedList },
  { name: 'keyword_list_add_tags', input: { ...listTarget, keywords: ['fixture'], tags: ['test'], confirm: true }, params: { ...sharedList, KeywordIDs: keywordIds, Tags: ['test'] } },
  { name: 'keyword_list_remove_tags', input: { ...listTarget, keywords: ['fixture'], tags: ['test'], confirm: true }, params: { ...sharedList, KeywordIDs: keywordIds, Tags: ['test'] } },
  { name: 'keyword_list_cluster', input: { ...listTarget, confirm: true }, params: sharedList },
  { name: 'keyword_list_cluster_forecast', input: listTarget, params: sharedList },
  { name: 'keyword_list_cluster_status', input: listTarget, params: { BasketIDs: [sharedList] } },
];
for (const sample of keywordListCases) {
  test(`matches current Keyword Strategy Builder contract: ${sample.name}`, async () => {
    const parsed = await Effect.runPromise(parseReport(sample.name, sample.input));
    expect(reportParameters(parsed.definition, parsed.query)).toEqual(sample.params);
    expect(webRequest(parsed.definition, parsed.query)).toEqual({ method: 'POST', path: '/kwm/rpc', body: { id: 1, jsonrpc: '2.0', method: parsed.definition.method, params: sample.params } });
  });
}

const auditCases: { name: string; input: Query; path: string; body: Query | null }[] = [
  { name: 'audit_limits', input: {}, path: '/siteaudit/api/limits', body: {} },
  { name: 'audit_info', input: { campaign_id: 789 }, path: '/siteaudit/api/campaigns/789/info', body: {} },
  { name: 'audit_status', input: { campaign_id: 789 }, path: '/siteaudit/api/campaigns/status/789', body: {} },
  { name: 'audit_snapshots', input: { campaign_id: 789 }, path: '/siteaudit/api/campaigns/789/snapshots', body: {} },
  { name: 'audit_snapshot', input: { campaign_id: 789, snapshot_id: '12' }, path: '/siteaudit/api/campaigns/789/snapshot', body: { snapshot_id: '12' } },
  { name: 'audit_start', input: { campaign_id: 789, confirm: true }, path: '/siteaudit/api/campaigns/789/launch', body: null },
];
for (const sample of auditCases) test(`matches Site Audit web contract: ${sample.name}`, async () => {
  const parsed = await Effect.runPromise(parseReport(sample.name, sample.input));
  expect(webRequest(parsed.definition, parsed.query)).toEqual({ method: sample.name === 'audit_start' ? 'POST' : 'GET', path: sample.path, body: sample.body });
});
test('Site Audit configuration uses manual, notification-free defaults and normalized paths', async () => {
  const parsed = await Effect.runPromise(parseReport('audit_configure', { campaign_id: 789, name: 'Fixture', domain: 'example.com', page_limit: 10, allow: ['blog'], dry_run: true }));
  const planned = webRequest(parsed.definition, parsed.query);
  expect(planned).toMatchObject({ method: 'POST', path: '/siteaudit/api/campaigns/789/save', body: { scheduleDay: 0, notify: false, pageLimit: 10, allow: ['/blog'], withSubfolder: true, domain: 'example.com', rootDomain: 'example.com' } });
  expect(planned.body).not.toHaveProperty('campaign_id');
  expect(planned.body).not.toHaveProperty('dry_run');
});

test('Site Audit creation and replacement share the source save contract', async () => {
  const input = { campaign_id: 789, name: 'Fixture', domain: 'example.com', page_limit: 10, dry_run: true };
  const created = await Effect.runPromise(parseReport('audit_create', input));
  const configured = await Effect.runPromise(parseReport('audit_configure', input));
  expect(webRequest(created.definition, created.query)).toEqual(webRequest(configured.definition, configured.query));
});
