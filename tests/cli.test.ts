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
  expect(packageInfo.bin).toEqual({ semrush: 'dist/cli.js' });
  expect((await cli(['--help'])).stdout).toMatch(/^Usage: semrush /);
  expect((await cli(['domain-keywords', '--help'])).stdout).toContain('--page-size');
});
test('built catalog distinguishes read reports and project writes', async () => {
  const { stdout, stderr } = await cli(['reports', '--json']);
  const listed = JSON.parse(stdout);
  expect(listed).toHaveLength(192);
  expect(listed.filter((entry: { read_only: boolean }) => !entry.read_only)).toHaveLength(59);
  expect(stderr).toBe('');
});
test('invalid usage fails before attempting authentication', async () => {
  await expect(cli(['keyword-magic', '--keyword', 'foo', '--page', '0'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must be >= 1') });
});
test('missing session is an actionable failure with no stdout', async () => {
  await expect(cli(['account-status', '--json'])).rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('semrush setup') });
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
    expect((await client.listResources()).resources).toEqual([]);
    expect((await client.listResourceTemplates()).resourceTemplates[0]?.uriTemplate).toBe('semrush-export://{export_id}{?offset,limit}');
    await expect(client.readResource({ uri: 'semrush-export://unknown' })).rejects.toThrow('Download an export first');
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(192);
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


test('keyword list dry runs never acquire credentials and expose no RPC auth fields', async () => {
  const preview = JSON.parse((await cli(['keyword-list-create', '--name', 'example', '--dry-run', '--json'])).stdout);
  expect(preview).toEqual({ dry_run: true, report: 'keyword_list_create', request: { method: 'POST', path: '/kwm/rpc', body: { id: 1, jsonrpc: '2.0', method: 'baskets.BasketCreate', params: { Name: 'example', Clusterization: null } } } });
  await expect(cli(['keyword-list-create', '--name', 'example'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  await expect(cli(['keyword-list-get', '--basket-id', '9007199254740992', '--owner-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '' });
});

test('CLI exports require an output path before authentication', async () => {
  expect((await cli(['audit-export-pages', '--help'])).stdout).toContain('--output');
  await expect(cli(['keyword-list-export', '--basket-id', '456', '--owner-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['domain-strategy-export', '--strategy-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['audit-export-pages', '--snapshot-id', 'opaque_snapshot'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
});
