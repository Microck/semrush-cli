# Verification

## Version 0.27.0 My Reports overview

The catalog contains 276 operations, 187 reads and 89 confirmed writes.
Typecheck, Oxlint, generated-reference checks, five daemon builds and all
214 tests passed on Raft. Three independent simplification reviewers found
no reuse, quality or efficiency issues in the reporting changes.

The fixed read-only GraphQL query returned HTTP 200 using the authorized Guru
session: Tier 2, 34 templates, zero saved reports, three Essential report slots
and an unaccepted reporting Privacy Policy acknowledgment. Source CLI and MCP
matched that independent native query exactly. MCP exposes read-only annotations.
Real HTTP fixtures cover a populated first page, pagination totals, schedule and
ready-task metadata, cookie rotation, GraphQL partial failures and access denial.
The live account's saved-report list was empty, so populated rows have fixture
evidence rather than live-account evidence.

Native constructor inspection used a query-only network gate. Title edits stayed
local and the account still had zero reports afterward. Saving and PDF generation
require an explicit policy acknowledgment, which remained unset. Creation,
saving, PDF generation and downloads remain unsupported. No report, purchase,
trial, email or policy acceptance was submitted.

## Version 0.26.0 Web Bot Auth

The catalog remains at 275 operations, 186 reads and 89 confirmed writes.
TypeScript, Oxlint, generated references, all five bundled daemon targets and
211 tests passed on Raft. Three independent simplification reviewers found no
changes needed. Stateful HTTP fixtures cover creation, retention, replacement,
explicit disabling, independent HTTP Basic choices, missing metadata, provider
business errors and redaction. CLI tests cover JSON files and stdin, offline
previews and invalid input before authentication.

A fresh native settings read on an owned disabled audit returned null Web Bot
Auth header fields. The first live source configuration failed at the boundary
before saving. The metadata schema and fixture now represent those native nulls;
retaining enabled authentication still requires nonempty Agent/Input strings.
The full source check passed again after this correction.

An isolated owned HTTPS site verifies Ed25519 signatures and returns HTTP 401
for unsigned or invalid requests and HTTP 200 for a valid signature. Source CLI
enabling and MCP retention passed. Native settings readback confirmed the saved
Agent/Input values. An omitted authentication choice failed before saving.
With manual scheduling, notifications disabled and a ten-page cap, Semrush's
crawl finished at five pages. The protected page returned HTTP 200 and its
title was `web bot auth signature verified`.
Source MCP replacement and re-enabling, CLI disabling, false/true settings
readbacks and authenticated doctor also passed.

[CI run 38989040473](https://github.com/Microck/semrush-cli/actions/runs/38989040473)
passed all five jobs, including docs and package installation on Linux, macOS
and Windows. The public npm and GitHub release archives match the CI archive
exactly. Its SHA-256 is
`4b3b380d1bae6c95fd05a3fd26fcb75d4abe4608b0a5f532854a64c5fd3b0264`.
Registry publication initially returned HTTP 202 and then cached 404 responses.
The normal version-based installation passed after propagation completed.

Fresh public npm CLI and MCP repeated enabling, retention, native header
readback and the five-page protected crawl. Replacement, disabling, re-enabling,
settings readbacks and authenticated doctor passed. The release is installed
locally as `semrush` v0.26.0. The owned project returned HTTP 404 after deletion,
its audit disappeared from campaign discovery and the original project remained
available. The temporary signed-site project and endpoint also returned 404.
The remote session, vault, signing key, credential file and session-bearing
native HTML/wire captures were removed.

## Version 0.25.0 native mind-map images

The catalog contains 275 operations, 186 reads and 89 confirmed writes.
TypeScript, Oxlint, generated references, all five daemon targets and 206 tests
passed on Raft. Three independent simplification reviewers found no changes
needed. Real browser fixtures cover both formats, native bytes and filenames,
cookie rotation, denied access and interrupted downloads followed by another
successful report. CLI validation checks formats, exact IDs and required output
paths before authentication.

A new owned structured strategy generated one topic, one page and seven
keywords from one seed. Its native web controls downloaded JPG and PNG. Source
CLI and MCP downloads matched those files byte for byte: JPG 145,656 bytes,
PNG 326,796 bytes, both 4336 x 2228. JPG has a white background; PNG preserves
transparency. MCP filename, MIME, size and chunked resource reads passed. The
CLI default JPG and saved-file receipts passed. Authenticated doctor passed.
A fresh public npm installation matched the exact CI and GitHub release archive.
Its CLI and MCP repeated both native-image comparisons and authenticated doctor
successfully. The owned strategy was deleted; its detail read failed and it no
longer appeared in the list. The original selected project folder remained
available. The remote session was forgotten, its vault removed and the runner's
short-lived ContentShake token deleted.

Separate content-workflow inspection opened the native Article and SEO brief
sidebars without submitting generation. Article submission explicitly offers a
7-day Content Toolkit trial at $60/month, so it was not submitted. Opening that
sidebar itself created an empty workspace linked to the selected project.
Creation timestamps identified it as this probe's resource. It was deleted;
workspace listing and by-folder HTTP 404 confirmed removal. The existing
project folder was not deleted. SEO brief generation and export remain
unverified. No trial was activated and no articles or SEO briefs were generated.

## Version 0.24.0 alert event commands

The source catalog contains 274 operations, 185 reads and 89 confirmed writes.
TypeScript, Oxlint, generated references and all 202 tests passed on Raft.
Five daemon builds passed before the final test-only review edits. Independent
simplification reviews prompted reuse of a fixture response helper and explicit
request cases in the denial test. No production behavior changed during review.

Three commands expose the current native alert requests. Opening one alert
returns details and marks it read; mark-all applies across pages in one target;
delete removes one selected event. Confirmation, offline previews, opaque IDs,
MCP mutation annotations and native timestamp units are covered. A stateful
authenticated HTTP fixture verifies unread-count changes, marking remaining
events read, deleting one while preserving another, missing-event failures and
HTTP-200 permission errors. These are positive fixture checks, not proof of
positive live event transitions.

Actual source CLI and MCP calls matched the native mark-all response on a new
owned target with no events. Both clients also matched native error code 9 for
missing-event detail and deletion requests. The authenticated doctor passed.
Three rules on the fresh target did not produce events during the bounded poll;
the prior owned fixture was already deleted. Positive live event transitions
remain unverified. The new owned project was deleted, its project read returned
404 and its tracking target became unavailable. The session was forgotten and
remote vault removed. Existing account projects and alerts were untouched.

## Version 0.23.0 All reports

The source catalog contains 271 operations, 185 reads and 86 confirmed writes.
TypeScript, Oxlint, generated references, five daemon targets and 200 tests
passed on the private ARM64 Raft runner. Three independent simplification
reviews found one unfinished-snapshot selection issue; it was fixed and the
full checks passed again. All compilation and browser verification ran remotely.

Real HTTP fixtures verify available reports, explicit omissions, exclusion of
unfinished comparison snapshots, metadata failures, provider denial, a changed
crawl, cancellation and subsequent authenticated reads. Archive tests verify
untouched file bytes, manifest contents, one public resource, private staging,
unreadable staged-file failure and cleanup after interrupted writes. CLI checks
require a fresh output path and reject invalid formats before authentication.
Source CLI and MCP native archive verification passed using a new owned audit
capped at three pages, with JavaScript rendering, manual scheduling and no
notifications. Its first crawl produced five-file CSV archives with comparison
explicitly omitted. After a second crawl, both clients produced six-file CSV
and XLSX archives including Compare Crawls and JS Impact.

All 34 independent native file comparisons passed. CSV bytes matched exactly;
XLSX workbook contents matched with only provider creation timestamps allowed
to differ. ZIP CRC checks, embedded manifests, snapshot pairs, CLI receipts and
bounded MCP resource reads passed. Only completed ZIPs appeared as MCP resources.
The authenticated doctor passed. The owned project was deleted and its remote
session forgotten and vault removed. These checks used the source build;
registry and release-archive verification is recorded separately.

## Version 0.22.0 JS Impact

The source catalog contains 270 operations, 184 reads and 86 confirmed writes.
TypeScript, Oxlint, generated references, all five daemon targets and 193 tests
passed on the private ARM64 Raft runner. Three independent simplification
reviewers found no changes needed. No local compilation or browser verification
ran on the controller.

Four read-only operations expose the native JS Impact guide, changed-page count,
filtered before/after page table and CSV/XLSX downloads. They reuse the existing
audit and download transports. A real HTTP fixture verifies pagination, empty
and nonempty filtered tables, native status and parameter encoding, and exact
export bytes. CLI checks reject invalid selections before authentication and
require an output destination. MCP advertises all four tools as read-only.

Native Guru research used a new audit capped at three pages, with rendering
enabled, manual scheduling and notifications off. Semrush marked JS Impact
available, returned one unchanged page row and generated CSV/XLSX exports.
A prior one-page crawl returned empty reports with availability false. These
outcomes distinguish crawl data availability from a subscription gate. The
owned research projects were deleted and remote credentials removed.

Source CLI and MCP JSON results matched native guide/count reads and five page
selections: defaults, unchanged, changed-title, a missing URL and a second page
with ascending order. The populated native selection contained one unchanged
row. Changed-title and missing-URL selections were empty. Both CSV exports
matched native bytes; MCP XLSX matched exactly and CLI XLSX matched all workbook
contents apart from the provider creation timestamp. The source fixture was
deleted and its remote session removed. Positive changed-row behavior has real
HTTP fixture coverage, not live-account evidence.

A fresh public npm installation matched the exact CI and GitHub release archive
and reported version 0.22.0. Its actual CLI and MCP repeated the native JSON and
CSV/XLSX checks successfully, and its authenticated doctor passed. The owned
three-page fixture was deleted. Project reads returned 404 immediately; the
audit returned 404 on a later independent read after an initial deletion delay.
The remote session was forgotten and its vault removed.

## Version 0.21.0 Compare Crawls

The source catalog contains 266 operations, 180 reads and 86 confirmed writes.
TypeScript, Oxlint, generated references, five bundled daemon targets and all
187 tests passed on a private ARM64 Raft runner. Three independent
simplification reviews found no changes needed. No local compilation or
browser verification ran on the controller.

`audit-export-compare` accepts two explicit, different snapshot IDs. Its native
request places the second ID before `/compare/` and the first ID afterward.
It defaults to CSV and also supports XLSX. The CLI preserves provider column
order and deltas. A real HTTP fixture verifies exact request fields, snapshot
ordering, filename and CSV bytes, including the native negative delta. Input
validation rejects identical, missing and malformed IDs.

Authenticated source CLI and MCP calls passed in both formats using two
existing completed 23-page snapshots. Native CSV bytes matched exactly. XLSX
workbook entries matched except Semrush's creation timestamp in
`docProps/core.xml`, which changes between independent requests. Both actual
CLI formats passed, and a same-snapshot command failed before authentication.
The authenticated CLI doctor also passed. Only reads ran against that existing
audit; no settings, crawls or account projects changed. The authorized session
copy and remote vault were removed after verification.

## Version 0.20.0 native Site Audit exports

The source catalog contains 265 operations, 179 reads and 86 confirmed writes.
TypeScript, Oxlint, generated references, five daemon targets and all 185 tests
passed on the private ARM64 Raft runner. Three independent simplification
reviews found no changes needed. Compilation and browser verification ran
remotely.

`audit-export-page-issues` downloads the campaign's latest completed crawl as a
page-by-issue matrix. `audit-export-markup` downloads a selected snapshot's
structured-data fields. Both support native CSV and XLSX. The existing
`audit-export-pages` remains the plain page-properties table.

Authenticated source MCP calls matched native downloads byte for byte for both
new reports in both formats. These read-only checks used an existing completed
23-page audit without changing settings or starting a crawl. The actual CLI
markup XLSX export matched every worksheet and other workbook entry. Only the
provider's creation timestamp in `docProps/core.xml` differed across the two
requests, five seconds apart. The original strict comparison failure and the
subsequent entry-by-entry comparison remain in private verification evidence.

Binary exports now use a separate scoped HTTP client with `maxRetries:0`.
Cancellation disposes that client without interrupting later report requests.
A stateful dropped-response fixture first proved that the old browser download
path repeated a committed disavow export. The corrected path records one write,
returns failure without an artifact and preserves later authenticated reads.
Another real HTTP fixture verifies exact export fields, CSV bytes and cookie
rotation between exports.

The source MCP also passed a native multipart disavow TXT export in a fresh
owned Guru test project. Its initial audit reached 541 checked backlinks before
unlocking. Importing two domain entries, reading them back, retrieving the native
TXT artifact and later account reads succeeded. The owned folder and attached
audit were deleted and each returned native 404. The authorized session copy and
remote vault were removed. Verification resumed from its journal while the audit
was scoring; no creation, import or export write was repeated.

CI run `38947506463` passed all five jobs, including package setup on Linux,
macOS and Windows. Its 14,470,521-byte package has SHA-256
`4470b9701899ca5d14fae62c168de18da88d4d60be686a83b784b79be520a8a2`.

Fresh native controls returned 404, `no endpoint for the requested path`, for
both crawled-links formats. Plain pages, markup and page/issue matrix downloads
from the same snapshot succeeded in both formats. Crawled-links, Compare Crawls
and All reports batch downloads remain outside implemented coverage.

## Position Tracking AI brand editor boundary

A fresh authenticated owner-limit read on 2026-10-16 confirmed Guru, 1,500
keywords, ten targets, zero prompts, `ai_seo_main:0`, SEO Tier 2 enabled and
Tier 3 disabled. Only read-only requests ran against an existing owned project.
No settings were changed and no subscription was purchased.

The cached native tracking 1.280.2 Settings component renders Manage brand names
only for the engine set `search-gpt`, `google-ai`, `gemini`. Google is excluded.
The typed HTTP helper forwards the editor's JSON unchanged. Earlier editor-shaped
writes against the Google fixture failed validation and preserved its settings;
they do not prove the AI editor's request contract or a subscription denial.
The AI editor remains unverified with this account's zero prompt allowance.

## Version 0.19.0 source scope replacement

The source catalog contains 263 operations, 177 reads and 86 confirmed writes.
TypeScript, Oxlint, generated references, five daemon targets and all 182 tests
passed on a private ARM64 Raft runner. Three independent simplification reviewers
found no changes needed. No compilation or browser-heavy checks ran on the
controller for this batch.

`backlink-audit-replace-scope` reads current campaign metadata, requires edit
permission and readiness, then sends one `domains.AddByProjectId` request with
saved settings. It requires an explicit scope and confirmation, marks the MCP
tool destructive and validates that the acknowledgement selects a fresh audit.
It rejects missing, unchanged, read-only or locked campaigns before writing.
Fixture cases preserve nondefault and explicitly cleared settings and verify
that the old audit ID becomes inaccessible.

A real dropped-response fixture caught Chromium replaying a POST after the
server committed it. Report requests now use the browser context's shared-cookie
HTTP client with `maxRetries:0`. That fixture now records exactly one replacement,
returns a failure and lets the caller read the newly selected audit. Responses
are disposed after parsing. All existing integration cases still pass.
The updated transport passed live Guru-account research, project, Backlink Audit
and Position Tracking reads, plus an authenticated CLI doctor in Raft.

The source MCP operation passed against the task-owned Guru project, replacing
scope both with nonwww. Empty brands, categories and countries remained empty;
manual scheduling and disabled recurring notifications remained intact in the
immediate selected-audit readback. A preceding settings edit temporarily locked
the audit; the first replacement command refused before writing. After readiness
returned, one replacement succeeded. It completed and unlocked with 573 checked
links while retaining the empty selections and disabled recurring settings.
A separate native root-to-both replacement already completed while retaining
nondefault settings, and its former root audit returned native 404.

These checks transfer only the authorized Semrush session to private Galleton
storage on Raft. The remote session and vault were removed after each live pass.
CI run `38937499626` passed all five jobs, including Linux, macOS and Windows
package setup. The public npm and GitHub archives match its 14,471,164-byte
artifact, SHA-256
`d851ad6efac261b6662a148d074e89572844b36d38bba85aa5b2b88437295f77`.
The local command reports `0.19.0` and its scope preview passed without a browser.
A fresh registry installation in Raft advertised all 263 tools, including the
scope replacement safety metadata. Authenticated account, owned-project and
audit-status reads, import and scope previews, and the public CLI doctor passed.
The temporary session and remote vault were removed afterward.
The task-owned verification folder and its attached audit were deleted and
returned native 404. The tracking target disappeared from authenticated campaign
discovery; its former detail endpoint returned access denied after deletion.
Unrelated projects were not changed. The reusable runner was stopped.

The GitHub npm publishing workflow passed its checks but its upload received
HTTP 404. The existing authenticated npm account then published the exact CI
archive with scripts disabled. npm accepted it for processing, after which
registry metadata and tarball checks passed. GitHub OIDC publishing remains
unverified; this release used the authenticated CLI publisher.

Version 0.18.0 verification: 2026-10-16. The source suite passed 178 tests in
CI and a private ARM64 Raft runner, including real Chromium, Galleton and
stateful HTTP fixtures. The public npm and GitHub archives match the CI artifact.
Live responses and credentials remain outside the repository. Evidence below
distinguishes local fixtures, native CI and real account execution.

## Version 0.18.0 backlink CSV import

The source catalog contains 262 operations, 177 reads and 85 confirmed writes.
`backlink-audit-import` stages the supplied CSV unchanged, validates its native
file descriptor and commits only a positive source-URL count. It requires a
ready, unlocked audit, confirmation and the campaign-specific upload endpoint.
Staging and finish calls are never retried.

Native staging accepted a one-column CSV containing one quoted source page URL.
The upload's success flag was `error:false`; successful native responses used
both `code:0` and `code:200`. A native Audit CSV export instead staged zero URLs
and was not committed. `backlinks.FinishUpload` returned `true`, followed by
`statusId:1` with `isLocked:true`. The temporary audit subsequently unlocked.

The actual source MCP operation passed in Raft with the same Guru session,
returned one staged URL and `result:true`, and preserved manual recurring
settings. The real CLI read the CSV through `--contents-file`, committed one URL
and retained `recrawl:"never"`. File-input preview and an authenticated remote
doctor also passed. Only the authorized Semrush session was transferred to the
private runner for those checks; its copy was removed after verification.
Fixture coverage checks exact BOM/CRLF bytes, endpoint query preservation,
write ordering, one commit, lock refusal, foreign-endpoint refusal, zero URLs
and malformed staging. Project-wide TypeScript, Oxlint, generated-reference
checks, all five bundled daemon builds and all 178 tests passed remotely after
matching the native response contract.

CI run `38915454726` passed the source check, docs build and Linux, macOS and
Windows package checks. The npm and GitHub downloads are identical to its
14,468,097-byte package, SHA-256
`7acf34e3e743d051e0cbd708988af53f9fae4d1609d2c7ba100dddca5a679ecf`.
A fresh registry install in Raft advertised 262 tools, 177 reads and 85 writes.
Authenticated account, owned-project and audit-status MCP reads, an import
preview and the public CLI's doctor passed. The temporary session was forgotten,
its Galleton vault was removed, and the runner was stopped. The installed local
command reports `0.18.0`.

The import fixture also served the scope-replacement verification described above.
A subsequent root-to-both atomic creation completed while retaining the
nondefault brands, category, country and manual schedule. Its prior audit ID
returned native 404. The source scope-replacement workflow is covered above.

## Version 0.17.0 Guru Backlink Audit extensions

The source catalog contains 261 operations, 177 reads and 84 confirmed writes.
This batch adds six reads and six writes: target-page tables/counts, labels and
counts, numeric comment reads, native CSV, comment lifecycle, target-label
association/removal, campaign-label deletion and rerun control.

A disposable campaign completed with 579 checked links and 26 target-page
groups. All six reads passed live source MCP calls. Comments passed
create/read/update/delete with a stable numeric ID and Unicode text. Labels
passed two associations, selected removal with the sibling retained, filtering
and campaign-wide deletion. These test comments and labels were removed.

The account confirms Guru SEO entitlement alongside an active trial. The UI
CSV button's subscription dialog did not predict backend access: native
`backlinks.StartBacklinksCSVExport` returned a filename and the header-authenticated
download returned HTTP 200. The source MCP resource matched the provider's
647-byte, filtered CSV exactly. Fixtures additionally verify pending HTTP 202
polling, a UTF-8 BOM, an attachment-free text response and HTTP 403 refusal.
No job creation is retried, and MCP marks this read as non-idempotent.

Scope replacement remains unexposed. Native `domains.ApplySettingsScope`
created a fresh audit and reset manual scheduling to two weeks with email
notifications enabled. The owned fixture's manual settings were restored.
`domains.AddByProjectId` accepts manual settings atomically but also starts a
fresh audit for an existing scope; the original audit ID subsequently returned
404. A settings-preserving scope-change workflow has not been verified.
The native rerun returned `true` for the ready owned audit and preserved manual
scheduling and disabled notifications. A following source MCP call encountered
`isLocked:true` while status remained 1 and settings were unlocked; Semrush
rejected the write with HTTP 409. The rerun preflight now checks the separate
audit lock, and its fixture verifies refusal without sending the write.
The updated source MCP server then refused the separate audit lock before
sending another write.

TypeScript, Oxlint, generated-reference checks and all 29 workflow-parameter
tests passed locally. A broader local integration run passed 57 of 59 tests;
the two export failures coincided with full host swap. An isolated debug run
passed the HTTP denial case. The cancellation trace showed browser setup using
about 28.5 seconds of the test's 30-second deadline, followed by successful
cancellation and an account read after the deadline. Assertions and deadlines
were not weakened. A healthy CI full-suite run remains required.

Three independent simplification reviewers found one redundant fixture scope
field, which was removed, and no reuse issues. The efficiency reviewer noted
that the shared export pipeline buffers GET responses as browser Blobs. A native
download alternative was not applied because preserving response validation,
header authentication and job polling requires a separately verified redesign.

[CI run 38888496388](https://github.com/Microck/semrush-cli/actions/runs/38888496388)
passed all 175 tests, TypeScript, lint, generated reference, Fumadocs and
package setup on Linux, macOS and Windows. The tested archive is 14,466,572
bytes with SHA-256
`5c102a7bac0a0b00677ea175882bdcf67ad1bcb2d98f82b2b9d9ce2d4abf8819`.
The visible [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.17.0)
has a matching archive digest. The public npm archive matches the tested CI
archive byte-for-byte. Publication initially entered asynchronous processing;
a cached tarball 404 expired after its advertised 300-second lifetime.

Installing the tested CI archive returned version 0.17.0 and passed live
`doctor`. Its MCP server advertised 261 tools, 177 reads and 84 writes.
Authenticated account, limits, campaign, keyword, target-page, label, comment
and CSV calls passed. Installed CLI saving and MCP reconstruction produced
identical 677-byte CSVs for the same selected backlink; saving to an existing
destination failed and left its bytes unchanged. An initial verification probe
sent an empty comment-ID selection, which the public schema correctly refused;
the corrected probe used a previously deleted owned comment ID. A fresh public
registry installation returned 0.17.0 and passed authenticated `doctor`.

The production guide and coverage page passed real Chromium at 390px with
HTTP 200, no page errors and no horizontal overflow. Existing font, purple
theme, supplied logo and README GIFs were preserved. The owned extended test
project was deleted; folder HTTP 404 and Backlink Audit discovery confirmed
absence. No existing account resource was changed, outreach sent or connection
added. A separate bounded native Backlink Analytics CSV request returned HTTP
403 with the Guru session, so its coverage remains distinct from Audit CSV.

## Version 0.16.0 Backlink Audit

Version 0.16.0 adds 39 Backlink Audit operations: 29 reads and ten
confirmed writes. The source catalog contains 249 operations, 171 reads and
78 writes. Three independent simplification reviewers found no worthwhile
changes. A full run passed 165 tests and failed one new assertion that expected
the wrong validation-error wording. The corrected assertion separately checks
missing selection and explicit all-false selection; its focused rerun passed. A final local full run stalled under full host swap
and was stopped; CI is the required complete release check.

The same signed-in account confirms Guru SEO entitlement and an active trial.
Backlink Audit's CSV button opens a subscription dialog saying that free and
trial users can export only a disavow file. At that release, CSV had not been verified and remained unsupported. The
unreleased pass above establishes native CSV access for the same Guru account.

An owned `httpbingo.org` campaign finished with 581 checked links. All 29 reads
passed authenticated CLI/MCP calls. Nondefault authority, category, anchor,
link-type, link-attribute, text, new/error and toxic-marker filters returned
native counts. Domain, individual-link and network moves passed destination
reads and restoration checks. Network IDs come from a row's `linkNetworks`
array, not its URL hash or string selection ID.

Partial settings changed only supplied fields. Nonempty categories and countries
passed, including the native string serialization of numeric category IDs.
Explicit clearing and restoration passed. Empty brands disappear from the
native response; categories and countries remain empty arrays. Source MCP
campaign creation passed on a second owned project, using Semrush's recommended
brands/categories/countries and manual recurring settings. Creation echoes
false notification/Majestic flags; a subsequent info read omits those false
fields while retaining `recrawl:"never"`.

Native TXT file import returned HTTP 200 with an empty acknowledgement, then
parsing completed. A replacement import removed a prior imported URL omitted
from the new file, proving that import is destructive rather than a merge.
CLI TXT saving and MCP artifact reconstruction passed. Export changes Semrush's
entry/export metadata and therefore requires confirmation. No file was uploaded
to Google.

A real MCP disavow move returned a selected backlink to review, and deleting
one imported domain preserved its sibling. Native file-source bulk clearing
emptied the remaining import. The native UI's intercepted, aborted clear request
established the three explicit source flags. The real Chromium/HTTP fixture
verifies the CLI/MCP clear operation. Its live MCP verification timed out before
the first read under full host swap; no ambiguous clear write was retried.

Both owned projects were deleted and Backlink Audit discovery confirmed their
absence. The first cleanup used an isolated context on the existing authorized
browser after local browser launches timed out. Its original context, login and
configuration were preserved. Deletion acknowledged HTTP 200; a subsequent
folder read returned HTTP 404 and campaign discovery showed absence. Existing
account resources were untouched. Detailed journals remain private.

[CI run 38867866346](https://github.com/Microck/semrush-cli/actions/runs/38867866346)
passed all 166 tests, lint, TypeScript, the Fumadocs build and package setup on
Linux, macOS and Windows. The public npm archive matches the tested CI archive
byte-for-byte: 14,462,939 bytes, SHA-256
`cd43b29d58c7f02e6ce130408f51c2f9332449a87ca6c67dbf37d7b98513b3b8`.
The visible [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.16.0)
has matching archive/checksum asset digests.

A fresh global registry installation returned version 0.16.0 and passed live
`doctor`. Its MCP server advertised 249 tools, 171 reads and 78 writes. Account,
Backlink Audit limits/campaigns and keyword reads authenticated. The installed
CLI preview preserved the native category-string encoding. Production Backlink
Audit and coverage pages passed Chromium at 390px with HTTP 200, no page errors
and no horizontal overflow. Existing logos, fonts, theme and GIFs were preserved.

## Version 0.15.0 protected audits and URL lists

The current Site Audit wizard and a native UI upload established the multipart
`file-urls` contract. CLI/MCP uploading returned a successful native status and
a positive URL count. The wizard's enum confirms 0 website, 1 robots.txt
sitemap, 2 custom sitemap URL and 3 uploaded list. Its file component updates
only campaign-bound list metadata; the returned filename is not a sitemap URL.

HTTP Basic credential creation and replacement passed native settings reads.
An edit with omitted credentials retained authentication. A crawl capped at ten
pages finished at six and returned HTTP 200 for the protected HTML page in the
uploaded list. Earlier two- and five-page caps reached their limits during
root/robots/llms discovery checks and did not verify that page. Authentication
explicitly disabled passed a readback. All owned verification projects were
deleted and their project and audit IDs checked absent afterward.

The provider ignores a separate audit name, so the commands no longer accept
it. Project naming remains `project-update`. Protected audit edits require an
explicit authentication choice. Google Analytics and Web Bot Auth settings
still require the web UI and cannot be overwritten by these commands.

The suite checks secret files, stdin, interruption, native multipart bodies,
HTTP-200 business failures and secret redaction. Three independent
simplification reviewers found no worthwhile changes. A repeat full run during
host swap exhaustion timed out in browser tests. Its timeouts remain unchanged;
[CI run 38849966964](https://github.com/Microck/semrush-cli/actions/runs/38849966964)
passed all 157 tests, lint, TypeScript, the docs build and package installation
on Linux, macOS and Windows. The concurrent local docs build was stopped.

The public npm archive matches the CI package byte-for-byte. Its SHA-256 is
`e5668b219a4138aa7805ce4111123ccb199ee29a5f93a30088094d30819f5fa9`.
The visible [GitHub release](https://github.com/Microck/semrush-cli/releases/tag/v0.15.0)
has the same archive and a verified checksum file. A fresh global registry
installation returned version 0.15.0. Its live `doctor` authenticated and
identified the account; MCP advertised 210 tools and passed account and keyword
reads. Installed stdin/file previews preserved uploaded text and redacted the
password. The production Site Audit and coverage pages passed mobile Chromium
checks at 390px with HTTP 200, no page errors and no horizontal overflow.

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
