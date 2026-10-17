import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';

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
    use(value: Scenario) { scenario = value; },
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(url.pathname).toBe('/my_reports/graphql/'); expect(url.search).toBe('');
      expect(request.method).toBe('POST'); expect(request.headers.cookie).toContain('session=authorized');
      expect(request.headers.authorization).toBeUndefined();
      const raw = JSON.parse(await readText(request));
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
