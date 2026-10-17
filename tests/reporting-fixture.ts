import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';
import type { Query } from '../src/report-parameters.js';
import reportingNative from './fixtures/reporting-document.json' with { type: 'json' };

type Scenario = 'complete' | 'empty' | 'partial' | 'errors' | 'missing' | 'malformed-errors' | 'denied';
const requestBody = Schema.Struct({ operationName: Schema.Literal('ReportingOverview'), query: Schema.String,
  variables: Schema.Struct({ offset: Schema.Number, where: Schema.Struct({
    ownedByMe: Schema.optionalKey(Schema.Boolean), isVirtualShare: Schema.optionalKey(Schema.Boolean),
    isBranded: Schema.optionalKey(Schema.Boolean), schedulePeriods: Schema.optionalKey(Schema.Array(Schema.String)),
    name: Schema.optionalKey(Schema.Struct({ method: Schema.Literal('Contains'), value: Schema.String })),
  }) }),
});

/** Native-shaped GraphQL HTTP responses, including partial data that must remain a failure. */
export function makeReportingFixture() {
  const lifecycle = makeReportingLifecycleFixture();
  let scenario: Scenario = 'complete';
  const reports = Array.from({ length: 38 }, (_, index) => ({ id: index + 1, name: `report ${index + 1}`,
    state: 'essential', createdAt: 1000, updatedAt: 2000 - index, availableActions: ['viewWidgets'], isBranded: index % 2 === 0,
    schedule: { isScheduled: true, dayOfPeriod: 1, period: ['daily', 'weekly', 'monthly'][Math.floor(index / 3) % 3] },
    readyTasks: index === 0 ? [{ id: 42, filename: 'report-1.pdf', state: 'ready', createdAt: 2000 }] : [] }));
  const account = {
    hasProduct: true, productTier: 'Tier2', isPaid: false, isCommonPrivacyAccepted: false,
    availableActions: ['createEssentialReport'], newReportProperties: { state: 'essential', availableActions: ['editWidgets'] },
    limits: { reports_essential: { isLimitReached: false, limit: 3, used: 0, need: 0 } },
    systemTemplates: [{ type: 'tc_siteaudit_new_overview', title: 'Site Audit: Overview', isPremium: false,
      new: false, tools: [], datasources: [], groups: ['seo'], hint: null }],
    reports: { totalCount: 38, nodes: reports.slice(0, 30) },
  };
  return {
    lifecycle,
    use(value: Scenario) { scenario = value; },
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(url.pathname).toBe('/my_reports/graphql/'); expect(url.search).toBe('');
      expect(request.method).toBe('POST'); expect(request.headers.cookie).toContain('session=authorized');
      expect(request.headers.authorization).toBeUndefined();
      const raw = JSON.parse(await readText(request));
      if (raw.operationName !== 'ReportingOverview') { await lifecycle.handle(request, response, url, raw); return; }
      expect(Object.keys(raw).sort()).toEqual(['operationName', 'query', 'variables']);
      const body = Schema.decodeUnknownSync(requestBody)(raw);
      expect(body.query).toMatch(/^query ReportingOverview\(/);
      expect(body.query).toContain('reports(limit: 30, sort: UpdatedAt, sortDescend: true, offset: $offset, where: $where)');
      expect(body.query).toContain('tasks(limit: 1, states: [ready])');
      expect(body.query).not.toContain('mutation');
      response.setHeader('Content-Type', 'application/json');
      if (scenario === 'denied') { response.writeHead(403); response.end(JSON.stringify({ error: 'reporting access denied' })); return; }
      if (scenario === 'missing') { response.end(JSON.stringify({ data: { me: null } })); return; }
      const errors = [{ message: 'reporting denied fixture-secret', extensions: { key: 'fixture-secret' } }];
      if (scenario === 'errors') { response.end(JSON.stringify({ errors })); return; }
      if (scenario === 'partial') { response.end(JSON.stringify({ data: { me: account }, errors })); return; }
      if (scenario === 'malformed-errors') { response.end(JSON.stringify({ data: { me: account }, errors: { message: 'invalid error shape' } })); return; }
      const { offset, where } = body.variables;
      const filtered = reports.filter((report, index) => {
        if (where.ownedByMe !== undefined && (index % 3 === 0) !== where.ownedByMe) return false;
        if (where.isVirtualShare !== undefined && (index % 3 === 2) !== where.isVirtualShare) return false;
        if (where.isBranded !== undefined && report.isBranded !== where.isBranded) return false;
        if (where.schedulePeriods && !where.schedulePeriods.includes(report.schedule.period ?? '')) return false;
        return !where.name || report.name.includes(where.name.value);
      });
      const selection = { ...account, reports: { totalCount: filtered.length, nodes: filtered.slice(offset, offset + 30) } };
      response.setHeader('Set-Cookie', 'reporting_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      response.end(JSON.stringify({ data: { me: scenario === 'empty' ? { ...account, reports: { totalCount: 0, nodes: [] } } : selection } }));
    },
  };
}

type LifecycleScenario = 'complete' | 'pending' | 'outside' | 'bad-pdf' | 'save-lost' | 'save-missing' | 'generate-lost' | 'create-missing' | 'clone-missing' | 'delete-false' | 'delete-lost' | 'pdf-metadata-denied' | 'pdf-metadata-missing' | 'pdf-metadata-wrong-id' | 'pdf-create-lost' | 'pdf-create-missing' | 'pdf-create-denied' | 'pdf-task-pending' | 'pdf-task-failed' | 'generate-missing' | 'denied';
export const reportingDocument = { ...reportingNative.read, content: Schema.decodeUnknownSync(Schema.Array(Schema.JsonObject))(reportingNative.read.content), marker: { preserve: true, exactId: '9223372036854775807' } };

/** A complete small PDF makes byte/resource assertions independent of the production downloader. */
function pdfBytes() {
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += 'xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(pdf + `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
export const reportingPDFBytes = pdfBytes();

/** Native HTTP state, committed lost replies and private PDF paths, without module mocks. */
export function makeReportingLifecycleFixture() {
  let scenario: LifecycleScenario = 'complete';
  let document: Query = structuredClone(reportingDocument);
  let nextId = 72;
  let liteOrder = false;
  let metadataReads = 0;
  let aiSummary = false;
  let taskReadListener: (() => void) | undefined;
  const counts = { creates: 0, clones: 0, saves: 0, generations: 0, downloads: 0, deletions: 0, taskReads: 0 };
  const reset = () => { scenario = 'complete'; document = structuredClone(reportingDocument); nextId = 72; liteOrder = false; metadataReads = 0; aiSummary = false; taskReadListener = undefined; Object.assign(counts, { creates: 0, clones: 0, saves: 0, generations: 0, downloads: 0, deletions: 0, taskReads: 0 }); };
  const send = (response: ServerResponse, body: Query) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
  const handle = async (request: IncomingMessage, response: ServerResponse, url: URL, body: Query) => {
    expect(request.headers.cookie).toContain('session=authorized');
    if (url.pathname === '/siteaudit/api/campaigns/794/info') {
      expect(request.method).toBe('GET'); expect([...url.searchParams.keys()]).toEqual(['key']); expect(url.searchParams.get('key')).toBe('fixture-secret'); metadataReads++;
      if (scenario === 'pdf-metadata-denied') { response.statusCode = 403; send(response, { error: 'campaign denied' }); return; }
      send(response, scenario === 'pdf-metadata-missing' ? { id: 794 } : { id: scenario === 'pdf-metadata-wrong-id' ? 795 : 794, projectDomain: 'example.com' }); return;
    }
    if (scenario === 'denied') { response.statusCode = 403; send(response, { error: 'reporting denied fixture-secret' }); return; }
    if (url.pathname.startsWith('/my_reports/reports/')) {
      expect(request.method).toBe('GET'); counts.downloads++;
      response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
      response.end(scenario === 'bad-pdf' ? Buffer.from('not a PDF') : reportingPDFBytes); return;
    }
    if (url.pathname === '/my_reports/graphql/') {
      expect(request.method).toBe('POST');
      expect(body.query).toEqual(expect.any(String));
      if (body.operationName === 'CreateLiteOrder') {
        expect(body.query).toContain('mutation CreateLiteOrder');
        const webVitals = metadataReads > 0;
        expect(body.variables).toEqual({ templateType: webVitals ? 'tc_siteaudit_core_web_vitals' : 'keyword_overview', input: {
          branding: null, emailing: { subject: '', message: '', recipients: [], signImageId: 0, signText: '' },
          scheduling: { isScheduled: false, period: 'monthly', dayOfPeriod: 28, generationStartHour: null },
          publicDashboard: null, aiSummaryWidget: aiSummary ? { settings: { x: 0, y: 0, w: 12, h: 14, minH: 14, maxH: 14, minW: 12, maxW: 12 } } : null, commonPrivacyAccepted: true, isTOCEnabled: false,
          templateParameters: webVitals ? { project_id: 794, domain: 'example.com', language: 'en', header_title: 'example.com',
            SiteAuditDatasource: [{ name: 'project', group: 'FIELD', state: { value: '794', title: 'example.com' } }],
            report: 'tc_siteaudit_core_web_vitals', type: 'tc_siteaudit_core_web_vitals', report_title: 'Site Audit: Core Web Vitals',
          } : { key: 'fixture-secret', action: 'report', phrase: 'typescript', db: 'us', db_date: 'current', device_type: 'Desktop', currency: 'usd' }, state: 'essential',
        } });
        counts.creates++; liteOrder = true;
        if (scenario === 'pdf-create-lost') { request.socket.destroy(); return; }
        if (scenario === 'pdf-create-denied') { response.statusCode = 403; send(response, { error: 'denied fixture-secret' }); return; }
        send(response, { data: { createLiteOrder: scenario === 'pdf-create-missing' ? { state: 'essential' } : { id: '71', name: 'Keyword Overview', state: 'essential' } } }); return;
      }
      if (body.operationName === 'DeleteReports') {
        expect(body.query).toContain('mutation DeleteReports'); expect(body.variables).toEqual({ reportIds: [72, 73] });
        counts.deletions++;
        if (scenario === 'delete-lost') { request.socket.destroy(); return; }
        send(response, { data: { deleteReports: scenario !== 'delete-false' } }); return;
      }
      expect(body.variables).toEqual({ reportId: 71 });
      if (body.operationName === 'GenerateReport') {
        expect(counts.saves > 0 || liteOrder).toBe(true); counts.generations++;
        expect(body.query).toContain('mutation GenerateReport'); expect(body.query).not.toContain('pdfPath');
        if (scenario === 'generate-lost') { request.socket.destroy(); return; }
        if (scenario === 'generate-missing') { send(response, { data: { generateReport: { state: 'pending' } } }); return; }
        send(response, { data: { generateReport: { id: '1001', state: scenario === 'pending' ? 'pending' : 'ready' } } }); return;
      }
      expect(body.operationName).toBe('ReportingTasks'); expect(body.query).toContain('tasks(limit: 30)'); counts.taskReads++;
      const listener = taskReadListener; taskReadListener = undefined; listener?.();
      const task: Query = { id: '1001', filename: 'report.pdf', state: scenario === 'pdf-task-failed' ? 'failed' : scenario === 'pending' || scenario === 'pdf-task-pending' && counts.taskReads === 1 ? 'pending' : 'ready', createdAt: 1000 };
      if (String(body.query).includes('pdfPath')) task.pdfPath = scenario === 'outside' ? 'https://example.invalid/report.pdf' : '/my_reports/reports/private-capability/report.pdf';
      send(response, { data: { me: { reports: { totalCount: 1, nodes: [{ id: '71', tasks: [task] }] } } } }); return;
    }
    expect(request.headers['x-requested-with']).toBe('XMLHttpRequest');
    if (url.pathname === '/my_reports/api/v1/template/system/tc_organic_search_positions/create-document') {
      expect(request.method).toBe('POST'); expect(body).toEqual({ parameters: { domain: 'example.com', database: 'us' } });
      counts.creates++; send(response, scenario === 'create-missing' ? { status: 'success' } : { status: 'success', userDocumentId: nextId++ }); return;
    }
    if (url.pathname.endsWith('/clone')) {
      expect(url.pathname).toBe('/my_reports/api/v1/document/71/clone'); expect(request.method).toBe('POST');
      expect(body).toEqual({ documentName: 'Cloned report' }); counts.clones++;
      send(response, scenario === 'clone-missing' ? { status: 'success' } : { status: 'success', document: { id: nextId++, name: body.documentName ?? '' } }); return;
    }
    expect(url.pathname).toBe('/my_reports/api/v1/document/71');
    if (request.method === 'GET') { send(response, { status: 'success', document }); return; }
    expect(request.method).toBe('POST'); expect(Object.keys(body).sort()).toEqual(['commonPrivacyAccepted', 'document', 'timezone']);
    expect(body.commonPrivacyAccepted).toBe(true); expect(body.timezone).toEqual(expect.any(Number));
    const saved = Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }))(body.document);
    expect(body.document).toEqual({ ...reportingNative.save, name: saved.name, areSettingsTouched: document.areSettingsTouched });
    document = { ...document, name: saved.name };

    counts.saves++;
    if (scenario === 'save-lost') { request.socket.destroy(); return; }
    send(response, scenario === 'save-missing' ? { status: 'success' } : { status: 'success', documentId: 71, name: document.name ?? '' });
  };
  return {
    use(value: LifecycleScenario) { scenario = value; }, reset,
    onTaskRead(listener: () => void) { taskReadListener = listener; },
    counts: () => ({ ...counts }),
    metadataReads: () => metadataReads,
    withAISummary() { aiSummary = true; },
    handle,
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      const body: Query = request.method === 'GET' ? {} : JSON.parse(await readText(request));
      await handle(request, response, url, body);
    },
  };
}
