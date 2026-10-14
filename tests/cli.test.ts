import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import packageInfo from '../package.json' with { type: 'json' };
import { expect, test } from 'vitest';
const exec = promisify(execFile);
const cli = (args: string[]) => exec(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } });

test('built CLI runs help and version without credentials', async () => {
  expect((await cli(['--version'])).stdout.trim()).toBe(packageInfo.version);
  expect((await cli(['domain-keywords', '--help'])).stdout).toContain('--page-size');
});
test('built catalog exposes the same 48 read reports', async () => {
  const { stdout, stderr } = await cli(['reports', '--json']);
  const listed = JSON.parse(stdout);
  expect(listed).toHaveLength(48);
  expect(stderr).toBe('');
});
test('invalid usage fails before attempting authentication', async () => {
  await expect(cli(['keyword-magic', '--keyword', 'foo', '--page', '0'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must be >= 1') });
});
test('missing session is an actionable failure with no stdout', async () => {
  await expect(cli(['account-status', '--json'])).rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('semrush-cli setup') });
});
