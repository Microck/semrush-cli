import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';

export const savedPath = '/apis/v4-raw/saved-keywords/api/v0/';
interface Keyword { id: string; phrase: string; database: number; tags: string[]; labels: number[]; }
interface Collection { id: string; name: string; keywords: Keyword[]; }
interface Payload {
  list_id?: string; list_ids?: string[]; source_list_id?: string; target_list_id?: string;
  name?: string; undo_id?: string; filter?: string; keywords?: Omit<Keyword, 'id' | 'labels'>[];
  tags?: string[]; labels?: number[]; format?: number;
}

/** Stateful HTTP provider fixture; the browser and Galleton adapters remain real. */
export function makeSavedFixture() {
  const collections = new Map<string, Collection>();
  const removedLists = new Map<string, Collection[]>();
  const removedKeywords = new Map<string, { list: Collection; keywords: Keyword[] }>();
  let nextKeyword = 9223372036854775806n;
  let nextList = 100;
  let nextUndo = 0;
  const undoId = () => `undo-${++nextUndo}`;
  const metadata = (list: Collection) => ({ id: list.id, name: list.name, keywords_count: list.keywords.length });

  function listAction(path: string, payload: Payload) {
    if (path === 'list/create') {
      const id = String(++nextList); collections.set(id, { id, name: payload.name ?? '', keywords: [] });
      return { list_id: id };
    }
    if (path === 'list/all') {
      const id = payload.filter?.match(/^id = (\d+)$/)?.[1];
      return { lists: [...collections.values()].filter(list => !id || list.id === id).map(metadata) };
    }
    if (path === 'list/delete') {
      const removed = [...collections.values()].filter(list => payload.list_ids?.includes(list.id));
      for (const list of removed) collections.delete(list.id);
      const id = undoId(); removedLists.set(id, removed);
      return { deleted_lists_count: removed.length, undo_id: id };
    }
    if (path === 'list/undo-delete') {
      for (const list of removedLists.get(payload.undo_id ?? '') ?? []) collections.set(list.id, list);
      return {};
    }
    const list = collections.get(payload.list_id ?? '');
    if (!list) throw new Error('Unknown fixture collection');
    if (path === 'list/rename') { list.name = payload.name ?? ''; return {}; }
    if (path === 'list/tags') return { tags: [...new Set(list.keywords.flatMap(keyword => keyword.tags))] };
    throw new Error('Unsupported fixture list operation');
  }

  function keywordAction(path: string, payload: Payload) {
    if (path === 'keyword/undo-delete') {
      const removed = removedKeywords.get(payload.undo_id ?? '');
      if (removed) removed.list.keywords.push(...removed.keywords);
      return {};
    }
    const list = collections.get(payload.source_list_id ?? payload.list_id ?? '');
    if (!list) throw new Error('Unknown fixture keyword collection');
    if (path === 'keyword/import') {
      expect(payload.keywords?.every(keyword => keyword.database === 115)).toBe(true);
      const imported = (payload.keywords ?? []).map(keyword => ({ ...keyword, id: String(++nextKeyword), labels: [] }));
      list.keywords.push(...imported); return { imported_count: imported.length, duplicates_count: 0 };
    }
    if (path === 'keyword/all') return { keywords: list.keywords };
    const selected = list.keywords.filter(keyword => new RegExp(`\\b${keyword.id}\\b`).test(payload.filter ?? ''));
    expect(selected.length).toBeGreaterThan(0);
    if (path === 'keyword/copy' || path === 'keyword/move') {
      const target = collections.get(payload.target_list_id ?? '');
      if (!target) throw new Error('Unknown fixture destination');
      target.keywords.push(...structuredClone(selected));
      if (path === 'keyword/move') list.keywords = list.keywords.filter(keyword => !selected.includes(keyword));
      return { transferred_count: selected.length, duplicates_count: 0 };
    }
    if (path === 'keyword/delete') {
      list.keywords = list.keywords.filter(keyword => !selected.includes(keyword));
      const id = undoId(); removedKeywords.set(id, { list, keywords: selected });
      return { deleted_keywords_count: selected.length, undo_id: id };
    }
    for (const keyword of selected) {
      if (path === 'keyword/add-tags') keyword.tags.push(...payload.tags ?? []);
      else if (path === 'keyword/delete-tags') keyword.tags = keyword.tags.filter(tag => !payload.tags?.includes(tag));
      else if (path === 'keyword/add-labels') keyword.labels.push(...payload.labels ?? []);
      else throw new Error('Unsupported fixture keyword operation');
    }
    return {};
  }

  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    expect(request.method).toBe('POST');
    expect(request.headers.cookie).toContain('session=authorized');
    expect(request.headers['content-type']).toBe('application/json');
    expect(url.search).toBe('');
    let encoded = ''; for await (const chunk of request) encoded += chunk;
    const payload: Payload = JSON.parse(encoded);
    expect(payload).not.toHaveProperty('confirm'); expect(payload).not.toHaveProperty('dry_run');
    const path = url.pathname.slice(savedPath.length);
    if (path === 'keyword/export') {
      if (payload.filter === 'forbidden') {
        response.writeHead(403, { 'Content-Type': 'application/json' });
        response.end('{"details":[{"error_code":403}]}'); return;
      }
      expect(payload).toMatchObject({ format: 1, filter: '', order: { field: 1, direction: 1 } });
      expect(request.headers.origin).toBe(url.origin);
      response.setHeader('Content-Type', 'text/csv');
      response.setHeader('Content-Disposition', 'attachment; filename=saved.csv');
      response.end('phrase,volume\nseo,100\n'); return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(path.startsWith('list/') ? listAction(path, payload) : keywordAction(path, payload)));
  };
}
