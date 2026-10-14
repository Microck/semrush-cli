import { Effect, Schema } from 'effect';
import { expect, test } from 'vitest';
import cases from './reference-cases.json' with { type: 'json' };
import { isReportName, parseReport } from '../src/validation.js';
import { reportParameters, reports, projectRequest, type Query } from '../src/report-parameters.js';
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
    expect(projectRequest(parsed.definition, parsed.query)).toEqual({ method: sample.method, path: sample.path, body: sample.body });
  });
}
