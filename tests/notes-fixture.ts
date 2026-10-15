import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Schema } from 'effect';
import { expect } from 'vitest';

/** Stateful native notes API behind the real browser and encrypted session boundary. */
export function makeNotesFixture() {
  const original = { id: 'published-note', user_id: null, read_only: true, category: 'SEMRUSH', title: 'Published update',
    note: 'Provider content', datetime: '2026-10-15T00:00:00Z', tools: ['POSITION_TRACKING'], databases: [], project: null, link: null, hidden: false };
  const notes = new Map<string, Schema.JsonObject>([[original.id, original], ['other-note', { ...original, id: 'other-note', user_id: 456, read_only: false, category: 'USER_NOTE' }]]);
  let categories: Schema.Json[] = ['UNCONFIRMED'];
  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    expect(request.headers.cookie).toContain('session=authorized');
    if (url.pathname === '/notes/api/notes/export/') {
      expect(request.method).toBe('POST');
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers['content-type']).toBe('application/x-www-form-urlencoded');
      let encoded = '';
      for await (const chunk of request) encoded += chunk;
      expect([...new URLSearchParams(encoded)]).toEqual([['token', 'fixture-secret']]);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename=semrush_notes_export.csv');
      response.end('title,note\r\nOwned note,fixture content\r\n'); return;
    }
    expect(request.headers.authorization).toBe('Token fixture-secret');
    expect(url.searchParams.has('key')).toBe(false);
    response.setHeader('Content-Type', 'application/json');
    const reply = (value: Schema.Json) => response.end(JSON.stringify(value));
    if (url.pathname === '/notes/api/databases/') { reply({ databases: ['US', 'ES'] }); return; }
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    const body = encoded ? JSON.parse(encoded) : null;
    if (url.pathname.endsWith('/hidden/categories/')) {
      expect(url.searchParams.get('tool')).toBe('POSITION_TRACKING');
      expect(url.searchParams.get('project_id')).toBe('789');
      if (request.method === 'PUT') { expect(Array.isArray(body)).toBe(true); categories = body; response.writeHead(201); response.end(); return; }
      else expect(request.method).toBe('GET');
      reply(categories); return;
    }
    if (url.pathname === '/notes/api/notes/v2/notes/') {
      if (request.method === 'GET') {
        expect(url.searchParams.get('page')).toBe('1');
        expect(url.searchParams.get('per_page')).toBe('20');
        expect(url.searchParams.get('ordering')).toBe('-datetime,-created');
        expect(url.searchParams.get('tools')).toBe('POSITION_TRACKING');
        expect(url.searchParams.get('projects')).toBe('789');
        expect(url.searchParams.get('databases')).toBe('US,ALL');
        const rows = [...notes.values()].filter(note => url.searchParams.get('get_hidden') !== 'false' || !note.hidden);
        reply({ count: rows.length, per_page: 20, page: 1, results: rows }); return;
      }
      expect(request.method).toBe('POST');
      expect(body).toEqual({ title: 'Owned note', note: 'Keep this content', datetime: '2026-10-15T00:00:00.000Z',
        tools: ['POSITION_TRACKING'], databases: [], project: 789, link: 'https://example.com/', category: 'USER_NOTE' });
      const created = { ...body, id: 'owned-note', user_id: 123, read_only: false, hidden: false };
      notes.set(created.id, created); response.statusCode = 201; reply(created); return;
    }
    const match = /^\/notes\/api\/notes\/v2\/notes\/([^/]+)\/(?:(hide|show)\/)?$/.exec(url.pathname);
    if (!match) throw new Error('Unexpected notes path');
    const id = match[1] ?? '';
    const note = notes.get(id);
    if (!note) { response.statusCode = 404; reply({ detail: 'Not found' }); return; }
    if (request.method === 'GET') { reply(note); return; }
    if (match[2]) {
      expect(request.method).toBe('POST'); expect(body).toBeNull();
      const changed = { ...note, hidden: match[2] === 'hide' };
      notes.set(id, changed); response.writeHead(200); response.end(); return;
    }
    // The client must refuse published and foreign edits before a write reaches the server.
    expect(id).toBe('owned-note');
    if (request.method === 'DELETE') { notes.delete(id); response.writeHead(204); response.end(); return; }
    expect(request.method).toBe('PUT');
    expect(body).not.toHaveProperty('user_id'); expect(body).not.toHaveProperty('read_only');
    expect(body).not.toHaveProperty('confirm'); expect(body).not.toHaveProperty('dry_run');
    expect(body).toMatchObject({ id, note: 'Keep this content', tools: ['POSITION_TRACKING'], datetime: '2026-10-15T00:00:00.000Z' });
    notes.set(id, { ...note, ...body, link: body.link ?? null }); reply(notes.get(id) ?? null);
  };
}
