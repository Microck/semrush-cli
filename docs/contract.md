# Command contract

`semrush` and `semrush-cli` are the same executable. Node.js 22 or newer.

- `semrush-cli reports [--json]` lists the fixed 48 read-only research reports.
- `semrush-cli <report-name> --<parameter> <value> [--json]` executes one report. Names and flags use hyphens. `semrush-cli <report-name> --help` shows its complete schema-derived options. Objects and arrays use JSON. Report definitions live in `src/report-catalog.json`.
- `semrush-cli auth import --cdp-url http://127.0.0.1:9234` imports an authorized existing Chromium session into Galleton. No secret-valued command arguments. Import verifies the signed-in session before storing it. Reimport explicitly replaces the CLI's own session with revision checking.
- `semrush-cli auth login` opens an isolated visible browser, waits for sign-in, and stores its cookies in Galleton. Requires a graphical desktop.
- `semrush-cli auth status [--check] [--json]` shows Galleton metadata without credentials. `--check` verifies Semrush access.
- `semrush-cli auth logout` forgets only the selected Galleton profile. It does not log out other browsers.
- `semrush-cli setup` installs Chromium. Galleton daemon setup is separate and documented.
- `semrush-cli mcp` runs the stdio MCP server. Stdout contains only protocol messages. MCP exposes the same reports, schemas and read-only annotations; it cannot log in, change configuration, or mutate account data.
- `semrush-cli doctor [--json]` verifies Galleton, stored session, browser, and an authenticated account report.

Successful reports are `{authenticated: true, report: <underscore_name>, data: ...}`. Raw report nesting and provider totals remain visible. Integers outside JavaScript's safe range become decimal strings. Credentials are removed recursively. JSON goes to stdout; human diagnostics and errors go to stderr. No prompts in report or MCP commands. Exit codes: 0 success, 1 service/authentication/report failure, 2 invalid usage. No retries of report requests, which can consume account allowances. No automatic anonymous fallback.

Configuration: `SEMRUSH_GALLETON_URL` (literal loopback HTTP, default `http://127.0.0.1:8766`), `SEMRUSH_GALLETON_TOKEN_FILE` (default `~/.local/share/semrush-cli/galleton/api.token`), `SEMRUSH_SESSION` (default `semrush-cli`), and `SEMRUSH_BROWSER_EXECUTABLE` (optional absolute Chromium path). Authentication is loaded from Galleton into a fresh, transient browser context for each CLI process or MCP server. No persistent plaintext cookie file. Cookie updates from the report browser are captured back into Galleton. Existing reference browser profiles and services are never modified.

Internal web endpoints may change. Account quotas, mobile/history permissions and product restrictions apply. Galleton cannot manufacture a renewal token. The bundled static Galleton provider stores cookies without automatic renewal. Semrush validates authentication before each report. Reimport or sign in again when the session expires. See `docs/architecture.md` for the documented daemon extension.
