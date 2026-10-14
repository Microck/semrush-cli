import { expect, test } from 'vitest';
import { Effect } from 'effect';
import { parseWire, readBootstrap, redact } from '../src/browser-layer.js';
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
