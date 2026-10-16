import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';

export const archivePaths = [
  '/siteaudit/api/campaigns/790/', '/siteaudit/export/pages/archive_latest',
  '/siteaudit/export/campaigns/790', '/siteaudit/export/pagesStructuredData/archive_latest',
  '/siteaudit/export/snapshot/archive_latest', '/siteaudit/export/snapshot/archive_latest/',
  '/siteaudit/export/js-impact/790',
];
type Scenario = 'complete' | 'single' | 'single-js' | 'failed' | 'changed' | 'delayed' | 'empty' | 'malformed';
const names = ['audit_export_pages', 'audit_export_page_issues', 'audit_export_markup', 'audit_export_issues', 'audit_export_compare', 'audit_export_js_impact'];

/** Real native-shaped metadata and file endpoints with controlled provider failure and crawl changes. */
export function makeAuditArchiveFixture() {
  let scenario: Scenario = 'complete';
  let infoReads = 0;
  const downloads: string[] = [];
  let started = () => {};
  let closed = () => {};
  let ready = Promise.resolve();
  let disconnected = Promise.resolve();
  const bytes = (name: string) => Buffer.from('report,url,value\r\n' + name + ',https://example.com/café,1\r\n');
  return {
    bytes,
    downloads,
    use(value: Scenario) {
      scenario = value; infoReads = 0; downloads.length = 0;
      ready = new Promise<void>(resolve => { started = resolve; });
      disconnected = new Promise<void>(resolve => { closed = resolve; });
    },
    ready: () => ready,
    disconnected: () => disconnected,
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(request.method).toBe('GET'); expect(request.headers.cookie).toContain('session=authorized');
      expect(url.searchParams.get('key')).toBe('fixture-secret');
      response.setHeader('Content-Type', 'application/json');
      if (url.pathname.endsWith('/info')) {
        infoReads++;
        const snapshot_id = scenario === 'changed' && infoReads > 1 ? 'archive_newer' : 'archive_latest';
        response.end(JSON.stringify({ current_snapshot: scenario === 'empty' ? null : { snapshot_id: scenario === 'malformed' ? '../invalid' : snapshot_id, finish_date: 2000 }, jsImpactReportDataAvailable: !['single', 'empty'].includes(scenario) })); return;
      }
      if (url.pathname.endsWith('/snapshots')) {
        const snapshots = [{ snapshot_id: 'archive_latest', finish_date: 2000 }];
        snapshots.push({ snapshot_id: 'archive_unfinished', finish_date: 0 });
        if (!['single', 'single-js'].includes(scenario)) snapshots.push({ snapshot_id: 'archive_previous', finish_date: 1000 });
        response.end(JSON.stringify({ snapshots })); return;
      }
      const index = archivePaths.slice(1).findIndex(path => url.pathname === path || path.endsWith('/') && url.pathname.startsWith(path));
      const name = names[index];
      if (!name) throw new Error('Unexpected archive fixture endpoint');
      downloads.push(name);
      expect(url.searchParams.get('export')).toBe('csv');
      if (index < 3) {
        expect(url.searchParams.get('relative')).toBe('true'); expect(url.searchParams.get('sort')).toBe('url_desc'); expect(url.searchParams.get('filter')).toBe('café');
      } else if (index === 5) {
        expect(url.searchParams.get('page')).toBe('0'); expect(url.searchParams.get('limit')).toBe('100000'); expect(url.searchParams.get('sort')).toBe('DESC');
        expect(url.searchParams.has('changed')).toBe(false);
      } else expect([...url.searchParams.keys()].sort()).toEqual(['export', 'key']);
      if (index === 4) expect(url.pathname).toBe('/siteaudit/export/snapshot/archive_latest/compare/archive_previous');
      if (index === 1 && scenario === 'failed') { response.writeHead(403); response.end('{"error":"Export denied"}'); return; }
      if (index === 1 && scenario === 'delayed') { response.once('close', () => closed()); started(); return; }
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename=' + name + '.csv');
      response.end(bytes(name));
    },
  };
}
