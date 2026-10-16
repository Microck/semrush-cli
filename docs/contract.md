# Command contract

The executable is `semrush`; the npm package is `semrush-cli`. Only `semrush` is installed as a command. Node.js 22 or newer.

- `semrush reports [--json]` lists the research reports and project operations.
- `semrush <report-name> --<parameter> <value> [--json]` executes one report. Names and flags use hyphens. `semrush <report-name> --help` shows its complete schema-derived options. Objects and arrays use JSON. Report definitions live in `src/report-catalog.json`.
- `semrush auth import --cdp-url http://127.0.0.1:9234` imports an authorized existing Chromium session into Galleton. No secret-valued command arguments. Import verifies the signed-in session before storing it. Reimport explicitly replaces the CLI's own session with revision checking.
- `semrush auth login` opens an isolated visible browser, waits for sign-in, and stores its cookies in Galleton. Requires a graphical desktop.
- `semrush auth status [--check] [--json]` shows Galleton metadata without credentials. `--check` verifies Semrush access and adds `account.email` from authenticated server metadata, or null when the provider omits it.
- `semrush auth logout` forgets only the selected Galleton profile. It does not log out other browsers.
- `semrush setup` installs Chromium. It also initializes and starts the private Galleton daemon.
- `semrush mcp` runs the stdio MCP server. Stdout contains only protocol messages. MCP exposes the same operations and schemas. Mutations carry readOnlyHint=false and require confirm=true. Delete and leave carry destructiveHint=true. It cannot log in or change local configuration.
- `semrush doctor [--json]` verifies Galleton, stored session, browser, and an authenticated account report. Success includes `account.email`; it does not infer a subscription tier from generic billing metadata.

A session check redirected to `/multilogin/` fails before a report is sent,
with instructions to resolve the native session-confirmation page and reimport
the browser. The CLI never submits session takeover automatically. Login
redirects still fail as expired sessions. CLI and MCP share these checks.

Successful reports are `{authenticated: true, report: <underscore_name>, data: ...}`. Raw report nesting and provider totals remain visible. Integers outside JavaScript's safe range become decimal strings. Credentials are removed recursively. JSON goes to stdout; human diagnostics and errors go to stderr. No prompts in report or MCP commands. Exit codes: 0 success, 1 service/authentication/report failure, 2 invalid usage, 130 interrupted CLI command. No retries of report requests, which can consume account allowances. No automatic anonymous fallback.

Configuration: `SEMRUSH_GALLETON_URL` (literal loopback HTTP, default `http://127.0.0.1:8771`), `SEMRUSH_GALLETON_TOKEN_FILE` (default `~/.local/share/semrush-cli/galleton/api.token`), `SEMRUSH_SESSION` (default `semrush-cli`), and `SEMRUSH_BROWSER_EXECUTABLE` (optional absolute Chromium path). Authentication is loaded from Galleton into a fresh, transient browser context for each CLI process or MCP server. No persistent plaintext cookie file. Cookie updates from the report browser are captured back into Galleton. Existing reference browser profiles and services are never modified.

Internal web endpoints may change. Account quotas, mobile/history permissions and product restrictions apply. Galleton cannot manufacture a renewal token. The bundled static Galleton provider stores cookies without automatic renewal. Semrush validates authentication before each report. Reimport or sign in again when the session expires. See `docs/architecture.md` for the documented daemon extension.

## Projects

Projects use the current web UI's folder IDs, not legacy SEO project IDs.
`project-create --name <name> [--domain <domain>] --confirm` creates one project.
It does not start crawls, share the project, or configure SEO tools.
`project-get --folder-id <id>` reads its metadata.
`project-update --folder-id <id> --name <name> --confirm` renames it.
The optional `--domain` adds a domain to a project that has none. Semrush rejects
changes to an existing domain, as in the web UI.
`project-delete --folder-id <id> --confirm` permanently deletes that project.
`project-leave --folder-id <id> --confirm` leaves a shared project.
`project-set-tags --folder-id <id> --tags '["client"]' --confirm` replaces its tags.
`project-pin --folder-id <id> --pinned [true|false] --confirm` changes pin state.
`project-limits`, `project-tags`, `project-check-domain --domain <domain>`,
`project-toolkits --folder-ids '["id"]'` and
`project-tools --folder-id <id> --tools '[23,31]'` read the dashboard's data.
`project-enable-seo --folder-id <id> --confirm` creates its SEO project.
`project-seo-auto-setup --folder-id <id> --confirm` starts the web UI's automatic
SEO setup, including Site Audit and Position Tracking. Account quotas apply.

Every mutation requires explicit `--confirm` or MCP `confirm:true`. Without it,
the command fails with exit 2 before opening a browser. `--dry-run` or MCP
`dry_run:true` validates and prints the exact request without authentication or
network access. Dry runs need no confirmation. IDs are decimal strings and never
arbitrary paths. No operation retries a write. The response envelope remains
`{authenticated:true, report, data}` for all completed operations.

## Keyword Strategy Builder lists

`keyword-lists` reads the builder API's paginated baskets. Regular collections
can also appear in Saved Keywords with the same underlying ID. The two APIs
use different field names and ID representations.
`keyword-list-create --name <name> --confirm` creates an empty regular list.
It does not generate a strategy or start clustering. Read commands inspect list
metadata, keywords, summary, tags, clustering forecast and clustering status.
Writes rename/delete a list, import/delete keywords, undo a deletion, add/remove
tags, request metric updates and explicitly start clustering.

List-scoped operations take `--basket-id` and `--owner-id`. Both come from
`keyword-lists` (`BasketID` and `Owner.ID`). Builder IDs are safe JSON integers;
the schema rejects values beyond JavaScript's exact integer range. Project
folder IDs retain their separate decimal-string contract. Keyword selections
use a JSON array of phrases plus a database flag. Advanced filters use the web
client's documented field names and preserve pagination and sort controls.

All writes require confirmation and support dry runs before authentication.
RPC previews omit runtime credentials; the browser adds them only at execution.
Only fixed catalog RPC methods are exposed. There is no arbitrary RPC command.
Clustering and metric updates consume account allowances and never run
implicitly when creating or importing into a list.

`keyword-strategy-create --name <name> --domain <domain> --confirm` explicitly
starts generation of a structured strategy. `--seed-keywords` accepts a JSON
phrase array; supply a domain, at least one seed phrase, or both. Optional
competitors and database selection match the web creation request. This consumes
the clustering allowance. It is separate from empty regular list creation so no
read or ordinary list-create command starts generation implicitly.

## Site Audit

Enable SEO with `project-enable-seo --folder-id <folder-id> --confirm`. Use the
returned numeric SEO project `id` as `--campaign-id`; it is not the folder ID.
`audit-create --campaign-id <id> --domain <domain> --confirm`
saves settings for a fresh audit and refuses an existing one. It does not start
a crawl. Before creation, `audit-info` returns HTTP 404.

`audit-configure` replaces an existing site configuration. Include every
setting you want to retain; omitted settings take their schema defaults. It
requires an explicit `auth_enabled` choice for a protected audit. Google
Analytics and Web Bot Auth connections remain protected from replacement.
`audit-start --campaign-id <id> --confirm` launches with the saved settings and
consumes crawl allowance. Defaults are manual scheduling and email disabled.
Explicit recurring schedules create future runs; `--notify` enables emails.

`audit-limits`, `audit-campaigns`, `audit-info`, `audit-status`, `audit-snapshots`
and `audit-snapshot` inspect campaigns and results. Snapshot IDs are opaque
strings, unlike numeric campaign IDs. Use the exact returned string. All writes
require confirmation and support a dry run before authentication. Detailed
issue/page tables and stop controls are documented below. Connected integrations remain in the web UI.

## Position Tracking

`position-campaigns` discovers targets grouped by SEO project. An SEO project ID
is distinct from its dashboard folder ID. Tracking campaign IDs are composite
strings such as `123_456`, returned by `position-create` or `position-campaigns`.
`position-locations --query <text>` resolves targeting location IDs.
`position-limits --project-id <seo-id>` reads the owner's keyword/target limits.

`position-create --project-id <seo-id> --domain <domain> --keywords '["phrase"]'
--location-id <location-id> --confirm` creates one explicit tracking target.
Optional engine, device, language, URL type, time zone and business/brand settings
match the web wizard. Weekly email defaults to off. Creation starts tracking and
consumes target/keyword allowance. It never buys an add-on. Confirmed keyword
addition/deletion and tag changes use the web client's incremental state API.
Changing competitors replaces the configured competitor list explicitly.

AI engines require the provider's prompt allowance. A plan refusal remains an
error and is not evidence that an AI tracking request succeeded. The CLI never
uses the web client's automatic billing flow. Every write supports a dry run
before acquiring credentials.

## Detailed Site Audit results

`audit-pages` reads the current crawled-page table with zero-based pagination,
filtering and sorting. `audit-page` reads one exact page ID returned by that table.
`audit-issue` reads the affected-page rows for an issue ID from `audit-snapshot`,
using one-based pagination and the exact snapshot ID. IDs remain exact strings
where the provider uses values larger than JavaScript's safe integer range.
`audit-structure`, `audit-performance`, `audit-linking` and `audit-history` read
structural, performance, linking and progress data.

`audit-recrawl` explicitly recrawls one page and consumes allowance. `audit-abort`
discards an active crawl; `audit-finalize` stops it and keeps collected results.
Both require confirmation and check the current `is_allowed_stopping` state before
sending the action. `audit-execution --campaign-ids '[123]'` exposes that state.
A successful stop action returns `data: null`; inspect the campaign afterward.
No read starts or stops a crawl. Page IDs must be read again after a new crawl.

## Export files

Site Audit export commands download the provider's CSV or XLSX file. CLI calls
require `--output <path>` and refuse an existing destination. Stdout remains a
JSON receipt; downloaded bytes are never mixed with JSON or terminal messages.
The file is saved before the transient browser and temporary export storage close.

MCP export tools return `data: null` plus an `artifact` descriptor containing its
URI, suggested filename, MIME type and byte size. Resources remain available for
that MCP process's lifetime. `resources/read` accepts optional `offset` and `limit`
query parameters on the returned URI. The default chunk is 64 KiB, with a maximum
of 1 MiB per read. This keeps large exports out of tool-response text. Only files
created by this runtime can be read; arbitrary filesystem paths are not exposed.


Position Tracking report reads use fixed `/tracking/web-api/reports/` routes,
YYYYMMDD date bounds and repeated `competitors[]` query parameters. Sort keys
use the web client's bracketed `sort[field]`, `sort[order]`, `sort[date]` and
`sort[competitor]` names. Campaign info, tag and limit reads use the current
management API. `position-overview` returns tracked keywords and their tags;
the similarly named analytics keyword-suggestion endpoint is not a tracked
keyword list and is not exposed for that purpose.


## Saved Keywords collections

Saved Keywords uses `/apis/v4-raw/saved-keywords/api/v0/`. Regular collections
can share underlying basket IDs with the builder API. This API accepts list
and keyword IDs as exact decimal strings; the builder API accepts `BasketID`
and `Owner.ID` as its separate request fields. Collection management, import, keyword selection, tags, workflow
labels, copy/move, deletion and undo use cookie-authenticated JSON POSTs.
Account info and limits are reads; metric refresh consumes update allowance.
No collection operation generates content or sends sharing invitations.

Reads accept the current FilterQL string and native pagination/sort settings.
Keyword writes require either a nonempty explicit keyword-ID selection or a
nonempty FilterQL predicate, plus confirmation. Missing or ambiguous selections
fail before authentication; writes never default to selecting the entire list. Copy/move require different
source and destination lists. Database country codes map to the current Saved
Keywords numeric IDs. Quotes in generated FilterQL string literals double;
decimal IDs remain exact rather than passing through JavaScript numbers.

CSV, semicolon CSV and XLSX exports use the provider's JSON POST download API,
with the same CLI output-file and bounded MCP resource contract as audit exports.
The browser buffers the provider response as the web UI does; temporary Blob
URLs and Chromium download files close with the local export scope.
The current client source is
`https://static.semrush.com/saved-keywords/284.e7381245bc9d543ed5e4.js` and its
FilterQL serializer is module 5434 in
`https://static.semrush.com/saved-keywords/92.9eafacff2527f293603a.js`.

## Domain-based strategies

The current Keyword Strategy Builder client uses a distinct `/ksb/rpc` API for
its domain-based strategies. This is a different resource from seed-based
`/kwm/rpc` baskets. `audit.ListV3` accepts ownership (`all`, `own`, `direct`,
`corporate`), `sortBy` (`name`, `updatedAt`), `sortOrder` (`asc`, `desc`),
`nameFilter`, `limit` and `offset`. `audit.Summary` uses `nameFilter`.
`audit.GetV3` reads one numeric `id`; `audit.GetStatus` reads an `ids` array.
The API uses session cookies and runtime `Api-Key` / `User-Id` headers.
Credentials do not belong in user input or request previews.

The domain create contract is `audit.Create` with `domain`, `seedPhrases`,
`database` and an empty `geoMarkers` array. Geographic-marker search from the
client returns method-not-found on the live backend and is not exposed. Creation starts strategy generation and consumes
normal account allowance. Rename (`audit.Rename`, `id` and `name`) and delete
(`audit.Delete`, `ids`) are explicit confirmed writes. These commands do not
route through basket operations or convert one resource kind into another.
The client source is
`https://static.semrush.com/keyword-manager/kwm_app.6eb464ecf5da670e7285.js`.

Domain strategy result browsing uses the current audit client:
`https://static.semrush.com/keyword-manager-assets/audit/audit_482.e09c649386cc9b95bd32.js`.
`audit.GetPresetCounts` reads `id`. Page list and summary use `auditId`, `preset`
(1 all, 2 improve, 3 create), and filters with nullable `textSearch`, nullable
integer min/max ranges for `potentialVolume` and `difficulty`, and
`primaryIntent` (1 informational, 2 navigational, 3 commercial, 4 transactional).
Page lists add `limit` and `offset`. `page.GetV2`, `page.GetURLs` and
`page.GetSERPAnalysis` read a page `id`. Existing and recommended keyword reads
use `pageId`; keyword deletion uses explicit numeric `ids` and confirmation.

`export.GetAudit` returns a download URL for `filename`, `format` (`csv`, `csvs`
or `xlsx`), `auditId` and those filters. It exports the filtered strategy,
without a page preset. The CLI accepts only provider URLs on its Semrush origin
or the native semrush.com alias, under `/ksb/export/`. URLs never become tool
output. GET files use native browser downloads, matching the UI and avoiding
the alias's browser CORS restriction. JSON POST exports use a fetched Blob.
Each export owns a temporary browser page; closing that scope aborts pending
network work and releases its Blob URLs, listeners and native download file.

## Seed-based strategy pages and exports

Seed-based `/kwm/rpc` baskets retain `BasketID` and `OwnerID` selectors.
The current client uses `baskets.BasketGetPagePresetCounts`,
`baskets.BasketGetPages`, `baskets.BasketGetClusters`,
`baskets.BasketGetClustersByIDs`, `baskets.BasketGetClusterKeywords` and
`baskets.GetPage`. Pages return topics and page totals; flat cluster reads add
`ParentID`, one-based `Page`, and an array of `Order` clauses. Presets use native
integer codes 1 through 5; read the current preset counts rather than reusing
the domain API's codes. Page and cluster IDs are numeric safe JSON integers.

Page filters have `Phrase`, `TopicName`, `Volume`, `Difficulty`, `Intents`,
`Includes` and `IsFavorite`. String/number predicates use `IsInverted`,
`Operation` and `Value`; intent predicates use `IsInverted` and `Value`.
`IsFavorite` is an object with a boolean `Value`. Page ordering uses
`seed_relevancy`, `metrics_score_v2`, `kdv`, `volume`, `kd` or `keywords`.

`baskets.SetFavoritePage` and `baskets.ResetFavoritePage` use a selected page
`ID`. `baskets.BasketDeleteClusters` and
`baskets.KeywordsRequestUpdateByClusterIDs` use explicit `ClusterIDs` arrays.
All require confirmation; deletion is destructive. Metric refresh consumes
the account allowance. `baskets.BasketGetClustersUpdated` reads those IDs.

Four native export contracts return `ExportID`:
`export_v2.ExportKeywordsByFilter`, `export_v2.ExportKeywordsByIDs`,
`export_v2.ExportKeywordsByClusters` and
`export_v2.ExportKeywordsByClusterIDs`. They use integer `Format` (0 XLSX, 1 CSV, 2 semicolon CSV) and `Filename`. Keyword selections use phrase/database `KeywordIDs`;
cluster selections use numeric `ClusterIDs`. Filtered keyword exports use the
keyword filter contract; page exports use the page filter contract.

The browser constructs the fixed `/kwm/download-export-v2` address with runtime
`userId`, `apiKey` and the returned `exportId`. Neither credentials nor that
address appear in previews or tool output. Native GET downloads return the same
CLI file and MCP resource artifacts as other exports.

## Position Tracking settings edits

`position-configure` changes only supplied domain/URL, URL type, business name,
brands or search-volume type. Changing the tracked address requires both
`domain` and `url_type`. Empty business names explicitly clear that field. Brand edits require a
nonempty selection: the current native backend acknowledges an empty brand
array without clearing existing brands. Engine, device, language and location are not changed by
this operation. Every write requires confirmation and supports an offline
preview of the requested changes.

The adapter reads current campaign info once to preserve omitted fields, then
reads fresh `/tracking/hashes?id=<campaign-id>` metadata. It sends a fixed JSON
POST to `/positions/api/campaign_edit_domain_settings` with `campaignId`,
`domain`, `type`, `businessName`, `brands`, `volume_type` and runtime-only `key`,
`display_hash` and `rnd`. The web client maps the edit hash/random values
directly, without client-generated signing. Internal hash metadata is omitted
from report output. No billing or target-replacement endpoint is used.

The current primary source is
`https://static.semrush.com/position-tracking/wizard/1.83.0/178.23740a9e0638b7faf3dd.js`.

## Explicit basket transfers

Selected keyword and cluster copy/move use the native
`baskets.CopyKeywordsByIDs`, `baskets.MoveKeywordsByIDs`,
`baskets.CopyKeywordsByClusterIDs` and `baskets.MoveKeywordsByClusterIDs` RPCs.
Requests contain nested `SourceShareID` and `TargetShareID`, each with
`BasketID` and `OwnerID`. Source and destination must be different baskets.
Keyword selections are nonempty phrase/database `KeywordIDs`; cluster
selections are nonempty numeric `ClusterIDs`.

Copy leaves the source selection intact. Move removes selected source keywords.
Both require confirmation and explicit source/target owner IDs. Permissions and
destination keyword limits remain provider-enforced. These operations never
create projects, invite another account or send content to tracking products.

## Position Tracking alerts and trigger rules

The fixed `/tracking/alerts/` JSON POST endpoint uses a catalog-owned
`request_type`, runtime-only `key` and the selected `campaign_id`. List/count
reads use `alert_list_read`, `alert_items_count`, `trigger_list_read` and
`trigger_items_count`. Alert listing takes explicit page/display-limit values.
Native timestamps and envelopes remain unchanged. Nonzero native `error_code`
values must fail even when HTTP status is 200.

Confirmed trigger create/update/delete use `trigger_create`, `trigger_update`
and `trigger_delete`. Trigger bodies contain the exact ASCII tracked address or competitor URL, one
of the five native position conditions, integer threshold 1-100,
`parameter:"position"` and `scope:"all"`. Updates include the selected trigger
ID in both the outer request and the body, as the native editor does. Trigger
IDs remain strings. The native UI maps `campaign_url` directly from
`position-info` data.campaign_settings.tracking_url. Rules do not enable weekly emails or schedule email exports.

`alert_read` marks an alert as read in the native backend. It is deliberately
excluded from read-only report tools. This batch does not expose alert event
mutation, account-wide schedules, purchases or outreach.

Primary sources are the tracking 1.280.2 entry module's GlobalStore and Main
modules and `lazy/components/firstTriggerModal.e1bff77a57ae04ec2e14.js`.
The native crawl-scheduling form disables saving unless the account has SEO
Tier 3; scheduling remains outside this batch pending account capability proof.

## Position Tracking export access

The Guru account's native export menu states that exports require a paid
Semrush subscription. A native report export returned HTTP 403 with error code
1001, "action is not allowed". These exports remain unexposed and unverified;
no alternate transport or subscription purchase was used.
The subscription page confirms both "Guru, Subscribed" and "Trial active".
Neither trial status nor overview billing flags establish a different SEO plan.

## Protected Site Audit and URL lists

`audit-create` and `audit-configure` accept `auth_enabled`, `auth_username`
and `auth_password`. A new protected audit requires both credentials.
The project owns its name; use `project-update` to rename it. Audit settings
do not expose a separate name that the provider ignores.
Credential updates require both fields and `auth_enabled:true`. A protected
audit edit requires an explicit `auth_enabled` choice; true with omitted
credentials sends the native empty-field keep-existing request, while false
explicitly disables authentication. Existing Google Analytics and Web Bot Auth
connections remain protected from settings replacement.

The CLI reads `auth_password` through `--auth-password-file <path>`; `-` reads
stdin. It removes one final line ending and preserves other whitespace. MCP
accepts the string directly with JSON Schema `writeOnly:true`. Passwords are
redacted in dry runs, provider errors and successful responses; protected-site
credential fields are never returned by report reads.

`audit-urls-upload` sends a text or CSV URL list through native multipart POST
`/siteaudit/api/campaigns/{campaign_id}/settings/urls/upload?key=<runtime-key>`.
The file field is `file-urls`. CLI input is `--contents-file <path>` or `-` for
stdin; MCP input is `contents`. `filename` defaults to
`semrush-crawl-urls.txt`. Upload requires consent and returns the native
filename and count. It does not configure or start a crawl. The upload belongs
to the campaign; its filename is display metadata, not a sitemap URL. Set
`crawl_source_type:3` in an explicit audit settings save, leave
`crawl_source_url` empty, then start the crawl separately.

Primary reference: the current Site Audit wizard chunk
`6543.8fd07665f4ecb251ca39.js`, its settings serializer, and its native
`file-urls` XMLHttpRequest upload. The public
[configuration manual](https://www.semrush.com/kb/539-configuring-site-audit)
describes protected-site credentials and all four crawl sources.

## Position Tracking distribution and target comparison

Rankings distribution and competitor discovery use fixed GET paths
`/tracking/web-api/reports/rankings_distribution` and
`/tracking/web-api/reports/competitors`. They preserve native result
objects rather than rendering charts. Distribution selects explicit competitors
without report pagination. Competitor discovery retains pagination and uses
`main_competitor` plus `url_type` for its reference website.

Target comparison uses `/tracking/web-api/reports/multi_overview`, a reference
`campaign_id`, the same ID as `main_target`, explicit repeated `targets[]`
selectors and one repeated `competitors[]` tracking pattern. Target IDs are complete
composite campaign strings. Sorting uses native `sort[field]`, `sort[order]`,
`sort[date]` and `sort[target]` keys. Native intersection codes are `shared`,
`not_in_main` and `only_in_main`; all-keyword mode omits `intersection_type`.

Primary sources are the Position Tracking 1.280.2 entry module's report sagas,
`api/utils.ts`, `api/endpoint.ts` and `tracking-shared/api/utils.ts`. These are
JSON report reads. Paid-only export and email-delivery paths are not used.


## Chart notes

The shared notes client uses `/notes/api/notes/v2/` and the current session's
bootstrap API token in the native `Authorization: Token ...` header. List,
detail, create, update, delete, hide and show use fixed `notes/` paths. Database
options use `/notes/api/databases/`. Per-chart hidden categories use
`hidden/categories/`, a tool and, for project tools, an SEO project ID.

Notes list parameters use comma-separated tools, projects and categories,
country plus `ALL` database selection, ISO date bounds, one-based pagination and
native ordering. Results retain the provider's page, per-page and count fields.
Dates use the current client's `Date.toISOString()` serialization. Hidden
category replacement returns HTTP 201 with an empty body.
Individual hide/show actions return HTTP 200 with an empty body.
Create fixes the category to `USER_NOTE`. Update first reads the owned note and
preserves omitted content, date, tool and project selections. Published or
read-only notes cannot be edited or deleted. All note and visibility writes
require explicit confirmation. Internal tokens never appear in previews.

Primary sources are the notes loader, `notes/static/js/762.v-b5401496.js`
(native middleware and serializers), `notes/static/js/index.v-5fd37a33.js`
(state and API path), and the shared chart-notes adapter. Authenticated read
probes verified database options, note listing, detail and project-specific
category preferences before implementation.

The all-notes CSV export uses a form POST to `/notes/api/notes/export/` with
only the runtime bootstrap token. The token enters the browser-owned request,
never a preview or tool result. The native export applies no list filters.
Its form contract and a successful download were captured from the web UI.

## Tracking target replacement and deletion

`position-keywords --campaign-id <id>` reads the complete tracked keyword/tag list,
including targets without collected ranks.
`position-replace --campaign-id <id> --device phone --confirm` replaces the
selected target through the native wizard endpoint and permanently clears its
ranking history. Engine, device, location and language are optional changes; at
least one must be supplied. Current title, URL, business, brands, keywords, tags,
weekly notification and volume selection are read before execution. Time zone
defaults to UTC, matching the creation command; select `--timezone` explicitly
when needed. The result contains the replacement campaign ID. Use that ID for
further operations. Provider plan restrictions remain errors.

`position-delete --campaign-id <id> --confirm` permanently removes one target
and its history. Other targets and its SEO project remain. Both destructive
operations reject read-only targets and acquire fresh native request metadata.
Dry runs show only supplied public changes, without private hashes or the
runtime settings read. Neither operation retries a write.

Location IDs belong to a search engine. Use `position-locations --query
"United Kingdom" --engine bing` to resolve Bing's IDs and language options.
Do not reuse Google's numeric location IDs when switching engines. An unsupported
location/language remains a provider error; no replacement is retried.

## Backlink Audit campaigns and reports

Backlink Audit uses its own fixed JSON-RPC endpoint, `/backlink_audit/rpc/`,
with the method in the query string and the runtime bootstrap API key in the
native `Authorization` header. It is separate from Backlink Analytics.
No command accepts an arbitrary RPC method or endpoint.

Campaign discovery and setup use SEO `project_id` values, not folder IDs.
Campaign info returns `userDomainId`; subsequent report commands call this
`audit_id`. Scope choices are `root`, `both`, `www` and `nonwww`.
The scope lookup reports which variants exist and whether the account allows
an audit. A nonexistent domain is a provider error, not an empty audit.

Creation uses `domains.AddByProjectId` and immediately starts analysis. It
requires confirmation, refuses an existing audit and uses the native project's
recommended brands, categories and countries unless explicitly supplied.
Recurring analysis defaults to `never`, notification emails to false and
Majestic refresh to false. Configuration uses `domains.ApplySettings` with only
supplied settings. It preserves omitted fields and connected services.

Overview reports retain native JSON for link/domain totals, anchor and link
attribute distributions, historical counts, authority history/distribution,
new/broken/lost trends, top referring domains and recommendations. Target-page
selectors are the native target URL hash and path. These commands read reports;
they do not render charts or send outreach.

Primary sources are the current Backlink Audit app
`bla_app.5d2833627b8d6106dd60.js`, the native setup wizard and captured overview
requests. The native setup request separates `projectId`, `scope` and `params`.
`params` contains brands, categories, countries (`geo`) and recurring settings.

Disavow TXT export is a confirmed write because Semrush marks exported entries
and updates export metadata. It does not upload a file to Google. The native
client POSTs multipart form data with the runtime `apiKey` field to the campaign's
`disavowDownload` endpoint from `domains.GetEndpoints`. Endpoint account query
parameters remain runtime-only. Export requires the audit to be ready and
unlocked. The CLI saves the native text file; MCP returns its artifact URI.

The audit table uses `backlinks.Get` and `backlinks.Count`, zero-based `page`
and `pageSize`, and a native `search` object. Domain grouping is `collapse:"d"`;
individual links use null. Filters include authority bounds, anchor codes,
category, new/target-error flags, native link/attribute codes, toxic markers,
list mode, source and target-page selection. Link type codes are `a`, `form`,
`img` and `iframe`; link attribute codes are `follow`, `noFollow`, `ugc` and
`sponsored`. They differ from display labels.

Disavow list reads use `disavow.Get` and `disavow.Count` with `query`, `status`,
`source` and `type` filters. Sorting is a separate native object. Status codes
are 1 waiting, 4 exported, 5 disavowed and 6 not-disavowed. Domain and URL entries
remain distinct. Counters use the overview target-page search shape.

Disavow file import sends the native multipart `apiKey` and `disavow` fields.
The endpoint acknowledges a successful upload with HTTP 200 and an empty body.
It then parses the file asynchronously. A null command result acknowledges
upload acceptance, not successful parsing; inspect `backlink-audit-status` and
the disavow list afterward. The native UI's file import is independent of
Google Search Console and makes no upload to Google.

A second live file import removed a prior file-imported URL that was absent
from the replacement file. Import is therefore destructive and must not be
described as a merge. Imported entries receive native status 5 (disavowed);
that is Semrush's file interpretation, not proof of an upload to Google.

Category catalog IDs are numeric. The native wizard converts selected IDs to
strings before saving, and the API rejects numeric values in `params.categories`.
The CLI/MCP accepts numeric category IDs and applies that native serialization;
recommended project categories already use the API's string representation.

An explicit empty brand list clears the saved brands. The native response then
omits `params.brands`; it does not retain the old brands. Empty categories and
countries remain explicit arrays. Report results preserve those native shapes.

Backlink list actions use `backlinks.MoveDomains`, `backlinks.MoveUrls` and
`backlinks.MoveLinkNetworks`. Each sends `{userDomainId, ids, list}`. Domain and
individual-link selection uses the native row `id`, an opaque UUID-shaped string,
not `urlHash`. Network selection uses numeric `linkNetworkId` values. Destinations
are `for-review`, `whitelist`, `to-remove` and `disavow`. Moving to `to-remove`
queues an item in Semrush without contacting a website. Moving to `disavow`
prepares Semrush's list without uploading to Google. The same operation with the
original list reverses a move. All moves require confirmation; dry runs send
nothing. Table reads accept all eight native lists, including remove and disavow.

Disavow row management uses `disavow.Move` with `{userDomainId, userListItemId,
list}` and `disavow.Delete` with `{userDomainId, userListItemId}`. The item ID is
numeric and comes from the disavow table; backlink selection IDs are different.
Moving returns associated backlinks to review, whitelist or remove. Deletion
removes the Semrush list item. Neither operation changes a file already uploaded
to Google. Deletion is marked destructive. Both operations require confirmation.

Bulk disavow clearing uses `disavow.Clear` with `{userDomainId, withManual,
withFile, withGDT}`. All three flags default to false, as in the native UI;
at least one must be explicitly true. Manual items move back to the Audit and
Lost & Found lists. File and Disavow Tool imported items are removed from the
Semrush list. This destructive confirmed operation makes no change to Google.

Creation acknowledges explicit false recurring-notification and Majestic flags.
A fresh `domains.GetByProjectId` read omits those false flags while retaining
`recrawl:"never"`. Preserve the native response rather than inserting boolean fields into report JSON.

### Target pages, comments, labels and audit controls

The native Target Pages saga uses `backlinks.GetTargetPagesCompound` with
`{userDomainId, sort, query, queryMode, collapse, targetUrlError, page, pageSize,
userTags, isNew}`. Its matching count omits sort and pagination. The initial
sort is `-active`, query is empty, query mode and target-error filter are null,
collapse is `d`, page is zero, page size is 50, labels are empty and isNew is
false. Individual-backlink counts use null collapse. Native sort fields are
`active`, `new`, `broken`, `lost`, `ga_users`, `ga_users_perc`, `ga_new_users` and
`ga_new_users_perc`. GA values require a connected account. Both target-page methods returned empty preliminary results during processing.
After completion, the native table and count returned 26 target-page groups;
rows contain URL variants and parallel metric arrays.

Comments use `comments.GetByIds` with numeric `ids`, `comments.Save` with
`{domain, comment}`, and `comments.Delete` with numeric `id`. Each native helper
adds `userDomainId`. Save returns a numeric ID and creates or replaces a referring-domain comment.
A native create/read/update/delete pass retained the ID on update and removed
the backlink association on deletion. The
native editor limits text to 500 characters and deletes an existing comment
when its text is cleared. The CLI exposes deletion explicitly rather than
sending an empty save.

Target-page labels use `usertags.Get` and `usertags.TargetPagesCounters` with
only `userDomainId`. Add/remove send `{label, targetUrl}` to
`usertags.AddTargetUrlTag` and `usertags.RemoveTargetUrlTag`. `usertags.Delete`
sends `{label}` and removes that label across the campaign. The target-page
filter's `userTags` contains label strings. The add and remove responses are
native booleans; a false result must not be reported as a successful change.

Rerun uses `domains.PushIncImport` with only `userDomainId`. It requires a ready,
unlocked campaign (`isLocked:false`, `isLockedSettings:false`) and
`incImportAvailable:true`. A completed status alone does not imply an unlocked
campaign: native incremental import kept `statusId:1` while `isLocked:true`.

Scope replacement is not exposed. A native `domains.ApplySettingsScope` call
created a new audit ID and reset manual scheduling to `recrawl:"2weeks"` with
`recrawlNotify:true`. `domains.AddByProjectId` accepts manual settings atomically,
but starts a fresh audit even for an existing scope. Neither observed contract
provides a scope edit that preserves the current audit and notification settings.
Do not emulate it with an unsafe reset followed by a separate settings write.

Primary sources are the native target-page saga and table columns in
`bla_app.5d2833627b8d6106dd60.js`, comment handlers/editor in
`app-components-backlink.c5fe44a97b87c771db90.js`, and captured native API
responses. UI CSV access additionally checks the user's trial flag; the
campaign API's separate `isPaid` and `isExportLimited` flags can disagree with
that UI check. CSV support must follow an executed API result, not an assumed
plan inferred from either flag alone.

A bounded native CSV probe matched one backlink. With the current Guru session,
`backlinks.StartBacklinksCSVExport` accepted `{userDomainId, search}` and returned
`{filename}`. The download URL comes from `backlinksDownload` in
`domains.GetEndpoints`; the client merges the filename into its query and sends
runtime `Authorization`. The response was HTTP 200, `text/plain; charset=utf-8`,
647 bytes, and contained the selected backlink. The API permits export even
though the UI's separate trial selector opens an upgrade dialog.

The native CSV client polls HTTP 202 at two-second intervals with a five-minute
deadline. Starting a job is never retried by the download loop. The CLI exposes
one export operation, saves the native bytes, and MCP returns its existing file
artifact. Binary downloads use one scoped browser-fetch path for GET and POST,
including runtime headers and provider filenames. The browser owns the fetched
blob until scoped cleanup; MCP continues to transfer file chunks separately.

A native label pass added the same label to two target pages. Its counter was
two, the label-filtered table returned two groups, and removing one association
left one. Deleting the label removed it. All three writes returned boolean true.

CSV job generation is read-only with respect to campaign settings, but a tool
call creates a new job. MCP therefore advertises this export as non-idempotent.
Only pending downloads repeat automatically; job creation does not.
