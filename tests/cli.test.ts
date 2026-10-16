import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import packageInfo from '../package.json' with { type: 'json' };
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { text as readText } from 'node:stream/consumers';
const exec = promisify(execFile);
const cli = (args: string[]) => exec(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } });

test('file inputs preserve crawl text and keep passwords out of public dry runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semrush-file-inputs-'));
  try {
    const urls = join(directory, 'urls.txt'); const password = join(directory, 'password.txt');
    await writeFile(urls, '/café\n/second\n'); await writeFile(password, 'private-password\r\n');
    const upload = JSON.parse((await cli(['audit-urls-upload', '--campaign-id', '123', '--contents-file', urls, '--dry-run', '--json'])).stdout);
    expect(upload.request.file).toEqual({ field: 'file-urls', filename: 'semrush-crawl-urls.txt', contents: '/café\n/second\n' });
    const result = await cli(['audit-create', '--campaign-id', '123', '--domain', 'example.com', '--page-limit', '1', '--auth-enabled', '--auth-username', 'user', '--auth-password-file', password, '--dry-run', '--json']);
    expect(JSON.parse(result.stdout).request.body.authPassword).toBe('[redacted]');
    expect(result.stdout + result.stderr).not.toContain('private-password');
    await expect(cli(['audit-urls-upload', '--campaign-id', '123', '--contents-file', join(directory, 'missing'), '--dry-run'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('could not be read') });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('password input supports stdin and rejects an empty value before authentication', async () => {
  const args = ['dist/cli.js', 'audit-create', '--campaign-id', '123', '--domain', 'example.com', '--page-limit', '1', '--auth-enabled', '--auth-username', 'user', '--auth-password-file', '-', '--dry-run', '--json'];
  const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(process.execPath, args, { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } }, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
    child.stdin?.end('private-stdin-password\r\n');
  });
  expect(JSON.parse(result.stdout).request.body.authPassword).toBe('[redacted]');
  expect(result.stdout + result.stderr).not.toContain('private-stdin-password');
  const empty = await new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(process.execPath, args, { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } }, (error, stdout, stderr) => error?.code ? resolve({ code: error.code, stdout, stderr }) : reject(new Error('Empty password unexpectedly succeeded')));
    child.stdin?.end('\n');
  });
  expect(empty).toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must NOT have fewer') });
});

test('interrupting an active stdin read exits without exposing the partial password', async () => {
  const child = spawn(process.execPath, ['dist/cli.js', 'audit-create', '--campaign-id', '123', '--domain', 'example.com', '--page-limit', '1', '--auth-enabled', '--auth-username', 'user', '--auth-password-file', '-', '--dry-run'], { stdio: 'pipe' });
  const exited = once(child, 'exit');
  const stdout = readText(child.stdout); const stderr = readText(child.stderr);
  try {
    // Pipe backpressure clears only once the CLI starts consuming stdin.
    expect(child.stdin.write('partial-password'.repeat(100000))).toBe(false);
    await once(child.stdin, 'drain');
    child.kill('SIGINT');
    expect(await exited).toEqual([130, null]);
    expect(await stdout).toBe(''); expect(await stderr).toBe('');
  } finally { child.stdin.destroy(); if (child.exitCode === null && child.signalCode === null) child.kill(); }
});

test('built CLI runs help and version without credentials', async () => {
  expect((await cli(['--version'])).stdout.trim()).toBe(packageInfo.version);
  expect(packageInfo.bin).toEqual({ semrush: 'dist/cli.js' });
  expect((await cli(['--help'])).stdout).toMatch(/^Usage: semrush /);
  expect((await cli(['domain-keywords', '--help'])).stdout).toContain('--page-size');
});
test('built catalog distinguishes read reports and project writes', async () => {
  const { stdout, stderr } = await cli(['reports', '--json']);
  const listed = JSON.parse(stdout);
  expect(listed).toHaveLength(271);
  expect(listed.filter((entry: { read_only: boolean }) => !entry.read_only)).toHaveLength(86);
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
    expect(listed.tools).toHaveLength(271);
    expect(listed.tools.find(tool => tool.name === 'project_delete')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_disavow_import')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_export')?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: false });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_replace_scope')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    for (const name of ['backlink_audit_comment_delete', 'backlink_audit_tag_delete']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'project_create')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    for (const name of ['audit_js_impact_guide', 'audit_js_impact_changed_pages', 'audit_js_impact_pages', 'audit_export_js_impact', 'audit_export_all']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
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
  await expect(cli(['notes-export'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  expect((await cli(['audit-export-pages', '--help'])).stdout).toContain('--output');
  await expect(cli(['keyword-list-export', '--basket-id', '456', '--owner-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['domain-strategy-export', '--strategy-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['audit-export-pages', '--snapshot-id', 'opaque_snapshot'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
});

test('notes accept explicit null project scope in CLI previews without loading credentials', async () => {
  const reply = JSON.parse((await cli(['note-update', '--note-id', 'owned-1', '--project-id', 'null', '--dry-run', '--json'])).stdout);
  expect(reply.request.body).toEqual({ project: null });
  await expect(cli(['note-update', '--note-id', 'owned-1', '--project-id', 'not-a-number', '--dry-run'])).rejects.toMatchObject({ code: 2, stdout: '' });
});

test('JS Impact export requires a destination and rejects irrelevant filters before authentication', async () => {
  expect((await cli(['audit-export-js-impact', '--help'])).stdout).toContain('--output <path>');
  await expect(cli(['audit-export-js-impact', '--campaign-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['audit-js-impact-pages', '--campaign-id', '123', '--status', 'unchanged', '--parameters', '["title"]'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must NOT have more than 0 items') });
});


test('All reports requires a new output path and validates native formats before authentication', async () => {
  expect((await cli(['audit-export-all', '--help'])).stdout).toContain('--output <path>');
  await expect(cli(['audit-export-all', '--campaign-id', '123'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli(['audit-export-all', '--campaign-id', '123', '--format', 'zip', '--output', 'reports.zip'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('allowed values') });
});
