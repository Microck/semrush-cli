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

Successful reports are `{authenticated: true, report: <underscore_name>, data: ...}`. Raw report nesting and provider totals remain visible. Integers outside JavaScript's safe range become decimal strings. Credentials are removed recursively. JSON goes to stdout; human diagnostics and errors go to stderr. No prompts in report or MCP commands. Exit codes: 0 success, 1 service/authentication/report failure, 2 invalid usage, 130 interrupted CLI command. Report requests use the browser context's shared-cookie HTTP client with network retries disabled; repeated requests can consume account allowances. No automatic anonymous fallback.

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

Project sharing uses the native SharingModal contract:
`project-shares --folder-id <id>` reads `/share/json/shares/project-smb/{folder_id}`.
`project-share --folder-id <id> --emails '["person@example.com"]' --role viewer|editor --confirm`
sends one array entry per email to `/share/json/share/project-smb` with
`email`, `object_id` and `role`. It sends sharing notifications and grants access
to all configured project tools. The role is required; no privilege level is implicit.
`project-share-set-role --share-ids '["0123456789abcdef01234567"]' --role viewer|editor --confirm`
posts the exact share-ID array to `/share/json/set-role/{role}`.
`project-share-revoke --share-ids '["0123456789abcdef01234567"]' --confirm`
posts that array to `/share/json/stop-sharing`. Revocation removes access.
Share IDs are the native 24-character hexadecimal strings returned as `share_id`.
These commands retain the native `is_success`, `errors` and `data` envelope inside
the CLI/MCP result. Literal `is_success: true` is required. A share creation also
requires one valid receipt per requested email. Writes never retry; missing or
lost receipts require `project-shares` readback before another write.

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
`dry_run:true` validates and prints the request plan without authentication or
network access. Runtime credentials and settings-preservation reads happen only
during execution. Dry runs need no confirmation. IDs are decimal strings and never
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
requires an explicit `auth_enabled` or `web_bot_auth_enabled` choice when that
authentication is already enabled. Google Analytics connections remain protected
from replacement.
`audit-start --campaign-id <id> --confirm` launches with the saved settings and
consumes crawl allowance. Defaults are manual scheduling and email disabled.
Explicit recurring schedules create future runs; `--notify` enables emails.

`audit-limits`, `audit-campaigns`, `audit-info`, `audit-status`, `audit-snapshots`
and `audit-snapshot` inspect campaigns and results. Snapshot IDs are opaque
strings, unlike numeric campaign IDs. Use the exact returned string. All writes
require confirmation and support a dry run before authentication. Detailed
issue/page tables and stop controls are documented below. Google Analytics connections remain in the web UI.

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

Single-file MCP export tools return `data: null` plus an `artifact` descriptor containing its
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

`position-alert-read --campaign-id <id> --alert-id <id> --confirm` sends native
`alert_read`, returns the detail envelope and marks that event read.
`position-alert-mark-all-read --campaign-id <id> --confirm` sends
`alert_mark_as_read` for every event in that one target, including events on
other list pages. `position-alert-delete --campaign-id <id> --alert-id <id>
--confirm` sends `alert_delete` and permanently deletes only that event.
Alert IDs are opaque strings copied from `position-alerts`, never converted to
numbers. All three operations are writes requiring confirmation or an offline
dry run. Delete is destructive. They preserve native timestamps, use the same
nonzero-error-code handling and never retry a write. List/count reads do not
change read state. No operation sends outreach or enables weekly notifications.

Primary sources are the tracking 1.280.2 entry module's GlobalStore and Main
modules and `lazy/components/firstTriggerModal.e1bff77a57ae04ec2e14.js`.
The native crawl-scheduling form disables saving unless the account has SEO
Tier 3. A live owner-limit read confirmed Guru, `seo_toolkit_tier2:1` and
`seo_toolkit_tier3:0`; scheduling remains account-gated.

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
explicitly disables authentication. Existing Google Analytics connections remain
protected from settings replacement.

The CLI reads `auth_password` through `--auth-password-file <path>`; `-` reads
stdin. It removes one final line ending and preserves other whitespace. MCP
accepts the string directly with JSON Schema `writeOnly:true`. Passwords are
redacted in dry runs, provider errors and successful responses; protected-site
credential fields are never returned by report reads.

Web Bot Auth uses `web_bot_auth_enabled` and the write-only `web_bot_auth`
object. Its required fields are `signature_agent`, `signature_input` and
`signature`, containing the website owner's complete native header values.
CLI reads that JSON object from `--web-bot-auth-file <path>` or stdin with `-`;
MCP accepts the object directly. All three values are hidden in previews,
provider errors and report responses. The CLI does not create, refresh or
validate a third party's cryptographic signature.

Creation and enabling on an unprotected audit require the complete object.
Credential replacement is atomic: all three fields must be supplied together,
with `web_bot_auth_enabled:true`. Editing an existing Web Bot Auth audit requires
an explicit true or false choice. True without a credential object retains the
current Signature-Agent and Signature-Input and sends the native empty
Signature value to keep the stored signature. Missing retention metadata fails
before saving. Disabled audits can return null header fields; retaining enabled
authentication still requires nonempty Agent/Input strings. False explicitly
disables Web Bot Auth. Settings replacement still applies defaults to the other
options unless supplied again.

The native save payload uses `webBotAuthEnabled`, `webBotAuthSignatureAgent`,
`webBotAuthSignatureInput` and `webBotAuthSignature`. No audit is started by a
settings edit, no write is retried, and HTTP Basic authentication keeps its
separate explicit-choice contract. Google Analytics settings are not replaced.

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

`backlink-audit-replace-scope --project-id <seo-id> --scope <scope> --confirm`
replaces an existing ready, unlocked audit with a fresh one for the selected
scope. It is destructive: a fresh audit replaces the old analysis. Do not rely
on audit annotations or selections carrying over. The returned `userDomainId`
replaces the old audit ID. The same
scope is refused before writing; use rerun to update the existing audit.

Execution reads the current audit and copies its saved settings into a single
native `domains.AddByProjectId` call. Empty brands and false notification and
Majestic flags must be explicit because metadata omits them. Categories, country,
recurring settings and additional returned settings remain intact. No separate
reset-and-restore write is used. External services are not connected by this
operation. Dry runs show the requested project and scope; the preserved settings
are loaded only at execution. Creation starts asynchronous analysis and consumes
allowance, so a successful acknowledgement is not crawl completion.

A native `domains.ApplySettingsScope` call
created a new audit ID and reset manual scheduling to `recrawl:"2weeks"` with
`recrawlNotify:true`. A subsequent owned root-to-both probe used
`domains.AddByProjectId` with the current settings and explicit false notification
and Majestic flags. Its acknowledgement and project readback retained nondefault
brands, category, country and `recrawl:"never"` while selecting a fresh audit ID.
After analysis, the replacement unlocked with 563 checked links and retained
those settings. The old audit ID returned native error 404, "user domain not
found". This is a destructive replacement with fresh history, not an in-place
history-preserving edit.

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
artifact. Binary downloads use one scoped HTTP client for GET and POST, including
runtime headers and provider filenames. Its cookies are synchronized with the
browser, and its responses and client are disposed after the download. MCP
transfers private file chunks separately.

A native label pass added the same label to two target pages. Its counter was
two, the label-filtered table returned two groups, and removing one association
left one. Deleting the label removed it. All three writes returned boolean true.

CSV job generation is read-only with respect to campaign settings, but a tool
call creates a new job. MCP therefore advertises this export as non-idempotent.
Only pending downloads repeat automatically; job creation does not.

### Backlink CSV import

`backlink-audit-import` accepts a CSV file through `--contents-file` and requires
confirmation. MCP accepts the same bytes in `contents`. The audit must be ready
and unlocked before the importer creates a staging handle.
The native import saga in `bla_app.5d2833627b8d6106dd60.js` calls
`backlinks.StartUpload` with no campaign parameters. Its result is a string
staging handle. `domains.GetEndpoints` supplies `backlinksUpload` and
`backlinksUploadFormField`. Append the encoded handle to the endpoint's pathname,
preserving its existing query. The native multipart fields are runtime `apiKey`
and the file under the returned form-field name.

The native HTTP 200 staging response is a JSON object with `error:false`,
`message:null` and a `file` descriptor containing `name`, `size`, `id`
and `urls`. Its `code` has returned both 0 and 200 on successful uploads;
success follows `error:false` and the file descriptor, not a fixed code.
The URL count is `file.urls`, not a top-level `urls`. A zero count
is not a successful import: the native reducer disables finishing that file.
The own Audit CSV export staged with zero URLs, while a one-column CSV containing
one quoted source URL staged with exactly one. The subsequent one-URL native
commit was acknowledged and the audit unlocked after processing. Preserve supplied CSV bytes; do not
silently convert between native export and import formats.

The native commit call is `backlinks.FinishUpload` with `{userDomainId, hash}`.
The live one-URL commit returned `true`; a following status read retained
`statusId:1` and set `isLocked:true` during asynchronous processing. Submission
success requires that acknowledgement, not completion of the crawl. A
high-level import must validate the endpoint before creating a staging handle,
validate the file descriptor before committing, and never retry either write
automatically. Cancellation before commit must not send a delayed finish call.

[Semrush's import guide](https://www.semrush.com/kb/580-auditing-your-backlinks)
says imported links are crawled asynchronously, an import cannot be stopped from
the interface once started, and JavaScript-wrapped links or sources without HTTP
200 are not added. These are provider limits, not empty-success conditions.

The existing HTTP adapter's multipart success check belongs to Site Audit URL
uploads (`status.code:0`). Backlink CSV staging instead uses the `error:false`
and nested-file contract above. Its JSON success must not be rejected merely
because an `error` property is present, nor treated as a crawl URL upload.

## Position Tracking AI brand matching boundary

The native tracking 1.280.2 Settings component shows Manage brand names only
when the engine is `search-gpt`, `google-ai` or `gemini`. Its engine set excludes
Google, Bing and Baidu. The editor submits its full main/competitor array through
`campaign_set_competitors`; its HTTP helper does not transform that JSON body.
Previous native-editor-shaped probes against a Google target returned validation
errors and preserved its saved settings. Those failures do not establish the
AI editor's clearing contract or a subscription denial.

A fresh authenticated owner-limit read on 2026-10-16 confirmed `GURU`, 1,500
keywords, ten targets, zero prompts and `ai_seo_main:0`. No AI target was created
or add-on purchased. AI brand matching and clearing remain unverified. The
existing general-settings endpoint retains old brands after an empty array,
so the CLI continues to reject that unsupported write.

## Site Audit export formats and transport

`audit-export-pages --snapshot-id <id>` exports the snapshot's page-property
columns. `audit-export-page-issues --campaign-id <id>` exports the campaign's
latest page-by-issue matrix. `audit-export-markup --snapshot-id <id>` exports
markup and structured-data columns. Each supports CSV and XLSX, relative URLs,
the native sort string and filter string. They are reads and require an explicit
CLI output path. Snapshot exports retain their selected crawl; the campaign
matrix follows its latest snapshot.

Native checks against one completed 23-page snapshot returned HTTP 200 for all
six format/report combinations. XLSX files contained valid workbook XML and
worksheets. The native bundle's crawled-links export constant instead returned
HTTP 404, `no endpoint for the requested path`, for both formats while the
control exports succeeded. It is not exposed as a working command or classified
as a Guru subscription denial.

Binary exports use one scoped HTTP client per download with retries disabled.
It receives a transient copy of the browser cookies, returns cookie updates to
the browser and is disposed on success, failure or interruption. Cancellation
aborts only that export and leaves the serialized MCP runtime usable. The same
JSON, form and multipart contracts, pending-job polling and artifact bytes remain
unchanged. Galleton remains the sole durable credential store.

## Site Audit Compare Crawls download

`audit-export-compare --first-snapshot-id <id> --second-snapshot-id <id>` sends
GET `/siteaudit/export/snapshot/{second_snapshot_id}/compare/{first_snapshot_id}`
with `export=csv|xlsx` and the runtime account key. Both IDs are explicit and
must differ. The native UI defaults the first selection to the previous crawl
and the second to the latest crawl. The CLI preserves the supplied order.

The [native export module](https://static.semrush.com/siteaudit/review/3909.2dd2f158589125911115.js) initializes those two settings from
`prevSnapshot` and `lastSnapshot` and uses that exact path. Positive native
CSV and XLSX downloads compared two completed 23-page crawls. The CSV places
second-crawl columns before first-crawl columns and retains provider-computed
deltas. The CLI must preserve those bytes without reordering or recalculating
values. It does not start a crawl or change campaign settings.

## Site Audit JS Impact

The fixed read operations are `audit_js_impact_guide`,
`audit_js_impact_changed_pages`, `audit_js_impact_pages` and
`audit_export_js_impact`. They require a numeric SEO campaign ID and never
configure rendering or start a crawl. Their native paths are, respectively,
`/siteaudit/api/campaigns/{campaign_id}/js-impact/guide`,
`/siteaudit/api/campaigns/{campaign_id}/js-impact/changed-pages`,
`/siteaudit/api/campaigns/{campaign_id}/js-impact/details`, and
`/siteaudit/export/js-impact/{campaign_id}`. Runtime authentication adds `key`.

The page table uses zero-based `page` (default 0), `limit` (default 10),
`sort=asc|desc` (default desc), `query` (default empty),
`status=all|changed|unchanged` (default all), and an optional unique array of
`parameters`. Native requests uppercase sort, map a nonblank query to `url`,
and map changed/unchanged to the string `changed=true|false`. All-status omits
`changed`. Parameter selections require changed-status and become a comma-
separated native value. Allowed keys are clientSideRedirect, metaRobots, title,
metaDescription, linksCount, wordsCount, canonical and googleStructuredData.
No CLI-only field or campaign ID is repeated in the native query.

The export accepts the same filters, fixes native page 0 and limit 100000, and
maps `format=csv|xlsx` (default csv) to `export`. CLI requires a new `--output`
file; MCP returns the existing single-file artifact/resource contract. Provider
bytes and before/after values are preserved. Guide and changed-page-count reads
accept no table filters. The native UI enables JS Impact when the account is
Guru/Business and campaign info has `jsImpactReportDataAvailable=true`. Empty
native results do not establish report availability or a subscription gate.

Primary evidence is current native review module39805 and its export caller.
An owned, rendering-enabled Guru crawl completed at three pages with report
availability true; native JSON returned one unchanged row and CSV/XLSX
downloads succeeded. Changed-row live behavior requires separate verification.

## Site Audit All reports archive

`audit_export_all` is a read-only composite operation requiring `campaign_id`.
It accepts `format=csv|xlsx` (default csv), `relative` (default false),
`sort` (default url_asc) and `filter` (default empty). CLI requires a new
`--output` ZIP file. MCP returns the existing single-artifact/resource contract,
with the archive manifest in `data`. Single-file export results stay unchanged.

Semrush's native All reports action starts separate downloads. This command
creates a ZIP locally; it does not call or claim a provider ZIP endpoint. Four
core reports are crawled pages, pages with all issues, markup and issue summary.
The comparison uses the latest completed snapshot and its most recent earlier
snapshot when available. JS Impact is included when campaign metadata marks
its report available. `manifest.json` identifies the selected crawl and comparison pair, each
included command, stable archive filename, original provider filename, MIME
type and byte count. It explains missing comparison or JS Impact data.

Files retain native bytes. Page filters and relative URLs apply to the three
page exports; comparison, issue summary and JS Impact use their own native
defaults. The JS Impact export requests all rows with page 0 and limit 100000.
The command rechecks the latest snapshot after downloading and fails if it
changed, because the native campaign issue-matrix endpoint cannot pin a crawl.
A completed snapshot is required; unavailable or malformed metadata fails before
downloads. Provider download failures fail the whole batch.

Native files stage in a private scoped directory and are never registered as
public MCP resources. Streaming ZIP creation publishes one complete artifact;
failure or cancellation removes the staging files and partial archive. CLI
saving preserves the existing exclusive-destination rule. Archive creation
propagates cancellation to its output and lazy input streams and awaits pending
writers before deleting their directory.

## Native mind-map images

`keyword-list-export-mindmap --basket-id <id> --owner-id <id> --format png|jpg
--output <path>` downloads the selected structured strategy's native overview
image. JPG is the default, matching the native primary export control. PNG keeps
the native transparent background; JPG has a white background. The operation is
read-only and never generates or clusters a strategy. Regular lists, unfinished strategies and unavailable access
fail without an artifact. IDs come from `keyword-lists`.

The operation opens the fixed Keyword Strategy Builder list route in a scoped
headless page, selects Semrush's mind-map export and downloads its PNG or JPG.
It executes the provider's renderer, rather than claiming an image API endpoint.
The native image includes up to seven topics and a count of additional topics.
The observed renderer produces 4336 by 2228 pixels. Full table exports remain
separate. Provider filenames and bytes are preserved.

CLI requires a fresh `--output` destination. MCP returns `data:null` and one
artifact with MIME type `image/png` or `image/jpeg`; existing resource chunking
applies. The renderer page and its browser download close after success, failure
or cancellation. Runtime-owned export files follow the existing scoped lifetime.

## My Reports

`reporting-overview` reads reporting access, native quota counters, privacy
acknowledgment state, Essential/Premium capabilities, system templates and the
selected page of up to 30 reports ordered by last update descending. Each report
includes its saved schedule and one ready task's metadata. `--offset` defaults
to zero and accepts a nonnegative GraphQL Int up to 2147483647. Advance by 30
to read subsequent pages; stop when the returned page is empty or the next
offset reaches `reports.totalCount`. The total describes the filtered selection.
Task filenames are metadata, not downloaded artifacts.

Optional `--ownership all|own|shared|team`, `--branding all|branded|standard`,
`--schedule all|daily|weekly|monthly` and `--search` combine with pagination.
They map to native `ReportsWhereInput` values: `ownedByMe`, `isVirtualShare`,
`isBranded`, `schedulePeriods` and `name:{method:Contains,value:...}`. Defaults
apply no filters. Search text stays in JSON variables, never GraphQL source.
The lazy-loaded native grid module supplies this request contract.

CLI and MCP accept no caller GraphQL, URL or page-size override. The adapter sends the fixed
`ReportingOverview` GraphQL query to `/my_reports/graphql/` using the encrypted
session's cookies. It returns the native `data.me` object under the usual
authenticated envelope. GraphQL errors, including partial-data errors, and
missing or null account data fail instead of returning an empty success.

Confirmed reporting writes use the authenticated web account without purchases or
trial activation. Template creation sends the fixed system-template creation
request with a validated template name and JSON parameters. It creates a saved
report without generating a PDF. Clone creates a separate report with its own ID.
Read and save operate on complete native document JSON. Save requires a populated
content array, derives its path ID from the validated document ID, preserves the
editable configuration and includes the reporting privacy acknowledgment. The read record is serialized into the native editor save model: scheduling becomes reportPeriod/reportValue, stored mail fields become the emailing delivery object, and read-only document/widget metadata is omitted. Unknown widget settings and nested layout content remain intact. The same serializer handles explicit save and generation preparation.

Generation follows the current UI: read the document, save it with the privacy
acknowledgment, validate the save receipt, then send GenerateReport exactly once.
A failed or lost save stops generation. A failed generation is never replayed;
task listing provides readback. Generation respects the document's existing
settings, including configured delivery. Verification uses only owned reports
with no recipients and scheduling disabled.

Task listing returns current native task metadata. Downloads select an existing
ready task by its ID, resolve its provider PDF path inside the adapter, restrict
the destination to the reporting download path on the authenticated origin and
validate PDF bytes. Provider download capabilities never appear in public tool
output. CLI files refuse overwrites; MCP uses existing private artifact resources.
No read operation creates, saves, accepts policies or starts generation.

Generation dry runs also list the read/save preparation, including the privacy
acknowledgment and timezone, without reading account state or saving a document.

`reporting-delete --report-ids '[123]' --confirm` deletes the explicitly selected My Reports documents through the native fixed DeleteReports mutation. It requires a nonempty array of unique positive 32-bit report IDs and a literal true receipt. A missing, false or lost receipt is an error; deletion is never retried. Inspect reporting-overview before any further deletion.

`reporting-task-delete --report-id 123 --task-id 456 --confirm` deletes one
PDF generation record from that document. The task ID is an exact decimal
string from `reporting-tasks`. The native web UI deletes one task at a time;
Semrush rejects a comma-separated batch with HTTP 400 and no deletion.
It sends a bodyless DELETE to `/my_reports/api/v1/document/123/tasks` with the
single ID in the `taskIds` query parameter. A successful receipt requires
literal `success: true` and `data.deletedCount: 1`. Missing, zero, excessive,
denied or lost receipts fail without replay. Read `reporting-tasks` before
another attempt. Deletion keeps the report, its settings, other generations and
already downloaded local files. It never starts generation or delivery.

`reporting-restore --report-id 123 --confirm` sends the native bodyless POST to
`/my_reports/api/v1/document/123/restore` and requires literal `status: success`.
It recovers a deleted document while Semrush retains it. No retention period is
promised. Treat deletion as destructive; the web UI calls it permanent, although
the native restore endpoint successfully returned a deleted disposable report to
the active list. Restoration preserves saved delivery settings and remaining
generations. A separately deleted PDF generation remains deleted. It does not
save, regenerate, email or replace the restored document. Missing, denied or lost
receipts fail without replay. Inspect reporting-overview and reporting-get before
another restoration attempt.

### Sharing

The native report Share dialog uses `/share/json/objects/report` and
`/share/json/shares/report/{report_id}`. `reporting-shares --report-id <id>` reads
that report's access list. `reporting-share --report-id <id> --emails
'["person@example.com"]' --role viewer|editor --confirm` posts one entry per
recipient to `/share/json/share/report`. Entries contain `email`, the report ID
as a string in `object_id`, and the explicit `role`. This grants access and sends
sharing notifications. Report IDs remain positive 32-bit integers at the public
CLI/MCP boundary, matching other reporting commands.

`reporting-share-set-role --share-ids '["0123456789abcdef01234567"]' --role
viewer|editor --confirm` and `reporting-share-revoke --share-ids
'["0123456789abcdef01234567"]' --confirm` use the same native role/revocation
endpoints as project sharing. They require exact 24-character `share_id` values,
not report IDs. Responses preserve the native sharing envelope and require
literal `is_success: true`; grants also require a distinct receipt for each
recipient. Missing, partial or lost write receipts never cause a retry. Read
`reporting-shares` before another write. No sharing operation generates a report,
changes its delivery schedule or sends a PDF by email.

### Custom templates

Custom report templates are separate from system templates and saved reports.
`reporting-templates` reads `/my_reports/api/v1/templates/` with native
`currentPage`, fixed `limit: 30`, `searchQuery` and `timezone` query parameters.
Public `--page` starts at one, `--search` defaults to an empty string and
`--timezone` defaults to zero. Results preserve the native template IDs, sharing
information, available actions and pagination counters. Listing does not mark
shared templates as seen or create reports.

`reporting-template-create --report-id <id> --name <name> --confirm` saves a
custom template from an existing report through
`POST /my_reports/api/v1/template/{report_id}`. The native JSON body contains
`templateName` and the report ID as a string in `userDocumentId`. A template
creation receipt must contain a positive integer `template.id`.

`reporting-template-report --template-id <id> --name <name> --confirm` creates a
separate saved report through `POST /my_reports/api/v1/template/{template_id}/document`
with `documentName`. It does not generate a PDF. Template placeholders may need
configuration in the new report before generation. Template IDs and report IDs
are distinct positive 32-bit integers and must never be interchanged.

`reporting-template-share` and `reporting-template-share-revoke` take a
`--template-id` and explicit `--emails` array. They send native POST and DELETE
requests respectively to `/my_reports/api/v1/template/{template_id}/share` with
`{emails:[...]}`. Sharing sends notifications. This template API does not accept
viewer/editor roles or the 24-character share IDs used by report sharing.

`reporting-template-delete --template-id <id> --confirm` sends DELETE to
`/my_reports/api/v1/template/{template_id}`; `reporting-template-restore` sends
POST to that path's `/restore` action. Deletion affects the template, not reports
already created from it. All writes require a native success receipt, are sent
once, and support offline dry runs. Denied, missing or lost receipts are errors;
inspect `reporting-templates` before any further write. These operations do not
purchase reporting upgrades, start trials or change report delivery settings.

## Core Web Vitals

Eight Site Audit operations expose the native `page-speed-metrics` service:
status, overview, page metrics, per-URL history, per-URL Lighthouse
recommendations, top improvements, saved URL settings and confirmed settings
replacement. Read commands use GET and return native data, including empty
recommendation arrays, unavailable measurements and native history ordering.
The report uses Semrush's LCP, TBT and CLS measurements; no INP or CrUX data is
invented. The native page table returns all measured URLs without server-side
pagination or filters.

History and recommendations require `url_id`, copied exactly from the page
metrics. It is a signed decimal string, not a JavaScript number or crawled-page
ID. Negative and larger-than-safe-integer values retain their exact path bytes.
All paths and methods are fixed; no caller URL or arbitrary endpoint is accepted.

`audit-web-vitals-settings-set` requires an explicit `urls` array of one to ten
unique absolute HTTP(S) URLs and confirmation, or an offline dry run. It sends
one native JSON POST with `{urls:[...]}`. The native editor enables Save after
Clear all, but the API rejects an empty array with HTTP 400, `urls must not be
empty`. The command rejects empty input before authentication; clearing remains
unsupported.
The list replaces the prior selection. Changes apply during the next audit;
the command does not launch one or change general audit settings.

The native UI distinguishes full and partial URL acceptance by returned count.
The CLI checks the returned URL receipt once. A missing or partial receipt
fails with an explicit instruction to read `audit-web-vitals-settings` before
sending another write. Partial acceptance may already have changed the saved
list. No automatic retry or rollback occurs after a partial or lost response.

Native source and the read-only Guru UI supplied these contracts. Existing
reports returned a score of 100, ten measured pages and two history dates;
positive and negative URL IDs returned history and recommendation data. New
audits can return native 404, `no previously saved page speed properties`,
before their first analysis. This remains an error, not an invented empty list.

Current Site Audit spreadsheet controls offer Crawled Pages, pages with all
issues, markup, Issues, Compare Crawls and All reports. They do not offer a
Crawled Links export. The client bundle's crawled-links URL constant
returned 404 in prior native checks and is not treated as an available UI feature.

## Keyword Overview and Bulk Analysis

The current Keyword Overview client is
`overview_793.655a44eca84c3a01ebb8.js`. Its native serializers and authenticated
UI/API probes define this extension; caller RPC methods and URLs remain closed.

`keyword-overview`, `keyword-ideas`, `keyword-ideas-summary`, `keyword-serp` and
`keyword-ads` accept desktop/mobile, currency and monthly snapshot selection.
Desktop maps to `device:0`, mobile to `device:1`; the current snapshot is `date:""`
and historical snapshots use `YYYYMM`. Currency defaults to USD. Existing default
requests retain their original wire values. Keyword clusters has no corresponding
native snapshot/device controls and does not accept these arguments.

Eight added reads expose native country metrics (`keyword-countries`), Bulk
Analysis (`keyword-bulk`), Product Listing Ads (`keyword-product-ads`), SERP URL
organic/backlink enrichment, and native bulk, SERP URL and SERP domain exports.
Country metrics return the native `keywords` array rather than choosing one
country or calculating a synthetic global total. All provider measurements,
ordering, nulls and unavailable rows remain unchanged.

Bulk Analysis requires one to 100 unique keywords, each at most 200 characters
and containing non-whitespace text. JSON array input preserves commas within
phrases. `keywords.GetBulk` receives `phrases`, `database`, `currency` and the
required current-state `date:""`; an optional nonempty domain is sent only when
requested. Bulk has no native mobile or historical selector. Personalized
metrics use already available native domain data; these reads do not start a
domain update, change account preferences or refresh keyword metrics.

SERP enrichment reads accept one to 100 absolute HTTP(S) URLs, with the same
keyword, country, currency, device and snapshot context as `serp.GetURLs`.
Repeated URLs are permitted because the native UI can include one URL in
multiple SERP features. The provider's per-URL metric records are returned
without merging them into an invented SERP representation.

Exports start one native `keywords.Export`, `serp.ExportURLs` or
`serp.ExportDomains` job. XLSX, CSV and semicolon CSV map to native formats 0, 1
and 2. Bulk exports accept data-column selection; the interactive SERP snapshot
button is not an export column. Bulk defaults match the native visible data
columns. Personalized export fields are Personal Keyword Difficulty, Positions
and Potential Traffic, exposed as `personalized_difficulty`, `positions` and
`potential_traffic`; each requires an explicit domain. SERP exports include the
native full result set, independently of the JSON report's client-side `limit`.
Their serializers send keyword, database,
device, monthly date, format and filename, without adding unsupported currency
or location fields.

The receipt must contain a nonempty `export_id`. The adapter then calls
`export.Wait` with that identifier and downloads the fixed
`/kwogw/v2/download-export?export_id=...` path. The native client treats RPC error
code 0 from the wait operation as pending and permits two further wait checks.
Only this idempotent wait can retry; export creation, other provider failures
and transport failures do not retry. The native export stage has a 90-second
deadline. Job identifiers stay private and are redacted from errors.
Existing private file, cancellation, no-overwrite and MCP resource contracts
apply to the unchanged native bytes.

Guru probes returned positive two-keyword bulk data, EUR prices, personalized
domain data, URL organic/backlink records, all three bulk export formats and
both SERP export variants. Product Listing Ads returned a successful empty
array; populated ad rows require separate evidence. Mobile and September 2026
requests were observed directly in the current UI. No purchase, preference
write, keyword refresh, policy acknowledgment or outreach is part of these
operations.

## On Page SEO Checker

The native `main.393567ab.js` client and authenticated Guru requests define
this workflow. Campaign IDs are SEO project IDs, not web folder IDs. Existing
project commands create a folder and enable its SEO project separately.
Campaign discovery can include unconfigured placeholders. A placeholder's
report error remains an error; it does not establish a plan restriction.

Read operations cover campaign discovery, information, allowance, settings,
overview, pages, ideas/trends, SERP lists and per-keyword SERPs. Page snapshot
reads expose keywords, ideas, the six native detail reports (`density`,
`related`, `backlinks`, `length`, `video`, `readability`) and the three
per-keyword detail reports (`serp`, `length`, `video`). Paths and detail names
are fixed. Landing and snapshot IDs remain exact 24-character hexadecimal
strings. Native ordering, measurements, empty reports and the special ORPHANS
row remain unchanged. A stale snapshot error never silently selects another
snapshot.

Creation configures an existing, unconfigured SEO project with explicit
URL/keyword selections. It does not create another folder or start analysis.
Manual scheduling and disabled notifications are the defaults. The native
location object uses a country name during creation and a country code during
later location replacement; the public fields distinguish those inputs.
Desktop maps to `desktop`, mobile to native `phone`. Crawler selection maps
SemrushBot and Googlebot to the native `default_agent` boolean. Timezone offsets
use the browser convention, minutes west of UTC.

Analysis, per-page reruns, location replacement, partial general settings
edits, page addition/reassignment, page replacement, batch additions and
selected-page deletion require confirmation or an offline preview. Page and
location changes do not implicitly run another analysis. General settings
edits read native settings once and retain omitted fields, including location.
Connected Google services are not changed. Page additions can reassign selected
keywords; those commands identify that destructive behavior explicitly.

Analysis uses the current native billing bootstrap's `has_product` value for
the provider's `paid` selector. It is internal account metadata, not a caller
option or a substitute for the SEO subscription tier. Missing metadata fails
before launch. No command purchases allowance, changes a subscription, sends
feedback or connects a third-party account.

Native configuration and launch can return an empty HTTP 200 response. Such
responses are successful empty acknowledgments. Their writes never replay
after a lost response; inspect campaign information, settings or pages before
another write. A page's `COMPLETED` or `ERROR` analysis status is report data.
HTTP failures and explicit provider error envelopes remain failures. RPC and
tracking envelope status checks belong to those protocols, not to arbitrary
native report payloads.

DELETE request plans identify their native encoding explicitly. Existing
project, note and tracking deletion keep query encoding; selected On Page IDs
use a JSON body. Offline previews include that encoding metadata. Callers
cannot select a request encoding or supply runtime tracking capabilities.

The bundle retains statistics and orphan route constants that returned native
400/404 and have no current call sites. They are not exposed. Native PDF uses
My Reports; it remains outside this workflow's verified boundary. The new
commands do not generate content or simulate connected-service results.

## Local keyword research and explicit metric refresh

The same native Keyword Overview client defines eight additional reads and one
confirmed write. The catalog total becomes 323 operations, 223 reads and 100
writes. Native Guru probes returned New York location 21167, local metrics and
SERPs, local URL keyword counts and domain organic/backlink metrics. The native
location selector disables mobile, historical and personalized-domain contexts.
Local commands therefore expose current desktop data without those selectors.
Database access restrictions remain native errors.

- `keyword-locations`: `locations.Get` with `database` and `input`; returns the
  native history/results object or array. Empty input is allowed for discovery.
- `keyword-local-overview`: `keywords.GetLocalInfo` with the ordinary report
  fields, a required positive `location_id` mapped to `location`, desktop 0 and
  current date. Returns the entire native global/local metrics object. It does
  not run the web client's separate automatic refresh action.
- `keyword-local-serp`: `serp.GetURLs` with the same local context. Returns native
  rows, with an optional client-side limit matching the existing SERP command.
- `keyword-local-serp-organic-metrics`: `serp.GetURLsOrganicMetricsLocal` with
  local context and one to 100 absolute HTTP(S) URLs. Repeated URLs are allowed.
- `keyword-local-serp-export`: `serp.ExportURLsLocal` with phrase, database,
  location, format and filename. Unlike national exports it sends no device,
  date or currency. It uses the existing one-job export/wait/download workflow
  and unchanged native CSV, semicolon CSV or XLSX bytes.
- `keyword-serp-domain-organic-metrics` and
  `keyword-serp-domain-backlink-metrics`: `serp.GetDomainsOrganicMetrics` and
  `serp.GetDomainsBacklinksMetrics`, with ordinary national report context and
  one to 100 distinct bare domains. Native request domain ordering is lexical.
  The adapter returns each native metric row without merging or synthesizing it.
- `keyword-refresh-status`: `updates.GetKeywords` with a `phrases` array of
  phrase/database/location/status_updated_at records, `include_updating:true`,
  currency and an optional domain for national data only. Public keywords, database and location apply
  to the selection; `status_updated_at` uses native epoch seconds and defaults
  to zero to request current state. It performs one read without polling.
- `keyword-refresh`: `updates.RequestUpdates` with phrase/database/location
  records. It requires confirmation or an offline preview, accepts one to 100
  unique keywords and uses location zero for national data. The native quota
  receipt and per-keyword statuses are returned unchanged. It does not poll,
  retry, purchase additional allowance or change account preferences. A lost
  response requires reading refresh status before another request.

Refresh is independent of research reads. An authenticated native probe
requested one local keyword, changed usage from 44 to 45 of 1,000 and observed
native update status 1 followed by 2. Native numeric statuses remain raw data.
Only the export wait's existing pending response permits retry; refresh requests
and status reads do not add automatic retries.

## Domain personalization and keyword AI topics

Seven added operations bring the catalog to 330 operations, 229 reads and 101
confirmed writes. The same current Keyword Overview client supplied the native
serializers. Guru probes returned domain suggestions, normalized roots, ready
preparation state, personalized metrics and positive AI topic samples/counts.
The retained `serp.GetDomainsPosition` wrapper returned native method-not-found
and has no verified active caller; it is not exposed.

- `keyword-domain-suggestions` reads `domains.GetSuggestions` with an empty
  object and retains native history, project and competitor selections.
- `keyword-domain-root` reads `domains.GetSiteRoot` with a bare input domain and
  returns the native root-domain receipt. An unavailable root remains native
  empty data rather than a fabricated suffix calculation.
- `keyword-domain-prepare` requires confirmation or an offline preview. It
  resolves the root through `domains.GetSiteRoot` once, refuses an empty root,
  and calls `domains.GetStatus` once with that root and no job ID. The public
  result contains `domain` and the unchanged native `preparation` receipt.
  Status 1 means pending and requires a nonempty ID; status 2 means ready and
  can carry an empty or absent ID. It never polls or replays initialization.
- `keyword-domain-status` reads `domains.GetStatus` with the normalized root
  and a required nonempty native `job_id` mapped to `id`. Empty IDs are rejected
  before credentials are acquired because that native shape starts preparation.
  It returns the native receipt once. Unknown or malformed state remains an
  error; it never falls back to an initial request or resolves another root.
- `keyword-ai-databases`, `keyword-ai-summary` and `keyword-ai-topics` read
  `aiSeo.GetDatabases`, `aiSeo.GetTopicsSummary` and `aiSeo.GetTopics`. The latter
  two use the current national report serializer with keyword, database,
  desktop 0, USD, location 0, current date and optional prepared domain.
  Unsupported database and access errors do not fall back to the US.

Preparation and status receipts get one boundary validation, while native extra
fields remain output. Lost or invalid preparation responses require inspecting
native state before another confirmed request. No background job, automatic
retry, account preference or new session storage path is introduced.

Keyword Overview, country metrics, ideas, idea totals, SERPs and clusters accept
an optional prepared root domain. Reads omit an absent domain and never prepare
it automatically. Current mobile personalization passed natively; monthly
personalization returned invalid-params, so the relevant schemas reject a
nonempty date with a domain before authentication. Bulk Analysis keeps its
existing current desktop domain contract. National SERP client limits now allow
up to 1,000 rows so native feature rows beyond the first 100 remain accessible;
the default stays 10 and native requests do not acquire a server-side limit.

Native AI country discovery returned 32 databases. The running-shoes summary
returned four LLM volume rows and `topics_count:1000`; the topic endpoint returned
five sample rows with zero volumes. These are native Keyword Overview topic
samples, not a full AI Toolkit prompt-management or 1,000-topic export contract.

## Keyword Magic personalization and grouping

The current Keyword Magic client supplies three additional reads, bringing the
catalog to 333 operations, 232 reads and 101 confirmed writes. Its fixed gateway
is `/kmtgw/v2/webapi`. Native reads returned positive personalized metrics,
group totals and topic suggestions on the existing Guru session.

- `keyword-magic-access` reads `user.GetInfo` with `{}` and retains native row
  limits, update allowance and product flags. These flags describe Keyword Magic;
  they do not replace other products' access metadata or the account's plan.
- `keyword-magic-groups-summary` reads `ideas.GetGroupsSummary` with the same
  selection as group discovery and retains its native count and metadata.
- `keyword-magic-topic-suggestions` reads `ideas.GetSuggestionsByTopics` and
  retains the native sample of suggested phrases. It always uses topic grouping.

Keyword Magic rows, totals, groups and group totals accept an optional prepared
root domain. Topic suggestions also accept it. The serializer omits an absent
domain and never starts preparation or a keyword refresh. Zero personalized
difficulty, position and potential traffic remain native data. In the live
probe, personalized metrics were present even though Keyword Magic's separate
`has_ai_seo` flag was false; that flag must not suppress returned metrics.

`group_by` selects `topics` (default) or `words`. Topic requests send
`topics_enabled:true` and the native fixed relevance order. Word requests omit
that field and use `groups_order` with `count` or `volume`, descending by default.
The native UI keeps All Keywords selected during this switch and changes the
table order from similarity_score to volume. The CLI derives the same default
from grouping when no explicit `sort_field` is supplied.
`groups_sort_field` and `groups_descending` apply only to word grouping; topic
requests reject those controls before authentication. Database, currency and
sort patterns reject trailing line terminators. Empty group selection is
the native array `[]`. The existing keyword matching-mode default stays 4.

Native report HTTP requests allow 90 seconds and make one attempt. Personalized Magic reads took 42-44
seconds in direct probes, so the former 45-second deadline cut into valid
provider latency. Navigation and download deadlines remain separate.

The native selected-export initializer returned a nonempty job ID, but its first
wait failed with code -32603. That job was not recreated. Export commands remain
unsupported until the provider produces a verified file; no alternate download
route or automatic retry is introduced.


## Organic Research comparison controls

The current Organic Research client supplies explicit comparison ranges,
position and change-type selections, preset totals and daily/monthly change
trends. Three fixed reads bring the candidate catalog to 336 operations,
235 reads and 101 confirmed writes. No export, report creation or account
settings request is added.

- `domain_position_changes` accepts an optional `date_range` with `start_date`
  and `end_date`. Daily ranges use `YYYYMMDD`; monthly ranges use `YYYYMM` and
  `date_type:monthly`. The native monthly serializer appends day 15, matching
  the current client. The boundary rejects impossible dates, reversed ranges,
  mixed precisions and a non-null snapshot `date` together with a range.
  Omitted ranges keep the native default. Rows and totals use the same context.
- `domain_keywords` and `domain_position_changes` accept `positions_type` with
  `all` (default), `organic` or `serp`. The native SERP-only value is
  `serpFeatures`. This is a report selection, not a settings write.
- `domain_position_changes` accepts unique `change_types` values `new`,
  `improved`, `declined` and `lost`. An empty or omitted selection sends native
  `null`, preserving the existing default. Filtering, sorting and pagination
  remain part of the same native request.
- `domain_position_changes_presets` reads
  `organic.PositionChangesPresetsTotalV2` for the selected domain, database,
  search type and comparison range. Preset totals do not accept table filters,
  pagination or position/change-type selections.
- `domain_position_changes_daily_trend` and
  `domain_position_changes_monthly_trend` read fixed
  `organic.DailyChangesTrendV2` and `organic.MonthlyChangesTrendV2` methods. Their
  context is domain, database and search type; no caller dates, arbitrary RPC
  method, currency or export arguments are accepted. Complete native arrays
  and unknown fields are retained.

The primary client is
`https://static.semrush.com/organic-research/1828.6d617f8606b0789fa104.js`,
loaded by the current native page. Its date-range formatter preserves daily
strings and appends `15` to six-digit monthly values. Read-only Guru probes
returned three rows for daily, monthly and mobile ranges, positive preset
counts, 28 daily trend points and 24 monthly trend points. Native CSV/XLSX
exports remain unsupported under the restrictions recorded above.

## Native PDF exports

`keyword-overview-pdf --keyword <phrase> --output <file> --confirm` and
`audit-web-vitals-pdf --campaign-id <id> --output <file> --confirm` create an
Essential My Reports document through the fixed CreateLiteOrder mutation,
generate that report once, wait only on task metadata, then download the native
PDF. Each export accepts the reporting Privacy Policy and uses reporting allowance. Email,
scheduling and public dashboards remain disabled for these exports.
AI summaries are disabled by default. `--ai-summary` adds the native AI Summary
widget with its observed 12-column, 14-row settings and consumes the account's
AI summary allowance. The provider decides whether that allowance is available;
a failed generation is not replayed.
The document stays in My Reports, matching the native Download PDF action.
The receipt includes report_id and task_id for inspection and explicit deletion.

Dry runs show the credential-free creation request and generation/download steps.
Runtime template credentials enter only inside the browser adapter. A lost or
invalid creation receipt stops generation. A lost generation is never replayed;
errors identify the saved report when known. Task reads can poll for two minutes;
provider errors stop immediately. An unfinished or failed task publishes no file.

Core Web Vitals uses the native `tc_siteaudit_core_web_vitals` template and
English report language. Before creation it reads the selected campaign's
`audit-info` and requires its matching ID and nonempty `projectDomain`. That
domain supplies the template domain, header and SiteAuditDatasource title. Dry
runs show this read and mark the domain as `<audit-info.projectDomain>`.
Missing or denied campaign metadata stops before any reporting allowance is
used. Export never edits the campaign, schedules a crawl or refreshes its data.
