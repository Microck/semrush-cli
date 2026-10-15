import { Effect } from 'effect';
import { expect, test } from 'vitest';
import { parseReport } from '../src/validation.js';
import { webRequest } from '../src/report-parameters.js';

// Request contracts from the current Site Audit components and Position Tracking wizard.
// See docs/contract.md; the live probe uses the same bounded public-domain fixture.
const preview = async (name: string, input: Record<string, string | number | boolean | string[]>) => {
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
