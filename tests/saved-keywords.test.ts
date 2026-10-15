import { Effect } from 'effect';
import { expect, test } from 'vitest';
import { parseReport } from '../src/validation.js';
import { webRequest, type Query } from '../src/report-parameters.js';

const base = '/apis/v4-raw/saved-keywords/api/v0/';
const plan = async (name: string, input: Query) => {
  const parsed = await Effect.runPromise(parseReport(name, input));
  return webRequest(parsed.definition, parsed.query);
};

// Current Saved Keywords client and FilterQL serializer, linked in docs/contract.md.
test('Saved Keywords uses its own native country IDs and literal import records', async () => {
  expect(await plan('saved_keywords_import', { list_id: '123', keywords: ['seo'], database: 'us', tags: ['research'], dry_run: true })).toEqual({
    method: 'POST', path: base + 'keyword/import', body: {
      list_id: '123', keywords: [{ phrase: 'seo', database: 115, tags: ['research'] }],
    },
  });
  await expect(plan('saved_keywords_import', { list_id: '123', keywords: ['seo'], database: 'zz', dry_run: true })).rejects.toThrow('allowed values');
});

test('explicit keyword selection preserves UInt64 IDs and the native numeric sort order', async () => {
  expect((await plan('saved_keywords_delete', { list_id: '123', keyword_ids: ['9223372036854775808', '10', '2'], dry_run: true })).body).toEqual({
    list_id: '123', filter: 'keyword_id IN (2, 10, 9223372036854775808)',
  });
  expect((await plan('saved_keyword_list_get', { list_id: '9223372036854775808' })).body).toEqual({
    filter: 'id = 9223372036854775808', ownership: 1, order: { field: 3, direction: 2 }, range: { limit: 1, offset: 0 },
  });
});

test('native FilterQL and export formats reach the fixed POST endpoint unchanged', async () => {
  expect((await plan('saved_keywords_export', { list_id: '123', filter: 'phrase CONTAINS "email"', format: 'xlsx', sort_field: 'volume', descending: true })).body).toEqual({
    list_id: '123', filter: 'phrase CONTAINS "email"', order: { field: 2, direction: 2 }, format: 2,
  });
  expect((await plan('saved_keywords_export', { list_id: '123', format: 'csv_semicolon' })).body).toMatchObject({ format: 3 });
  expect((await plan('saved_keywords_add_tags', { list_id: '123', filter: 'volume >= 100', tags: ['research'], dry_run: true })).body).toEqual({
    list_id: '123', filter: 'volume >= 100', tags: ['research'],
  });
});

test('account writes reject missing or ambiguous selection and self-transfers before runtime acquisition', async () => {
  await expect(plan('saved_keywords_delete', { list_id: '123', dry_run: true })).rejects.toThrow('required');
  await expect(plan('saved_keywords_delete', { list_id: '123', keyword_ids: [], dry_run: true })).rejects.toThrow('fewer');
  await expect(plan('saved_keywords_delete', { list_id: '123', filter: '', dry_run: true })).rejects.toThrow('fewer');
  await expect(plan('saved_keywords_delete', { list_id: '123', keyword_ids: ['1'], filter: 'volume > 0', dry_run: true })).rejects.toThrow('oneOf');
  await expect(plan('saved_keywords_move', { list_id: '123', target_list_id: '123', keyword_ids: ['1'], dry_run: true })).rejects.toThrow('must be different');
  await expect(plan('saved_keywords_delete', { list_id: '123', keyword_ids: ['1'] })).rejects.toThrow('--confirm');
});
