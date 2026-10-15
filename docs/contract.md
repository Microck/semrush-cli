# Command contract

The executable is `semrush`; the npm package is `semrush-cli`. Only `semrush` is installed as a command. Node.js 22 or newer.

- `semrush reports [--json]` lists the research reports and project operations.
- `semrush <report-name> --<parameter> <value> [--json]` executes one report. Names and flags use hyphens. `semrush <report-name> --help` shows its complete schema-derived options. Objects and arrays use JSON. Report definitions live in `src/report-catalog.json`.
- `semrush auth import --cdp-url http://127.0.0.1:9234` imports an authorized existing Chromium session into Galleton. No secret-valued command arguments. Import verifies the signed-in session before storing it. Reimport explicitly replaces the CLI's own session with revision checking.
- `semrush auth login` opens an isolated visible browser, waits for sign-in, and stores its cookies in Galleton. Requires a graphical desktop.
- `semrush auth status [--check] [--json]` shows Galleton metadata without credentials. `--check` verifies Semrush access.
- `semrush auth logout` forgets only the selected Galleton profile. It does not log out other browsers.
- `semrush setup` installs Chromium. It also initializes and starts the private Galleton daemon.
- `semrush mcp` runs the stdio MCP server. Stdout contains only protocol messages. MCP exposes the same operations and schemas. Mutations carry readOnlyHint=false and require confirm=true. Delete and leave carry destructiveHint=true. It cannot log in or change local configuration.
- `semrush doctor [--json]` verifies Galleton, stored session, browser, and an authenticated account report.

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
