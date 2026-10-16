import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { expect } from 'vitest';
import { Schema } from 'effect';
import type { Query } from '../src/report-parameters.js';

/** Stateful native RPC server. The real Chromium client must supply header-only auth. */
export function makeBacklinkAuditFixture() {
  let settings: Query | undefined;
  const calls: { method: string; params: Query }[] = [];
  let disavow: Query[] = [];
  let nextCommentId = 321;
  const comments = new Map<number, { id: number; domain: string; comment: string; createdAt: string }>();
  const labels = new Map<string, Set<string>>();
  const networkId = 19387720322;
  const backlink = { id: '00000000-0000-0000-0000-000000000001', urlHash: '9007199254740993', source: 'example.net', sourceUrl: 'https://example.net/link', linkType: 'a', linkNetworks: [{ linkNetworkId: networkId, type: 'path', value: '/links', count: 1, orderNumber: 1 }], list: 'for-review' };
  const state = { csvJobs: 0, csvPolls: 0, csvDenied: false, reruns: 0, incImportAvailable: true, lockedSettings: false, lockedAudit: false, rejectTagChanges: false, processing: false, foreignEndpoint: false, omitDisposition: false, exports: 0 };
  const reset = () => { state.csvJobs = 0; state.csvPolls = 0; state.csvDenied = false; comments.clear(); labels.clear(); nextCommentId = 321; state.reruns = 0; state.incImportAvailable = true; state.lockedSettings = false; state.lockedAudit = false; state.rejectTagChanges = false; backlink.list = 'for-review'; settings = undefined; disavow = []; state.processing = false; state.foreignEndpoint = false; state.omitDisposition = false; state.exports = 0; calls.length = 0; };
  const metadata = () => {
    const stored = settings ? { ...settings } : null;
    // Native info omits false recurring flags; creation echoes the supplied settings.
    if (stored?.recrawlNotify === false) delete stored.recrawlNotify;
    if (stored?.recrawlMajestic === false) delete stored.recrawlMajestic;
    if (stored && Array.isArray(stored.brands) && stored.brands.length === 0) delete stored.brands;
    return { projectId: 789, userDomainId: 456, domain: 'example.com', scope: 'root', statusId: state.processing ? 2 : 1, isLocked: state.lockedAudit, isLockedSettings: state.lockedSettings, params: stored };
  };
  const overviewMethods = new Set([
    'overview.GetLinksStatsEx', 'overview.GetDomainsStats', 'overview.GetAnchorTypesStats',
    'overview.GetRelStats', 'overview.GetRemovedStats', 'overview.GetHistoricalDomainStats',
    'overview.GetDomainAScoreTimechart', 'overview.GetDomainsTimechart', 'overview.GetLinksTimechart',
    'overview.GetLostFoundTimechart', 'overview.GetDomainAScoreDistribution', 'overview.GetLinkTypeDistribution',
    'overview.GetAnchorDistributionNew', 'overview.TopRefDomains',
  ]);
  /** Native comment and label RPCs share campaign-scoped state. */
  const reviewMetadata = (method: string, params: Query): Schema.Json | undefined => {
    if (method.startsWith('disavow.')) {
      switch (method) {
        case 'disavow.Move':
          expect(params).toEqual({ userDomainId: 456, userListItemId: 100, list: 'for-review' });
          backlink.list = 'for-review';
          disavow = disavow.filter(entry => entry.id !== params.userListItemId);
          return null;
        case 'disavow.Delete':
          expect(params).toEqual({ userDomainId: 456, userListItemId: 101 });
          disavow = disavow.filter(entry => entry.id !== params.userListItemId);
          return null;
        case 'disavow.Clear':
          expect(params).toEqual({ userDomainId: 456, withManual: false, withFile: true, withGDT: false });
          disavow = disavow.filter(entry => entry.statusId !== 5);
          return null;
        case 'disavow.Get': return disavow;
        case 'disavow.Count': return disavow.length;
        case 'disavow.Counters': return { count: disavow.length, countWaiting: 0, countExported: 0, countDisavowed: disavow.length };
      }
    }
    if (!method.startsWith('comments.') && !method.startsWith('usertags.')) return undefined;
    expect(params.userDomainId).toBe(456);
    if (method === 'comments.GetByIds') {
      if (!Array.isArray(params.ids)) throw new Error('Missing native comment IDs');
      return params.ids.map(id => comments.get(Number(id))).filter(comment => comment !== undefined);
    }
    if (method === 'comments.Save') {
      const incoming = Schema.decodeUnknownSync(Schema.Struct({ domain: Schema.String, comment: Schema.String }))(params);
      const current = [...comments.values()].find(comment => comment.domain === incoming.domain);
      const id = current?.id ?? nextCommentId++;
      comments.set(id, { id, domain: incoming.domain, comment: incoming.comment, createdAt: '2026-10-16T00:00:00Z' });
      return id;
    }
    if (method === 'comments.Delete') return comments.delete(Number(params.id));
    if (method === 'usertags.Get') return [...labels.keys()].map(label => ({ label }));
    if (method === 'usertags.TargetPagesCounters') return Object.fromEntries([...labels].map(([label, urls]) => [label, urls.size]));
    if (method === 'usertags.Delete') {
      const { label } = Schema.decodeUnknownSync(Schema.Struct({ label: Schema.String }))(params);
      return state.rejectTagChanges ? false : labels.delete(label);
    }
    const { label, targetUrl } = Schema.decodeUnknownSync(Schema.Struct({ label: Schema.String, targetUrl: Schema.String }))(params);
    if (state.rejectTagChanges) return false;
    if (method === 'usertags.AddTargetUrlTag') {
      const urls = labels.get(label) ?? new Set<string>();
      if (urls.has(targetUrl)) return false;
      urls.add(targetUrl); labels.set(label, urls); return true;
    }
    if (method === 'usertags.RemoveTargetUrlTag') return labels.get(label)?.delete(targetUrl) ?? false;
    throw new Error('Unknown native annotation RPC');
  };
  const targetPages = (method: string, params: Query): Schema.Json => {
    expect(params.userDomainId).toBe(456);
    expect(params).toHaveProperty('targetUrlError'); expect(params).toHaveProperty('queryMode');
    if (!Array.isArray(params.userTags)) throw new Error('Missing native label filter');
    const selectedLabels = params.userTags;
    const urls = ['https://example.com/', 'https://example.com/docs'].filter(url => url.includes(String(params.query)) && selectedLabels.every(label => labels.get(String(label))?.has(url)));
    if (method === 'backlinks.CountTargetPagesCompound') { expect(params).not.toHaveProperty('page'); return urls.length; }
    expect(params.sort).toMatch(/^[+-](active|new|broken|lost|ga_users|ga_users_perc|ga_new_users|ga_new_users_perc)$/);
    const page = Number(params.page); const pageSize = Number(params.pageSize);
    return urls.slice(page * pageSize, (page + 1) * pageSize).map(url => ({ urls: [url], active: [params.collapse === 'd' ? 2 : 3], new: [0], broken: [0], lost: [0] }));
  };
  const serveFile = async (request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> => {
      if (url.pathname === '/backlink_audit/files/backlinks/download/456') {
        expect(request.method).toBe('GET'); expect(request.headers.authorization).toBe('fixture-secret');
        expect(url.searchParams.get('user_id')).toBe('123'); expect(url.searchParams.get('paid_type')).toBe('2');
        expect(url.searchParams.get('filename')).toBe('fixture-backlinks.csv');
        state.csvPolls++;
        if (state.csvDenied) { response.statusCode = 403; response.end('Denied'); return true; }
        if (state.csvPolls === 1) { response.statusCode = 202; response.end(); return true; }
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('\ufeffSource URL,Target URL\nhttps://example.net/link,https://example.com/\n'); return true;
      }
      if (url.pathname.startsWith('/backlink_audit/files/disavow/')) {
        expect(request.method).toBe('POST');
        expect(url.searchParams.get('user_id')).toBe('123');
        expect(url.searchParams.get('paid_type')).toBe('2');
        const contentType = request.headers['content-type'] ?? '';
        expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
        const form = await new Request('http://fixture.test' + url.pathname, { method: 'POST', headers: { 'Content-Type': contentType }, body: await readText(request) }).formData();
        expect(form.get('apiKey')).toBe('fixture-secret');
        if (url.pathname.includes('/upload/')) {
          expect([...form.keys()]).toEqual(['apiKey', 'disavow']);
          const file = form.get('disavow');
          if (!(file instanceof File)) throw new Error('Missing native disavow file part');
          expect(file.name).toBe('semrush-disavow.txt');
          const lines = (await file.text()).trim().split(/\r?\n/);
          disavow = lines.map((line, index) => ({ id: 101 + index, type: line.startsWith('domain:') ? 'domain' : 'url', text: line.replace(/^domain:/, ''), statusId: 5 }));
          response.end(); return true;
        }
        expect([...form.keys()]).toEqual(['apiKey']);
        state.exports++;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (!state.omitDisposition) response.setHeader('Content-Disposition', 'attachment; filename=disavow.txt');
        response.end(disavow.map(entry => (entry.type === 'domain' ? 'domain:' : '') + entry.text).join('\n') + '\n'); return true;
      }
    return false;
  };
  return {
    calls, state, reset,
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      if (await serveFile(request, response, url)) return;
      expect(request.method).toBe('POST');
      expect(request.headers.authorization).toBe('fixture-secret');
      expect(request.headers['content-type']).toBe('application/json');
      const rpc = JSON.parse(await readText(request));
      expect(url.searchParams.get('method')).toBe(rpc.method);
      expect(rpc.jsonrpc).toBe('2.0');
      expect(rpc.params).not.toHaveProperty('APIKey');
      expect(rpc.params).not.toHaveProperty('UserID');
      expect(rpc.params).not.toHaveProperty('confirm');
      expect(rpc.params).not.toHaveProperty('dry_run');
      calls.push({ method: rpc.method, params: rpc.params });
      response.setHeader('Content-Type', 'application/json');
      const reply = (result: Schema.Json) => response.end(JSON.stringify({ id: rpc.id, jsonrpc: '2.0', result }));
      const fail = (message: string) => response.end(JSON.stringify({ id: rpc.id, jsonrpc: '2.0', error: { code: 502, message } }));
      const annotationResult = reviewMetadata(rpc.method, rpc.params);
      if (annotationResult !== undefined) { reply(annotationResult); return; }
      switch (rpc.method) {
        case 'projects.Limits': reply({ used: settings ? 1 : 0, max: 15 }); return;
        case 'domains.GetAll': reply([{ projectId: 789, userDomainId: settings ? 456 : null }]); return;
        case 'domains.GetProject':
          expect(rpc.params).toEqual({ projectId: 789 });
          reply({ domain: 'example.com', defaultBrands: ['example'], defaultCategories: ['6'], defaultGeo: ['us'] }); return;
        case 'domains.GetScopes':
          expect(rpc.params).toEqual({ projectId: 789 });
          reply([{ scope: 'root', available: true, allowed: true, domains: ['example.com'], backlinks: 2 }, { scope: 'both', available: true, allowed: true, domains: ['example.com', 'www.example.com'], backlinks: 2 }, { scope: 'www', available: false, allowed: true, domains: ['www.example.com'], backlinks: 0 }]); return;
        case 'domains.AddByProjectId':
          expect(settings).toBeUndefined();
          expect(rpc.params.projectId).toBe(789);
          expect(rpc.params.scope).toBe('root');
          settings = rpc.params.params;
          expect(settings).toEqual({ brands: ['example'], categories: ['6'], geo: ['us'], recrawl: 'never', recrawlNotify: false, recrawlMajestic: false });
          reply({ ...metadata(), params: settings ?? null }); return;
        case 'domains.GetByProjectId':
          expect(rpc.params).toEqual({ projectId: 789 });
          if (!settings) { fail('Audit not configured'); return; }
          reply(metadata()); return;
        case 'domains.ApplySettings':
          expect(rpc.params.userDomainId).toBe(456);
          if (!settings) { fail('Audit not configured'); return; }
          if (rpc.params.params.brands?.includes('reject')) { fail('Provider rejected fixture-secret'); return; }
          Object.assign(settings, rpc.params.params);
          reply({ settingsResult: { type: 'brands' } }); return;
        case 'backlinks.StartBacklinksCSVExport':
          expect(rpc.params.userDomainId).toBe(456); expect(rpc.params.search).toHaveProperty('collapse');
          expect(rpc.params).not.toHaveProperty('page'); expect(rpc.params).not.toHaveProperty('pageSize');
          state.csvJobs++; reply({ filename: 'fixture-backlinks.csv' }); return;
        case 'domains.PushIncImport':
          expect(rpc.params).toEqual({ userDomainId: 456 });
          expect(state.processing).toBe(false);
          state.reruns++; state.processing = true; reply(true); return;
        case 'backlinks.GetTargetPagesCompound': case 'backlinks.CountTargetPagesCompound':
          reply(targetPages(rpc.method, rpc.params)); return;
        case 'backlinks.Get':
          expect(rpc.params.search).toHaveProperty('aScoreMin');
          expect(rpc.params.search).toHaveProperty('queryMode');
          reply(rpc.params.search.mode === 'all' || rpc.params.search.mode === backlink.list ? [{ ...backlink, userCommentId: [...comments.values()].find(comment => comment.domain === backlink.source)?.id ?? null }] : []); return;
        case 'backlinks.MoveDomains': case 'backlinks.MoveUrls': case 'backlinks.MoveLinkNetworks':
          expect(rpc.params).toEqual({ userDomainId: 456, ids: [rpc.method === 'backlinks.MoveLinkNetworks' ? networkId : backlink.id], list: expect.stringMatching(/^(for-review|whitelist|to-remove|disavow)$/) });
          backlink.list = rpc.params.list;
          if (backlink.list === 'disavow') disavow.push({ id: 100, type: 'domain', text: 'example.net', statusId: 1 });
          reply(null); return;
        case 'backlinks.Count': reply(2); return;
        case 'backlinks.GetCategoryList': reply([{ id: 6, count: 2 }]); return;
        case 'domains.GetEndpoints':
          expect(rpc.params).toEqual({ userDomainId: 456 });
          reply({ backlinksDownload: state.foreignEndpoint ? '//outside.invalid/download' : '/files/backlinks/download/456?user_id=123&paid_type=2', disavowDownload: state.foreignEndpoint ? '//outside.invalid/download' : '/files/disavow/download/456?user_id=123&paid_type=2', disavowUpload: '/files/disavow/upload/456?user_id=123&paid_type=2', disavowUploadFormField: 'disavow' }); return;
        case 'domains.GetStatus':
          expect(rpc.params).toEqual({ userDomainId: 456, background: false });
          reply({ domain: metadata(), isExportLimited: false, incImportAvailable: state.incImportAvailable }); return;
        case 'catalog.CategoriesFull': reply([{ id: 1, name: 'Technology' }]); return;
        case 'catalog.GeoList': reply([{ code: 'us', name: 'United States' }]); return;
        case 'domains.Recommendations':
          expect(rpc.params).toEqual({ userDomainId: 456 });
          reply([]); return;
        default:
          if (overviewMethods.has(rpc.method)) {
            expect(rpc.params.userDomainId).toBe(456);
            expect(rpc.params.search).toMatchObject({ targetUrlHash: null, targetUrlPath: null });
            reply({ count: 2, search: rpc.params.search }); return;
          }
          fail('Unknown RPC');
      }
    },
  };
}
