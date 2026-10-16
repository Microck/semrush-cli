import { expect, test } from 'vitest';
import { Effect } from 'effect';
import { parseWire, readBootstrap, redact } from '../src/browser-layer.js';
import type { Query } from '../src/report-parameters.js';
import { parseReport } from '../src/validation.js';

test('preserves 64-bit identifiers through JSON output', () => {
  const parsed = parseWire('{"id":9223372036854775807,"count":20}');
  expect(JSON.parse(JSON.stringify(parsed))).toEqual({ id: '9223372036854775807', count: 20 });
});
test('extracts bootstrap JSON without executing script or truncating quoted braces', () => {
  expect(readBootstrap('<script>window.sm2.user = {"api_key":"test}key","id":9223372036854775807,"nested":{"text":"\\\"}"}};throw new Error("do not execute")</script>')).toEqual({ apiKey: 'test}key', userId: '9223372036854775807' });
});
test('rejects missing or invalid authentication metadata', () => {
  expect(() => readBootstrap('<script>window.sm2.user={"api_key":null,"id":1}</script>')).toThrow();
  expect(() => readBootstrap('<html>Sign in</html>')).toThrow();
});
test('account identity comes from user metadata without inferring an SEO plan', () => {
  expect(readBootstrap('<script>window.sm2.user={"api_key":"secret","id":123,"email":"fixture@example.com"};window.sm2.billingInfo={"is_paid":false,"product_group":"App Center access"}</script>')).toEqual({ apiKey: 'secret', userId: 123, email: 'fixture@example.com' });
  expect(readBootstrap('<script>window.sm2.user={"api_key":"secret","id":123,"email":false}</script>')).toEqual({ apiKey: 'secret', userId: 123 });
});
test('redacts nested secret fields and echoed credential strings', () => {
  expect(redact({ api_key: 'secret', rows: [{ authorization: 'Bearer abc', url: 'https://example.com/secret', title: 'ok' }], error: 'Bearer abc' }, ['secret', 'Bearer abc', 'abc'])).toEqual({ rows: [{ url: 'https://example.com/[redacted]', title: 'ok' }], error: '[redacted]' });
});
test('rejects prototype-polluting provider responses', () => {
  expect(() => parseWire('{"__proto__":{"admin":true}}')).toThrow();
});
test('validates schema defaults, numeric bounds, and rejects auth injection', async () => {
  const parsed = await Effect.runPromise(parseReport('keyword_magic', { keyword: 'email marketing' }));
  expect(parsed.query.page).toBe(1);
  expect(parsed.query.page_size).toBe(100);
  await expect(Effect.runPromise(parseReport('keyword_magic', { keyword: 'foo', page: 0 }))).rejects.toThrow();
  await expect(Effect.runPromise(parseReport('domain_overview', { domain: 'example.com', apiKey: 'injected' }))).rejects.toThrow();
  await expect(Effect.runPromise(parseReport('unknown', {}))).rejects.toThrow();
});


test('project validation rejects write consent bypasses, path injection and empty edits', async () => {
  const invalidInputs: Query[] = [{ name: 'invalid:name', confirm: true }, { name: 'example' }, { name: 'example', confirm: false }, { name: 'example', confirm: true, folder_id: '1' }];
  for (const input of invalidInputs) {
    await expect(Effect.runPromise(parseReport('project_create', input))).rejects.toThrow();
  }
  await expect(Effect.runPromise(parseReport('project_update', { folder_id: '1', confirm: true }))).rejects.toThrow();
  await expect(Effect.runPromise(parseReport('project_delete', { folder_id: '1/other', confirm: true }))).rejects.toThrow();
  await expect(Effect.runPromise(parseReport('project_create', { name: ' ', confirm: true }))).rejects.toThrow();
  const preview = await Effect.runPromise(parseReport('project_delete', { folder_id: '9223372036854775807', dry_run: true }));
  expect(preview.query.folder_id).toBe('9223372036854775807');
  expect(preview.definition.destructive).toBe(true);
});


test('strategy generation requires a real domain or seed selection before authentication', async () => {
  const invalid: Query[] = [{ name: 'strategy', confirm: true }, { name: 'strategy', seed_keywords: [], confirm: true }, { name: 'strategy', domain: 'https://example.com', confirm: true }];
  for (const input of invalid) await expect(Effect.runPromise(parseReport('keyword_strategy_create', input))).rejects.toThrow();
  const preview = await Effect.runPromise(parseReport('keyword_strategy_create', { name: 'strategy', seed_keywords: ['seo'], dry_run: true }));
  expect(preview.query.seed_keywords).toEqual(['seo']);
  expect(preview.query.database).toBe('us');
});
