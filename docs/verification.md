# Verification

Current source verification: 2026-10-15. The source suite passed 110 tests. Live responses and credentials remain
outside the repository. Evidence below distinguishes local fixtures, native CI
and real account execution.

## Automated checks

`npm run check` runs strict TypeScript, Oxlint with generic/Effect anti-slop and
complexity rules, generated-reference drift checking, executable packaging,
Galleton core Go tests and Vitest.

Tests retain differential request-shape coverage for all 48 original Python
reports. Additional source-derived contracts cover projects, Keyword Strategy
Builder and Site Audit. Real Chromium and a private Galleton daemon exercise a
stateful HTTP fixture, credential redaction, exact 64-bit IDs, cookie rotation,
expired-session refusal and mutation consent. MCP tests use a real SDK client
and stdio transport. No module mocks or account credentials are used in CI.

The Galleton static-provider tests verify encrypted storage, origin restrictions,
cookie capture and explicit renewal refusal. Five daemon binaries are bundled:
Linux x64/arm64, macOS x64/arm64 and Windows x64.

## Live account

The authorized browser session was imported into the CLI-owned Galleton vault.
A separate transient browser restored it and passed `doctor`. Keyword Overview,
Keyword Magic, Organic Research, Keyword Gap, backlinks, AI visibility and
project discovery returned authenticated results. A real MCP client also made
an authenticated keyword call. Plan access and quotas still govern every report.

Disposable project checks verified create, read, rename, tags, pinning, toolkit
status, dashboard metrics and deletion. Existing account projects were not
modified. A disposable keyword list passed create/list/get/rename/import,
keyword and summary reads, tag addition/removal, phrase deletion, undo and list
deletion. Its absence was verified after cleanup.

Site Audit verification enabled a disposable SEO project, saved manual settings
with email disabled and a 10-page cap, and explicitly launched the crawl. It
finished after six pages. Account limits, configuration, status, history and the
completed snapshot returned authenticated data. A snapshot ID is an opaque
string. A fresh SEO project passed audit creation without a crawl, duplicate-creation
refusal and configuration replacement. All disposable projects were deleted;
Site Audit discovery returned its original empty baseline.

Leave, automatic SEO setup, structured strategy generation, metrics refresh and
clustering retain source-derived request coverage without live execution. Those
operations can affect shared projects or consume additional allowances.

## Published artifacts

The public npm 0.4.0 archive matches the local release archive byte-for-byte:
SHA-256 `092d2eb9b57760d979c816487438c6e8505f6580aa4bdfc3a27e12f56443d71a`.
The registry initially processed it asynchronously before making it public.
Its [CI run](https://github.com/Microck/semrush-cli/actions/runs/38666069399)
passed source checks, Fumadocs build, and packed-package installation/setup on
Ubuntu, macOS and Windows. Linux arm64 also has local native execution evidence.
Other bundled architectures are cross-compiled, not all natively tested here.
The installed 0.4.0 executable passed live `doctor`. Its MCP server advertised
89 tools, including 22 confirmed writes, and passed a live keyword read and an
authentication-free Site Audit dry run.

The production docs are [semrush.micr.dev](https://semrush.micr.dev), with
[semrush-cli.vercel.app](https://semrush-cli.vercel.app) as an alias. Chromium
verified Semrush purple `#421983`, darker sidebar/code surfaces, working search,
loaded branding, no page errors and no horizontal overflow at 390px. White text
on the primary background has 12.36:1 contrast. HTML, search and `/llms.txt`
returned HTTP 200. Authoritative/public DNS resolves the custom domain, while
this host temporarily retained an earlier negative DNS cache.

## Limits of the evidence

This does not prove every report is available on every plan, indefinite session
validity, or complete Semrush suite parity. The coverage page names remaining
web-only workflows. Internal endpoints can change. The README and published
package use `semrush-cli`, preserving the existing `semrush-mcp` executable.

The CLI-owned daemon uses loopback port 8771. Its encrypted vault is unchanged.
An unrelated service occupied the former port during verification and was left
untouched. The signed-in shared browser was also preserved.
