# Verification

Version 0.14.0 verification: 2026-10-16. Its source suite passed 148 tests
locally, including real Chromium, Galleton and stateful HTTP fixtures. Live responses and credentials remain
outside the repository. Evidence below distinguishes local fixtures, native CI
and real account execution.

## Version 0.14.1 account diagnostics verification

[CI run 38843252175](https://github.com/Microck/semrush-cli/actions/runs/38843252175)
passed 150 tests, lint, TypeScript, the docs build and package installation on
Linux, macOS and Windows. Three independent code-simplification reviews found
no issues. Nine tests timed out during the local full run while swap was full;
all 150 passed in CI without loosening assertions or timeouts. A disposable private runner expired
before its logs could be retrieved and is not counted as verification.

The new session-confirmation error was verified against the live
`/multilogin/` response. Reimporting the valid reference browser's cookies
with Galleton revision checking restored both `doctor` and
`auth status --check`; both returned the same signed-in account's email.
The public npm archive is byte-identical to the CI package. Its SHA-256 is
`8913bada83ad757deafc1aa6ac03861e4a4097d5efaf1f08d2abdda2cb84520f`.
The deployed authentication and coverage pages passed mobile Chromium checks
at 390px with HTTP 200, expected content, no page errors and no overflow.

## Guru account verification

The subscription page's SEO section explicitly displayed "Guru" and
"Subscribed" on 2026-10-16. The same page displayed "Trial active". These
states coexist; trial status does not establish that the account lacks Guru.
The CLI's Galleton session and the authorized reference browser returned the
same account identity. Generic overview billing metadata reported
`is_paid:false` and `product_group:"App Center access"`; these fields do not
identify the SEO subscription and must not be used to classify its plan.

The export denials below describe observed provider responses for this Guru
session. They do not establish that another account is required or that all
Guru accounts lack export access. A stale CLI cookie snapshot subsequently
encountered a `/multilogin/` redirect and HTTP 401 from the keyword gateway.
The authorized reference browser's session check still succeeded. Reimporting
that browser into Galleton with revision checking restored authenticated
`doctor` access to the same account. No session takeover was submitted.

## Backlink Analytics export access

The native Backlinks report loaded example.com results. Clicking its Export
control displayed "Export is limited" and "Upgrade to Guru". The native network
graph export client separately checks paid and trial state. Semrush's official
[Backlinks manual](https://www.semrush.com/kb/501-backlinks-report-manual) describes
filtered CSV/Excel exports and account limits. No export or upgrade was submitted.
Backlink Analytics exports remain unsupported. This session has not provided
a successful native export fixture.

## Keyword selection workflow verification

Two Keyword Magic phrases were imported with tags into an owned Saved Keywords
collection. The same collection appeared through Keyword Strategy Builder;
its keyword read returned the same phrases. Those builder selections were
added to the owned tracking target and read back with their tags intact.

Two Keyword Gap results were then imported into that collection and selected
through its Saved Keywords read. Adding them to tracking preserved the original
tracked keyword and the prior Magic selections. Each write used the existing
confirmed destination command. No duplicate selection API was added. The docs
show each report's actual phrase field and explicit destination identifiers.
The four published CLI read recipes also passed their exact `jq` expressions: two
phrases from each research page and four from each saved/builder read. The owned
collection was absent from both APIs after deletion. The owned project and all
recorded target IDs were absent after cleanup. Existing account resources were
preserved.

## Version 0.14.0 published artifacts

The public npm archive matches the tested runtime and release archive:
SHA-256 `9322cd6ef3ea01b1ed0ea17c929bac0d0e9ce2bba1351cf98f31b4d58e123a0e`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38828856242)
passed all five source, docs and platform-installation jobs at commit
`86d902cefe2715d51dcee5d26c972bf6b75f25bc`. Fresh packed and public-registry
MCP processes advertised 209 tools and passed authenticated research, list,
notes, native CSV, engine-specific location and complete tracked keyword reads.
The installed global command reported 0.14.0 and passed authenticated doctor.
The [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.14.0)
includes matching archive and checksum assets.

The tracking and coverage pages passed production mobile checks. The first
coverage navigation failed with `ERR_NETWORK_CHANGED`; both pages passed the
recheck. The local docs build was stopped after more than 18 minutes; exact-commit
CI and the Vercel production build passed. Registry propagation initially returned
404/ETARGET, then both registry metadata representations and a refreshed npm
installation returned 0.14.0. These transient failures remain in private evidence.

## Version 0.14.0 tracking targets verification

Native replacements changed the owned Google target to mobile/Spanish, then to
Bing/UK/English. Each returned a new composite target ID. Readbacks preserved
the complete keyword/tag list, title, URL/type, business, brands and disabled
weekly email. The native wizard explicitly warns that replacement deletes the
original target's ranking history. Only disposable targets were replaced.

A request using Google's UK location ID for Bing returned HTTP 400. A readback
confirmed the target was unchanged. Bing's native location lookup returned its
own UK ID, and the corrected request passed. `position-locations --engine`
exposes engine-specific IDs and language options. No failed write was retried
without inspecting state and correcting its inputs.

`position-delete` removed only the selected target. Project target discovery
confirmed its absence and the sibling target's continued presence. The complete
tracked keyword/tag read works before rankings exist. The fixture suite verifies
read-only refusal, missing native capabilities, current-setting preservation,
bodyless DELETE query credentials and redaction of echoed private capabilities.
Strict TypeScript, Oxlint, generated-reference checks and all 148 tests passed.
Three independent simplification reviews found no changes needed.

## Version 0.13.0 published artifacts

The public npm archive matches the tested archive:
SHA-256 `b92392658bf02777231ab5feb0ae60ed6b3d3e347cc39b36a1f628474ca43909`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38825123655)
passed all five source, docs and platform-installation jobs. Fresh packed and
public-registry MCP processes advertised 206 tools and passed authenticated
research, keyword-list, notes and CSV-resource checks. The global command
reported 0.13.0. Its first doctor check failed with a browser-request error;
a later check passed without package or session changes. The cause of the first
failure remains unconfirmed. The notes and coverage pages passed production
mobile checks with HTTP 200, no page errors and no horizontal overflow.

## Version 0.13.0 chart notes verification

All eleven new operations passed authenticated native calls. Note creation,
partial edits, hide/show, category replacement/restoration and deletion passed
readback checks on owned fixtures. Edits preserved omitted content, timestamps,
tools, project and link fields. Explicit null project scope and clearing a
nonempty link passed, followed by restoration. The owned note was absent from
the selected list after deletion; the owned project was absent from the folder
list. Existing account resources were preserved.

The native CSV export returned 2,781,804 bytes. MCP resource reads reconstructed
the file in three chunks. CLI saving returned identical bytes, and a second
save refused the existing destination without changing it. The export includes
all notes and does not apply list filters.

Live verification corrected response and serialization assumptions. Category
replacement returns HTTP 201 with no body; hide/show return HTTP 200 with no
body. Dates use the native client's millisecond ISO serialization. The tested
root URLs ending in `/` failed native URL validation, including through the
web form; a root URL without that slash passed. The CLI does not alter URLs.

The real Chromium/Galleton/HTTP fixture verifies owner and read-only refusal,
partial preservation, nullable scope, native form exports and empty responses.
Commander replaces null parser returns with empty strings, so CLI text now
converts once at the command boundary before schema validation. All 145 tests,
strict TypeScript, Oxlint, reference generation and packaging passed. Three
independent simplification reviews found no changes needed.

All 141 reads and 64 of 65 writes have live execution evidence across versioned
passes. Shared-project leave still lacks a shared-account fixture. Detailed
responses and credentials remain outside the repository.

## Version 0.12.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `3b04c7e676ecf08bf9d3953ebb6f181cd58c28918c757bcc1bf8dd18a9fdb1fb`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38819399955)
passed source, docs and installation/setup on Linux, macOS and Windows.
Fresh packed and public-registry processes advertised 195 tools and passed
authenticated reads. The global command reported 0.12.0. The
[GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.12.0)
includes the archive and checksum. The tracking guide and coverage page passed
production Chromium checks at 390px with expected content, HTTP 200, no page
errors and no horizontal overflow.

## Version 0.12.0 tracking report verification

All three new reads passed authenticated calls on owned example.com targets.
Competitor discovery returned 55 websites. Two ten-row pages had consistent
totals and no overlap. All four sort fields passed in both directions.
Distribution returned the selected domain's ranking buckets. All seven sort
fields and all five top-bucket change selectors passed native calls.

Comparison returned the tracked phrase with desktop position 1 and mobile
position 2. All four intersection modes passed. The shared fixture produced
positive ranks in `all` and `shared`, and no rows in the two exclusive modes.
Position, keyword and volume sorting passed for both target indexes. Composite
target IDs and the provider's native envelope remain unchanged. All 136 reads
and 58 of 59 writes have live execution evidence across versioned passes.
Shared-project leave still lacks a shared-account fixture.

The current source passed all 142 tests, strict TypeScript, Oxlint, generated
reference checks and executable packaging in an isolated private container.
Local runs under host memory pressure timed out; no assertion or timeout was
weakened. The container used the real published Galleton SDK and a temporary
vault for the authorized session. Three independent simplification reviews
found no changes needed. The owned project was absent from the folder list,
and both target IDs were absent from campaign discovery after deletion. Detailed
responses and credentials remain outside the repository.

## Version 0.11.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `a4f0560c389b7e06ddfd8e77b1d30a161e0905a77f330766e2cb54d6c19f0b38`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38808788238)
passed source, docs and installation/setup on Linux, macOS and Windows.
Fresh packed and installed public npm processes advertised 192 tools and passed
authenticated reads. The global command reported 0.11.0. The
[GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.11.0)
includes the archive and checksum. The production alert guide passed a Chromium
check at 390px with its new heading, HTTP 200, no page errors and no horizontal
overflow. Registry processing delayed availability after npm accepted publication;
the archive was checked after the version became public.

## Position Tracking export access check

Rankings and landing-page reads passed on a disposable target with collected
data. The native export request returned HTTP 403 with error code 1001, "action
is not allowed". The native UI's export menu states "Export is only available
for paid Semrush users" and offers an upgrade. The subscription page separately
confirms Guru and an active trial; the export denial remains an observation
about this session rather than evidence of a different SEO plan.
Unpublished export operations were removed rather than claiming positive live
verification. No purchase or alternate transport was used.

## Version 0.11.0 tracking alert verification

All seven new operations passed authenticated live calls. The owned target's
initial rule list and count were empty. Create returned an opaque string rule
ID; list readback confirmed the requested target, condition and threshold.
Update changed the condition and threshold, and deletion removed the rule.
The final list was empty and the count zero. Alert listing and total/unread
counts passed with no events on this new target. Weekly emails stayed disabled
and the keyword count stayed one.

The real Chromium/Galleton/HTTP fixture verifies positive alert rows, unchanged
unread state, native timestamp preservation, owner-authenticated rule lifecycle
and HTTP-200 native errors with credential redaction. One suite run began while
the fixture address example was being aligned with the native UI and failed its
exact body assertion. The corrected full run passed all 140 tests. TypeScript,
Oxlint, generated-reference checks and executable packaging passed. Three
independent simplification reviews found no further changes needed.

All 133 reads and 58 of 59 writes have live execution evidence across versioned
passes. Shared-project leave remains unverified. Alert detail and event writes
are not exposed; the native detail call marks an alert as read. The native
crawl-scheduling form requires SEO Tier 3. No purchase or email delivery was
performed. The owned project and tracking target were checked absent after
deletion. The first target read briefly retained the deleted resource; a later
read confirmed absence, with no repeated deletion. Unrelated account data was
preserved. Detailed evidence remains outside the repository.

## Version 0.10.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `f976508e23970262bbcd5bf57bc0fddd1243d2fdb865325547cfa77d121c6e1d`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38805930027)
passed source, docs and installation/setup on Linux, macOS and Windows.
Fresh packed and installed public npm processes advertised 185 tools and passed
authenticated reads. The global command reported 0.10.0. The first global
installation hit host disk exhaustion during dependency extraction; a clean
reinstallation passed after removing redundant verification artifacts.
The [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.10.0)
includes the archive and checksum. Both updated guides passed production
Chromium checks at 390px with their new headings, HTTP 200, no page errors and
no horizontal overflow.

## Version 0.10.0 settings and transfer verification

All five new writes passed authenticated live calls. Tracking edits changed the
business name, nonempty brand list, tracked address/type and volume setting.
Readbacks verified that omitted settings, target IDs, location, keyword count
and disabled weekly emails remained unchanged. Business-name clearing passed.
The native backend reported success for an empty brand array but retained the
old brands. The CLI rejects that request rather than claiming brand clearing.
The fixture's original settings were restored after these checks.

Selected keyword and cluster copies retained source rows. Moves removed their
selected source rows. Destination readbacks contained the expected seven rows.
The real Chromium/Galleton/HTTP fixture covers owner-aware selectors, partial
settings preservation, read-only refusal, malformed edit metadata, token
redaction and business-name clearing. All 138 tests, strict TypeScript, Oxlint,
generated-reference drift checking and executable packaging passed. Three
independent simplification reviews found no changes needed.

Across versioned passes, all 129 reads and 55 of 56 writes have live execution
evidence. Shared-project leave remains unverified. No purchase or outreach was
performed. Both owned transfer collections were checked absent through builder
and Saved Keywords reads. The owned tracking project and target were checked
absent after deletion. Each deletion briefly preceded its final read-side
visibility; no deletion was retried. Unrelated resources were preserved.

## Version 0.9.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `ccbfaa07df2c3dfac02fca37b533529b0b5b3109bde5c999b321ecb1522910fb`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38800422472)
passed source, docs and installation/setup on Linux, macOS and Windows.
The installed public release advertised 180 tools and passed authenticated MCP
reads. The global command reported 0.9.0. The
[GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.9.0)
includes the archive and checksum. The production keyword-list guide passed
HTTP 200 and a Chromium check at 390px without page errors or horizontal overflow.

## Version 0.9.0 seed-based strategy verification

All 15 new operations passed authenticated live calls. The owned strategy
completed with 10 topics and 243 pages. Native page/preset reads, paginated
clusters with disjoint pages, selected-cluster reads, page details, keyword
reads and text filters returned populated data. Favorite and removal passed
readback checks. Selected-cluster metric refresh passed; the explicit cluster
deletion removed its ID and reduced the page count.

Four native export selections each passed CSV, semicolon CSV and XLSX checks.
Full keyword and page-filter exports contained 1,979 rows; selected-cluster
exports contained two rows, and the selected-phrase export contained one row.
The roughly 3.9 MB CSV files passed complete MCP resource chunk reads. All four
XLSX files passed ZIP/workbook integrity checks. The provider uses numeric
format codes; an initial string-format probe failed visibly and the mapping
was corrected against the native client. No alternate transport was added.

The real Chromium/Galleton/HTTP fixture checks opaque export-ID encoding,
runtime-only credentials, missing-ID errors, favorite state, metric refresh,
cluster deletion and all export selection contracts. Three review passes found
one fixture clarity issue, fixed by decoding the favorite flag directly.

Across versioned passes, all 129 reads and 50 of 51 writes have live execution
evidence. Shared-project leave remains unverified. No purchase, subscription
change or outreach was performed. The owned seed strategy was deleted and its
ID checked absent; unrelated account data was preserved. Strict TypeScript,
Oxlint, generated-reference checks, packaging and all 134 tests passed.

## Version 0.8.0 published artifacts

The public npm archive matches the tested release archive:
SHA-256 `339548fca738c8223ef2920fc177f6b70c49d0e9f55bc13ab95aac2026b31a3e`.
The [CI run](https://github.com/Microck/semrush-cli/actions/runs/38797493837)
passed source, docs and installation/setup on Linux, macOS and Windows.
Fresh packed and installed public npm processes advertised 165 tools and
passed authenticated reads. The global command reported 0.8.0.
The [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.8.0)
is visible with its archive and checksum. The updated keyword-list guide
passed a production Chromium check at 390px: HTTP 200, new workflow headings,
no page errors and no horizontal overflow.

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
