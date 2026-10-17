import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';
import type { Query } from '../src/report-parameters.js';

type Template = { id: number; name: string; sharedWith: string[]; deletedAt: string | null; };
type Scenario = 'complete' | 'denied' | 'lost' | 'missing' | 'partial' | 'wrong-id' | 'bad-list';

/** Native custom-template state is separate from saved reports and report share IDs. */
export function makeReportingTemplateFixture() {
  let scenario: Scenario = 'complete';
  let templates: Template[] = [];
  let writes = 0;
  let nextId = 502;
  const reset = (value: Scenario = 'complete') => {
    scenario = value; writes = 0; nextId = 502;
    templates = [{ id: 501, name: 'Existing template', sharedWith: [], deletedAt: null }];
  };
  reset();
  const serve = async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    expect(request.headers.cookie).toContain('session=authorized');
    expect(request.headers['x-requested-with']).toBe('XMLHttpRequest');
    response.setHeader('Content-Type', 'application/json');
    const send = (body: Query) => response.end(JSON.stringify(body));
    if (url.pathname === '/my_reports/api/v1/templates/') {
      expect(request.method).toBe('GET');
      expect([...url.searchParams.keys()].sort()).toEqual(['currentPage', 'limit', 'searchQuery', 'timezone']);
      expect(url.searchParams.get('limit')).toBe('30');
      expect(url.searchParams.get('timezone')).toBe('0');
      if (scenario === 'bad-list') { send({ status: 'success', templates: null }); return; }
      const page = Number(url.searchParams.get('currentPage'));
      const search = url.searchParams.get('searchQuery') ?? '';
      const selected = templates.filter(t => t.deletedAt === null && t.name.includes(search));
      send({ status: 'success', templates: selected.slice((page - 1) * 30, page * 30), page, pages: Math.ceil(selected.length / 30), total: selected.length, limit: 30 });
      return;
    }
    expect(url.search).toBe('');
    const raw = await text(request);
    const body: Query = raw ? JSON.parse(raw) : {};
    writes++;
    if (scenario === 'denied') {
      response.statusCode = 403; send({ status: 'error', error: 'template denied fixture-secret' }); return;
    }
    let receipt: Query;
    if (url.pathname === '/my_reports/api/v1/template/71') {
      expect(request.method).toBe('POST');
      expect(Object.keys(body).sort()).toEqual(['templateName', 'userDocumentId']);
      expect(body.userDocumentId).toBe('71');
      const template = { id: nextId++, name: Schema.decodeUnknownSync(Schema.String)(body.templateName), sharedWith: [], deletedAt: null };
      templates.push(template);
      receipt = { status: 'success', template };
    } else {
      const matched = /^\/my_reports\/api\/v1\/template\/(501|502)(?:\/(document|share|restore))?$/.exec(url.pathname);
      expect(matched).not.toBeNull();
      const template = templates.find(t => t.id === Number(matched?.[1]));
      if (!template) { response.statusCode = 404; send({ status: 'error', error: 'Template not found' }); return; }
      switch (matched?.[2]) {
        case 'document':
          expect(request.method).toBe('POST');
          expect(Object.keys(body)).toEqual(['documentName']);
          receipt = { status: 'success', document: { id: 72, name: Schema.decodeUnknownSync(Schema.String)(body.documentName), isScheduled: false, recipients: null } };
          break;
        case 'share': {
          expect(['POST', 'DELETE']).toContain(request.method);
          expect(Object.keys(body)).toEqual(['emails']);
          const emails = Schema.decodeUnknownSync(Schema.Array(Schema.String))(body.emails);
          template.sharedWith = request.method === 'POST' ? [...new Set([...template.sharedWith, ...emails])] : template.sharedWith.filter(email => !emails.includes(email));
          receipt = request.method === 'POST' ? { status: 'success', sharedWith: template.sharedWith } : { status: 'success' };
          break;
        }
        case 'restore':
          expect(request.method).toBe('POST'); expect(raw).toBe('');
          template.deletedAt = null; receipt = { status: 'success' };
          break;
        default:
          expect(request.method).toBe('DELETE'); expect(raw).toBe('');
          template.deletedAt = '2026-01-01T00:00:00.000Z';
          receipt = { status: 'success', template: { ...template, id: scenario === 'wrong-id' ? 999 : template.id } };
      }
    }
    if (scenario === 'lost') { request.socket.destroy(); return; }
    if (scenario === 'missing') { send({}); return; }
    if (scenario === 'partial') {
      send('sharedWith' in receipt ? { status: 'success', sharedWith: [] } : 'template' in receipt || 'document' in receipt ? { status: 'success' } : { unexpected: true });
      return;
    }
    send(receipt);
  };
  return { serve, reset, writes: () => writes };
}
