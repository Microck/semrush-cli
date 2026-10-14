import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import packageInfo from '../package.json' with { type: 'json' };
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from 'vitest';
const exec = promisify(execFile);
const cli = (args: string[]) => exec(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } });

test('built CLI runs help and version without credentials', async () => {
  expect((await cli(['--version'])).stdout.trim()).toBe(packageInfo.version);
  expect((await cli(['domain-keywords', '--help'])).stdout).toContain('--page-size');
});
test('built catalog distinguishes read reports and project writes', async () => {
  const { stdout, stderr } = await cli(['reports', '--json']);
  const listed = JSON.parse(stdout);
  expect(listed).toHaveLength(62);
  expect(listed.filter((entry: { read_only: boolean }) => !entry.read_only)).toHaveLength(8);
  expect(stderr).toBe('');
});
test('invalid usage fails before attempting authentication', async () => {
  await expect(cli(['keyword-magic', '--keyword', 'foo', '--page', '0'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must be >= 1') });
});
test('missing session is an actionable failure with no stdout', async () => {
  await expect(cli(['account-status', '--json'])).rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('semrush-cli setup') });
});

test('project writes require confirmation before credentials are loaded', async () => {
  await expect(cli(['project-create', '--name', 'example'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  const preview = JSON.parse((await cli(['project-create', '--name', 'example', '--domain', 'example.com', '--dry-run', '--json'])).stdout);
  expect(preview).toEqual({ dry_run: true, report: 'project_create', request: { method: 'POST', path: '/apis/v4-raw/folders/api/v0/folders', body: { properties: [{ name: { value: 'example' } }, { domain: { value: 'example.com' } }] } } });
  await expect(cli(['project-delete', '--folder-id', '../1', '--confirm'])).rejects.toMatchObject({ code: 2, stdout: '' });
});


test('MCP advertises write safety and previews without an authenticated runtime', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/cli.js', 'mcp'], env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } });
  const client = new Client({ name: 'semrush-cli-test', version: '1' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(62);
    expect(listed.tools.find(tool => tool.name === 'project_delete')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'project_create')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const preview = await client.callTool({ name: 'project_create', arguments: { name: 'example', dry_run: true } });
    expect(preview.isError).not.toBe(true);
    expect(preview.content).toEqual([{ type: 'text', text: JSON.stringify({ dry_run: true, report: 'project_create', request: { method: 'POST', path: '/apis/v4-raw/folders/api/v0/folders', body: { properties: [{ name: { value: 'example' } }] } } }) }]);
    const denied = await client.callTool({ name: 'project_delete', arguments: { folder_id: '123' } });
    expect(denied.isError).toBe(true);
    expect(denied.content).toEqual([{ type: 'text', text: expect.stringContaining('confirm:true') }]);
  } finally { await client.close(); }
});
