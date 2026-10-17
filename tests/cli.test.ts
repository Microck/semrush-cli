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

test('Web Bot Auth JSON files and stdin keep all headers out of CLI previews', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'semrush-webbot-input-'));
  const credentials = { signature_agent: 'private-agent', signature_input: 'private-input', signature: 'private-signature' };
  const args = ['audit-create', '--campaign-id', '123', '--domain', 'example.com', '--page-limit', '10', '--web-bot-auth-enabled', '--web-bot-auth-file'];
  try {
    const file = join(directory, 'headers.json');
    await writeFile(file, JSON.stringify(credentials) + '\n');
    const saved = await cli([...args, file, '--dry-run', '--json']);
    expect(JSON.parse(saved.stdout).request.body).toMatchObject({ webBotAuthEnabled: true,
      webBotAuthSignatureAgent: '[redacted]', webBotAuthSignatureInput: '[redacted]', webBotAuthSignature: '[redacted]' });
    for (const value of Object.values(credentials)) expect(saved.stdout + saved.stderr).not.toContain(value);
    const fromStdin = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = execFile(process.execPath, ['dist/cli.js', ...args, '-', '--dry-run', '--json'],
        { env: { ...process.env, SEMRUSH_GALLETON_TOKEN_FILE: '/nonexistent-semrushtest-token' } },
        (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
      child.stdin?.end(JSON.stringify(credentials) + '\r\n');
    });
    expect(JSON.parse(fromStdin.stdout)).toEqual(JSON.parse(saved.stdout));
    await writeFile(file, '{invalid private-signature');
    await expect(cli([...args, file, '--dry-run'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('expects valid JSON') });
  } finally { await rm(directory, { recursive: true, force: true }); }
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
test('keyword exports require a destination and validate formats before acquiring credentials', async () => {
  expect((await cli(['keyword-overview', '--help'])).stdout).toContain('--device');
  expect((await cli(['keyword-bulk', '--help'])).stdout).toContain('--keywords');
  for (const name of ['keyword-bulk-export', 'keyword-serp-export', 'keyword-serp-domains-export']) {
    const selection = name === 'keyword-bulk-export' ? ['--keywords', '["typescript"]'] : ['--keyword', 'typescript'];
    await expect(cli([name, ...selection])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  }
  await expect(cli(['keyword-overview-pdf', '--keyword', 'typescript', '--confirm'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  const pdfPreview = JSON.parse((await cli(['keyword-overview-pdf', '--keyword', 'typescript', '--output', 'overview.pdf', '--dry-run', '--json'])).stdout);
  expect(pdfPreview).toMatchObject({ dry_run: true, retains_report: true, preparation: [{ action: 'create_essential_report' }, { action: 'generate_pdf' }, { action: 'download_ready_task' }] });
  await expect(cli(['keyword-bulk', '--keywords', '[]'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Invalid keyword_bulk') });
  await expect(cli(['keyword-overview', '--keyword', 'typescript', '--date', '202613'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Invalid keyword_overview') });
});

test('keyword refresh previews stay offline, require consent and reject unsupported local controls before authentication', async () => {
  const preview = JSON.parse((await cli(['keyword-refresh', '--keywords', '["café"]', '--location-id', '21167', '--dry-run', '--json'])).stdout);
  expect(preview.request).toEqual({ method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'updates.RequestUpdates', params: { phrases: [{ phrase: 'café', database: 'us', location: 21167 }] } } });
  await expect(cli(['keyword-refresh', '--keywords', '["café"]'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  await expect(cli(['keyword-refresh', '--keywords', '[]', '--dry-run'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-local-overview', '--keyword', 'typescript', '--location-id', '21167', '--device', 'mobile'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['keyword-local-serp-export', '--keyword', 'typescript', '--location-id', '21167'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
});

test('domain preparation previews stay offline and unsupported personalization controls fail before authentication', async () => {
  const preview = JSON.parse((await cli(['keyword-domain-prepare', '--domain', 'www.example.com', '--dry-run', '--json'])).stdout);
  expect(preview.request).toEqual({ method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'domains.GetStatus', params: { domain: 'www.example.com' } } });
  await expect(cli(['keyword-domain-prepare', '--domain', 'example.com'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  for (const extra of [[], ['--job-id', '']]) await expect(cli(['keyword-domain-status', '--domain', 'example.com', ...extra])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-overview', '--keyword', 'typescript', '--domain', 'example.com', '--date', '202609'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-ai-summary', '--keyword', 'typescript', '--device', 'mobile'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['keyword-ai-topics', '--keyword', 'typescript', '--location-id', '21167'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['keyword-serp', '--keyword', 'typescript', '--limit', '1001'])).rejects.toMatchObject({ code: 2, stdout: '' });
});

test('organic comparison CLI rejects invalid selectors before authentication and exposes native controls', async () => {
  expect((await cli(['domain-position-changes', '--help'])).stdout).toContain('--date-range');
  expect((await cli(['domain-keywords', '--help'])).stdout).toContain('--positions-type');
  await expect(cli(['domain-position-changes', '--domain', 'example.com', '--date-range', '{"start_date":"20260230","end_date":"20260301"}'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['domain-position-changes-presets', '--domain', 'example.com', '--page', '2'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['domain-position-changes-daily-trend', '--domain', 'example.com', '--json'])).rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('semrush setup') });
});

test('Keyword Magic rejects ignored grouping and invalid domain controls before authentication', async () => {
  expect((await cli(['keyword-magic-groups', '--help'])).stdout).toContain('--group-by');
  expect((await cli(['keyword-magic', '--help'])).stdout).toContain('--domain');
  await expect(cli(['keyword-magic', '--keyword', 'typescript', '--groups-sort-field', 'count'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-magic-groups', '--keyword', 'typescript', '--group-by', 'words', '--groups-sort-field', 'name'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-magic-groups-summary', '--keyword', 'typescript', '--domain', 'https://example.com/'])).rejects.toMatchObject({ code: 2, stdout: '' });
  await expect(cli(['keyword-magic-topic-suggestions', '--keyword', 'typescript', '--group-by', 'words'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['keyword-magic-access', '--json'])).rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining('semrush setup') });
});

test('On Page previews stay offline and invalid assignments or unconfirmed writes fail before authentication', async () => {
  const selection = ['--campaign-id', '793', '--landings', '[{"url":"https://example.com/","keywords":["example domain"]}]'];
  const preview = JSON.parse((await cli(['onpage-create', ...selection, '--dry-run', '--json'])).stdout);
  expect(preview.request).toMatchObject({ method: 'POST', path: '/on-page-seo-checker/api/create', body: { id: 793, timezone: 0, settings: { notify: false, schedule: 0 } } });
  await expect(cli(['onpage-create', ...selection])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  await expect(cli(['onpage-run', '--campaign-id', '793'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  await expect(cli(['onpage-create', '--campaign-id', '793', '--landings', '[]', '--confirm'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Invalid onpage_create') });
  await expect(cli(['onpage-run', '--campaign-id', '793', '--paid', 'true', '--confirm'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  expect((await cli(['onpage-page-details', '--help'])).stdout).toContain('--snapshot-id');
});

test('Core Web Vitals URL-list previews stay offline and invalid IDs or unconfirmed writes fail before authentication', async () => {
  const preview = await cli(['audit-web-vitals-settings-set', '--campaign-id', '793', '--urls', '["https://example.com/"]', '--dry-run', '--json']);
  expect(JSON.parse(preview.stdout)).toEqual({ dry_run: true, report: 'audit_web_vitals_settings_set', request: {
    method: 'POST', path: '/siteaudit/api/campaigns/793/page-speed-metrics/settings', body: { urls: ['https://example.com/'] },
  } });
  await expect(cli(['audit-web-vitals-settings-set', '--campaign-id', '793', '--urls', '["https://example.com/"]'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Use --confirm') });
  await expect(cli(['audit-web-vitals-history', '--campaign-id', '793', '--url-id', '../bad'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('Invalid audit_web_vitals_history') });
});

test('built catalog distinguishes read reports and project writes', async () => {
  const { stdout, stderr } = await cli(['reports', '--json']);
  const listed = JSON.parse(stdout);
  expect(listed).toHaveLength(360);
  expect(listed.filter((entry: { read_only: boolean }) => !entry.read_only)).toHaveLength(119);
  expect(stderr).toBe('');
});
test('invalid usage fails before attempting authentication', async () => {
  await expect(cli(['keyword-magic', '--keyword', 'foo', '--page', '0'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must be >= 1') });
  await expect(cli(['reporting-overview', '--query', 'mutation { createReport }'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('unknown option') });
  await expect(cli(['reporting-overview', '--offset', '-1'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('must be >= 0') });
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
    expect(listed.tools).toHaveLength(360);
    for (const name of ['domain_position_changes_presets', 'domain_position_changes_daily_trend', 'domain_position_changes_monthly_trend', 'keyword_magic_access', 'keyword_magic_groups_summary', 'keyword_magic_topic_suggestions']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true });
    expect(listed.tools.find(tool => tool.name === 'keyword_domain_prepare')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    for (const name of ['keyword_domain_suggestions', 'keyword_domain_root', 'keyword_domain_status', 'keyword_ai_databases', 'keyword_ai_summary', 'keyword_ai_topics']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true });
    expect(listed.tools.find(tool => tool.name === 'project_delete')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_disavow_import')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_export')?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: false });
    expect(listed.tools.find(tool => tool.name === 'backlink_audit_replace_scope')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    for (const name of ['backlink_audit_comment_delete', 'backlink_audit_tag_delete']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(listed.tools.find(tool => tool.name === 'project_create')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(listed.tools.find(tool => tool.name === 'keyword_refresh')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    for (const name of ['keyword_locations', 'keyword_local_overview', 'keyword_local_serp', 'keyword_local_serp_organic_metrics', 'keyword_refresh_status', 'keyword_serp_domain_organic_metrics', 'keyword_serp_domain_backlink_metrics']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true });
    expect(listed.tools.find(tool => tool.name === 'keyword_local_serp_export')?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: false });
    expect(listed.tools.filter(tool => tool.name.startsWith('onpage_'))).toHaveLength(22);
    expect(listed.tools.filter(tool => tool.name.startsWith('onpage_') && tool.annotations?.readOnlyHint)).toHaveLength(13);
    for (const name of ['onpage_page_add', 'onpage_page_update', 'onpage_pages_add', 'onpage_pages_delete']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    for (const name of ['keyword_bulk', 'keyword_countries', 'keyword_product_ads', 'keyword_serp_organic_metrics', 'keyword_serp_backlink_metrics']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true });
    for (const name of ['keyword_bulk_export', 'keyword_serp_export', 'keyword_serp_domains_export']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: false });
    expect(listed.tools.filter(tool => tool.name.startsWith('audit_web_vitals_'))).toHaveLength(8);
    expect(listed.tools.filter(tool => tool.name.startsWith('audit_web_vitals_') && tool.annotations?.readOnlyHint)).toHaveLength(7);
    expect(listed.tools.find(tool => tool.name === 'audit_web_vitals_settings_set')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    for (const name of ['position_alert_read', 'position_alert_mark_all_read']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(listed.tools.find(tool => tool.name === 'position_alert_delete')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    for (const name of ['audit_js_impact_guide', 'audit_js_impact_changed_pages', 'audit_js_impact_pages', 'audit_export_js_impact', 'audit_export_all', 'keyword_list_export_mindmap', 'reporting_overview']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    for (const name of ['reporting_create', 'reporting_save', 'reporting_clone', 'reporting_generate']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(listed.tools.find(tool => tool.name === 'keyword_overview_pdf')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(listed.tools.find(tool => tool.name === 'reporting_delete')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    for (const name of ['reporting_get', 'reporting_tasks', 'reporting_download']) expect(listed.tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const preview = await client.callTool({ name: 'project_create', arguments: { name: 'example', dry_run: true } });
    expect(preview.isError).not.toBe(true);
    expect(preview.content).toEqual([{ type: 'text', text: JSON.stringify({ dry_run: true, report: 'project_create', request: { method: 'POST', path: '/apis/v4-raw/folders/api/v0/folders', body: { properties: [{ name: { value: 'example' } }] } } }) }]);
    const refreshPreview = await client.callTool({ name: 'keyword_refresh', arguments: { keywords: ['café'], dry_run: true } });
    expect(refreshPreview.isError).not.toBe(true);
    expect(refreshPreview.content).toEqual([{ type: 'text', text: JSON.stringify({ dry_run: true, report: 'keyword_refresh', request: { method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'updates.RequestUpdates', params: { phrases: [{ phrase: 'café', database: 'us', location: 0 }] } } } }) }]);
    const domainPreview = await client.callTool({ name: 'keyword_domain_prepare', arguments: { domain: 'www.example.com', dry_run: true } });
    expect(domainPreview.isError).not.toBe(true);
    expect(domainPreview.content).toEqual([{ type: 'text', text: JSON.stringify({ dry_run: true, report: 'keyword_domain_prepare', request: { method: 'POST', path: '/kwogw/v2/webapi', body: { id: 1, jsonrpc: '2.0', method: 'domains.GetStatus', params: { domain: 'www.example.com' } } } }) }]);
    const denied = await client.callTool({ name: 'project_delete', arguments: { folder_id: '123' } });
    expect(denied.isError).toBe(true);
    expect(denied.content).toEqual([{ type: 'text', text: expect.stringContaining('confirm:true') }]);
  } finally { await client.close(); }
});

test('alert event commands preview offline and require confirmation before authentication', async () => {
  for (const command of ['position-alert-read', 'position-alert-delete', 'position-alert-mark-all-read']) {
    const selection = ['--campaign-id', '123_456'];
    if (command !== 'position-alert-mark-all-read') selection.push('--alert-id', '900719925474099312345');
    const preview = JSON.parse((await cli([command, ...selection, '--dry-run', '--json'])).stdout);
    expect(preview.request.path).toBe('/tracking/alerts/');
    expect(preview.request.body).not.toHaveProperty('key');
    if (command !== 'position-alert-mark-all-read') expect(preview.request.body.alert_id).toBe('900719925474099312345');
    await expect(cli([command, ...selection])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--confirm') });
  }
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

test('mind-map image export requires a destination and validates its fixed formats and numeric IDs', async () => {
  const help = (await cli(['keyword-list-export-mindmap', '--help'])).stdout;
  expect(help).toContain('--output <path>');
  expect(help).toContain('(default: "jpg")');
  const selected = ['keyword-list-export-mindmap', '--basket-id', '456', '--owner-id', '123'];
  await expect(cli(selected)).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('--output') });
  await expect(cli([...selected, '--format', 'svg', '--output', 'mindmap.svg'])).rejects.toMatchObject({ code: 2, stdout: '', stderr: expect.stringContaining('allowed values') });
  await expect(cli(['keyword-list-export-mindmap', '--basket-id', '456/123', '--owner-id', '123', '--output', 'mindmap.png'])).rejects.toMatchObject({ code: 2, stdout: '' });
});
