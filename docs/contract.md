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
`audit-create --campaign-id <id> --name <name> --domain <domain> --confirm`
saves settings for a fresh audit and refuses an existing one. It does not start
a crawl. Before creation, `audit-info` returns HTTP 404.

`audit-configure` replaces an existing public-site configuration. Include every
setting you want to retain; omitted settings take their schema defaults. It
refuses protected-site authentication or Google Analytics connections.
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
