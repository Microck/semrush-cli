# Verification

Current source verification: 2026-10-15. The 0.8.0 source suite passed 131 tests. Live responses and credentials remain
outside the repository. Evidence below distinguishes local fixtures, native CI
and real account execution.

## Version 0.8.0 domain-strategy verification

All 17 new operations passed authenticated calls: lifecycle and status, presets,
filtered/paginated page opportunities, page details and URLs, SERP analysis,
existing/recommended keywords, keyword deletion and native exports. The owned
python.org strategy completed with 134 opportunities, including 69 existing
and 65 new pages. Pagination returned disjoint page selections. Text, volume,
difficulty and intent filters passed live checks. Deleting one recommended
keyword reduced its count and removed the selected ID.

CSV, semicolon CSV and XLSX exports passed complete MCP resource reads and
file checks. The CSV files exceeded 470 KB, exercising multiple chunks; XLSX
passed ZIP/workbook integrity checks. Native exports use a signed provider
address that stays inside the browser adapter and never appears in tool output.
The domain strategy was deleted and its absence verified.

The shared download adapter now uses native browser navigation for GET files,
including cross-origin Semrush exports, and same-origin fetch/Blob downloads
for JSON POST exports. Real HTTP fixtures cover redirect byte preservation,
HTTP errors, URL trust boundaries and cancellation. Navigation settles before
page cleanup. All six Site Audit GET exports and all three Saved Keywords POST
formats passed live regression checks on owned disposable resources. Cleanup verified the test
collection, project folder and audit campaign IDs were absent.

Across versioned passes, all 118 reads and 46 of 47 writes have live execution
evidence. Shared-project leave has contract coverage only. Account-gated
products remain gaps, as described on the coverage page. Strict TypeScript,
Oxlint, generated reference, packaging and all 131 tests passed.

## Version 0.7.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `8fffa8b61415b4131ab4d35d82e2c8ed6b6b6900e36dade02dfd112bc9c22a96`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38785962224)
passed source, docs and installation/setup on Linux, macOS and Windows.
A fresh packed installation and the installed public npm release passed
actual MCP calls. The public process advertised 148 tools and passed
Keyword Overview and Saved Keywords limits reads with the authorized session.

The [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.7.0)
is visible with the archive and checksum. The global command reports 0.7.0.
The new Saved Keywords guide is deployed on semrush.micr.dev; Chromium verified
HTTP 200, its heading, no page errors and no horizontal overflow at 390px.
A test-only Chromium QUIC flag avoided a host-specific navigation timeout;
production browser settings were not changed.

## Version 0.7.0 Saved Keywords verification

Strict TypeScript, Oxlint, generated-reference checks, packaging and all 127
tests passed after the cancellation review fix.

The catalog now has 148 operations: 105 reads and 43 writes. All 28 newly added
Saved Keywords operations passed authenticated live calls. Their thirteen
writes passed readback checks on two disposable collections: create, rename,
import, metric refresh, tag add/remove, workflow labels, copy/move, keyword
deletion/undo and collection deletion/undo. Regular collections appeared with
the same underlying IDs in the builder basket API.

CSV, semicolon CSV and XLSX exports returned files. CLI saving preserved bytes
and refused to overwrite an existing destination. All six existing Site Audit
GET exports were rechecked after the shared browser download implementation
changed. The browser buffers each provider response as a Blob, then saves it
through a native download. MCP responses contain artifact metadata and chunked
resource reads, not the full file.

Cleanup verified both owned collection IDs absent through Saved Keywords and
the builder API, then deleted the owned audit project and checked its folder
and campaign IDs absent. Unrelated account projects were preserved. The daemon
was restarted after a cleanup attempt failed before its first account read;
no write was retried without inspecting the current resource state.

The stateful HTTP fixture verifies POST export cookies, Origin and JSON body,
large decimal IDs, transfer semantics and undo. A provider's JSON HTTP 403
remains an error and creates no export artifact. A real pending HTTP export is
cancelled, its connection closes and the next report acquires the browser slot.

## Version 0.6.0 published artifacts

The public npm archive matched the tested local archive:
SHA-256 `9226f231212b143ff816474535a400a1beec173277c7aad647a142039a3971d6`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38766908994)
passed source checks, docs build and packed-package installation/setup on
Linux, macOS and Windows. A fresh public-package MCP process advertised 120
tools, including 90 reads, and passed an authenticated read. The GitHub release
includes the package archive and checksum.

## Version 0.6.0 verification

All 90 read operations passed authenticated MCP calls with valid inputs. This
includes native empty-result reports and account-access reads, not a claim
that every paid toolkit is unlocked. Detailed audit pages use current opaque
page IDs; a historical page ID correctly returned 404. Clustering forecast
requires a structured strategy and returns a provider error for a plain list.

Twenty-nine of the thirty writes have live execution evidence. Shared-project
leave has request-contract coverage only; no shared test project was available,
and verification did not send an invitation to another person.

Position Tracking creation, keyword add/delete, tag changes and competitor
replacement passed state readback checks. Rankings, landing pages, visibility,
distribution and cannibalization trends returned real target data. Automatic
SEO setup created a tracking target and a completed six-page Site Audit.

Detailed audit tables, page recrawl, abort and finalize passed live calls.
Finalize saved a new six-page snapshot after asynchronous processing. Page,
issue-summary and individual-issue exports passed as CSV and XLSX. MCP resource
reads preserved file bytes. CLI saving passed and an existing output file
remained unchanged with exit code 2.

Metric refresh and clustering requests passed, and structured strategy
generation completed with 1361 keywords. The check used two of the account's
30 clustering runs and refreshed two keywords. Normal account allowances
apply; no subscription or add-on was purchased.

All three owned project folders, their attached audits/tracking targets, both
keyword lists and the temporary Vercel crawl project were deleted. Cleanup
checked the owned IDs. An unrelated account project created during the run and
the original default folder were preserved.

The source passed strict TypeScript, Oxlint, generated-reference checks,
packaging and all 121 tests after review fixes. An earlier browser fixture timed
out while the host's swap was full; its timeout and assertions were unchanged.
The later full run passed. The review removed redundant parameter preparation
and ensured failed downloads release listeners and temporary files.

The Galleton SDK is public as `galleton@0.1.0`; its fresh registry installation
passed a real daemon call. Its archive matched the locally tested archive, and
its Linux/macOS/Windows Go, Rust and client/integration CI jobs passed.

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

The prior 0.5.0 verification did not execute leave, automatic SEO setup,
structured strategy generation, metrics refresh or clustering. The 0.6.0 pass
above adds live evidence for all except shared-project leave.

## Version 0.5.0 published artifacts

The public npm 0.5.0 archive matches the local release archive byte-for-byte:
SHA-256 `1f4b6f3140181c1e420ae7fa18b7cb24b734ca4ce291d86982ba990447d94882`.
The registry initially processed it asynchronously before making it public.
Its [CI run](https://github.com/Microck/semrush-cli/actions/runs/38668957140)
passed source checks, Fumadocs build, and packed-package installation/setup on
Ubuntu, macOS and Windows. Linux arm64 also has local native execution evidence.
Other bundled architectures are cross-compiled, not all natively tested here.
The installed 0.5.0 executable passed live `doctor`. Its MCP server advertised
89 tools, including 22 confirmed writes, and passed a live keyword read and an
authentication-free Site Audit dry run.

The production docs are [semrush.micr.dev](https://semrush.micr.dev), with
[semrush-cli.vercel.app](https://semrush-cli.vercel.app) as an alias. Chromium
verified Semrush purple `#421983`, darker sidebar/code surfaces, working search,
loaded branding, no page errors and no horizontal overflow at 390px. White text
on the primary background has 12.36:1 contrast. HTML, search and `/llms.txt`
returned HTTP 200. Authoritative/public DNS resolves the custom domain, while
this host temporarily retained an earlier negative DNS cache.

## Documentation and supplied-logo review

The supplied light logo is preserved byte-for-byte. The dark variant changes
only wordmark fills from black to white. Chromium verified the README picture
selects the intended asset in both color schemes. The documentation uses the
dark variant and a compact icon derived from the supplied comet paths.

All 73 concrete report examples in the README and authored documentation match
the current catalog schemas. Placeholder commands require the reader's actual
IDs. Generated-reference drift checking and docs TypeScript passed. A production
Fumadocs build succeeded. Chromium checked the homepage and all 11 documentation
pages at 1280px and 390px, with no horizontal overflow, missing images or page
errors. Search and `/llms.txt` returned valid results. This review makes no new
claim about live account mutations; runtime source and stored sessions were
unchanged.

## Limits of the evidence

This does not prove every report is available on every plan, indefinite session
validity, or complete Semrush suite parity. The coverage page names remaining
web-only workflows. Internal endpoints can change. The npm package is `semrush-cli`; the executable is `semrush`.

The CLI-owned daemon uses loopback port 8771. Its encrypted vault is unchanged.
An unrelated service occupied the former port during verification and was left
untouched. The signed-in shared browser was also preserved.
