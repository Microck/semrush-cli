# Verification

Verified on 2026-10-14. Evidence is separated by layer.

## Automated checks

- TypeScript strict typecheck passes.
- Oxlint generic anti-slop rules, the Effect plugin and complexity checks pass with warnings denied.
- 61 Vitest tests pass. These include all 48 request-shape comparisons against the Python reference, schema/default checks, credential redaction, exact large IDs, executable behavior and three real-browser integration cases.
- Browser integration starts a real isolated Galleton daemon and Chromium against a local HTTP fixture. It verifies restored cookies, report decoding, cookie rotation persisted through the SDK, expiry refusal before report requests, and redacted provider errors. No module mocks and no Semrush credentials.
- Building Galleton runs the upstream core Go test suite with the static-provider integration test. It verifies storage without network renewal, origin restrictions, persisted cookie rotation and explicit refresh refusal.
- Fumadocs built successfully locally. Landing page and docs navigation rendered in Chromium. Public-site and package checks are recorded below as publication finishes.

## Live Semrush account

The authorized browser session was imported into the CLI-owned Galleton vault. A separate transient Chromium process restored the stored cookies and passed `doctor`.

The following CLI reports returned authenticated data:

- `keyword-overview --keyword 'email marketing'`
- `domain-overview --domain openai.com`
- `domain-keywords --domain openai.com --page-size 3`, including provider totals
- `keyword-magic --keyword 'email marketing' --page-size 3`
- `backlink-links --domain openai.com`
- `domain-ai-visibility --domain openai.com`
- `projects`
- `keyword-gap --domains '["openai.com","anthropic.com"]' --limit 3`

A real MCP SDK client connected through stdio, enumerated 48 read-only tools,
rejected injected authentication arguments, and read `keyword_overview` with
an authenticated result. The observed US volume for `email marketing` was 33,100
at verification time; Semrush data changes.

Live responses stayed outside the repository. The source publication audit
compared tracked files against actual stored cookies and the daemon token and
found no credential values.

## Package evidence

`npm pack` produced a 14.4 MB package, approximately 33.9 MB unpacked, containing
the JavaScript executable, five daemon binaries, licenses and branding. An install
into a separate temporary prefix ran `semrush-cli --version` and passed a live
`semrush-cli doctor --json` without relying on source-tree modules.

Linux arm64 has native execution evidence on this host. Other daemon targets are
cross-compiled. GitHub CI runs packed-package installation, setup and daemon
shutdown on Linux, macOS and Windows; its status must be checked separately.
The checks above do not prove all 48 reports are available on every Semrush plan,
indefinite session validity, or native execution on every compiled architecture.

## Published release

Version `0.1.1` uses the canonical `semrush-cli` executable so it can coexist with
an existing `semrush-mcp` installation. The CLI and MCP server report version
`0.1.1`, and a live MCP keyword call passed against that build.

[CI run 38652629000](https://github.com/Microck/semrush-cli/actions/runs/38652629000)
passed the source check, documentation build and packed-package setup/shutdown
on Ubuntu, macOS and Windows. The two source commits are `3c5ce82e` and
`fc8ac3b5`; subsequent evidence-document edits do not change the executable.

The npm `0.1.1` archive's SHA-1 is
`faf93a0c5d41740736953fb9258211a37cb595a0`, matching a locally packed archive.
The production Fumadocs site is `https://semrush.micr.dev`, with
`https://semrush-cli.vercel.app` as its Vercel alias. Public HTML, documentation,
search and `llms.txt` returned HTTP 200. Chromium rendered live search results
with no page errors, and the 390px mobile layout had no horizontal overflow.
Authoritative DNS and a public recursive resolver returned `76.76.21.21` for
the custom hostname; HTTPS on that hostname returned 200 with a valid certificate.
The host's resolver temporarily retained the earlier negative DNS cache.

## Version 0.2.0 project and branding checks

The shared catalog now contains 62 operations: 54 reads and 8 confirmed writes.
`npm run check` passed typechecking, Oxlint, daemon packaging and 79 tests.
Fourteen request-shape cases match the current Semrush project-selector and
Crossroad clients. A stateful HTTP fixture verifies real Chromium/Galleton
create/read/update/tags/delete behavior, HTTP 201/204 and exact 64-bit IDs.
A real MCP SDK client checks write/destructive annotations, confirmation refusal
and an unauthenticated dry run.

Live verification created a uniquely named project for `example.com`, read it,
renamed it, replaced its tags, pinned it, and read toolkit status and dashboard
metrics. The CLI deleted that exact test project and verified its absence from
the project list. Existing projects were not changed. SEO auto-setup and leaving
a shared project were not executed against the live account.

The purple documentation deployment built successfully on Vercel. Chromium
confirmed the page background is `rgb(66, 25, 131)` (`#421983`), with darker
purple sidebar and code surfaces, a loaded logo and no page errors. At 390px,
the home page has no horizontal overflow. White text on the primary background
has a measured contrast of 12.36:1. The coverage page lists remaining web-only
workflows rather than claiming full-suite parity.
