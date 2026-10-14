<p align="center"><img src="assets/logo.svg" width="100" alt="semrush-cli"></p>
<h1 align="center">semrush-cli</h1>
<p align="center">Semrush research from your terminal and MCP clients.</p>
<p align="center"><a href="https://semrush.micr.dev">Documentation</a> · <a href="https://www.npmjs.com/package/semrush-cli">npm</a> · <a href="https://github.com/Microck/semrush-cli/issues">Issues</a></p>

48 read-only web reports for keyword research, organic rankings, competitors,
keyword and backlink gaps, backlinks, historical/mobile research and AI visibility.
Written in TypeScript with Effect. Sessions live in an encrypted Galleton vault.
No Semrush developer API key, Python runtime or CAPTCHA service required.

## Install

Requires Node.js 22+. Includes Galleton binaries for Linux x64/arm64,
macOS x64/arm64 and Windows x64.

```sh
npm install -g semrush-cli
semrush setup
semrush auth login
semrush domain-overview --domain openai.com --json
```

`setup` installs Chromium and starts a private Galleton daemon. `auth login`
opens an isolated browser for sign-in, verifies the session, and stores it in
Galleton. It requires a graphical desktop. On Linux, missing Chromium system
libraries can be installed with `npx patchright install-deps chromium`.

To import an existing, authorized Chromium session on a headless machine:

```sh
semrush auth import --cdp-url http://127.0.0.1:9234
semrush doctor --json
```

The browser must already expose CDP on a literal loopback HTTP address. This
supports the browser managed by [semrush-web-mcp](https://github.com/Microck/semrush-web-mcp).
Import does not stop or change that browser. Keep CDP private; forward it over
SSH when necessary.

## Research

```sh
semrush keyword-overview --keyword 'email marketing' --json
semrush keyword-magic --keyword 'email marketing' --questions-only --page-size 20 --json
semrush domain-keywords --domain openai.com --page 2 --page-size 20 --json
semrush domain-competitors --domain openai.com --page-size 10 --json
semrush keyword-gap --domains '["openai.com","anthropic.com"]' --json
semrush backlink-gap --domains '["openai.com","anthropic.com"]' --json
semrush backlink-links --domain openai.com --filters '+|type||nofollow' --json
semrush domain-ai-visibility --domain openai.com --json
semrush snapshot-dates --database us --json
semrush reports --json
semrush domain-keywords --help
```

| Area | Reports |
| --- | --- |
| Keywords | Overview, ideas, questions, SERPs, ads, clusters, paginated Keyword Magic and groups |
| Organic | Rankings, pages, subdomains, changes, competitors, topics and trends |
| Gaps | Keyword overlaps and gaps, backlink prospects and profile comparisons |
| Backlinks | Links, referring domains, anchors, indexed pages, outbound domains, history and authority |
| AI visibility | Visibility, mentions, citation sources and country distribution |
| Account | Limits, permissions, databases, snapshots, projects, folders, saved lists and audit campaigns |

All successful reports use `{authenticated: true, report, data}`. Domain ranking
and page reports include provider totals. Large integers remain exact as decimal
strings. Errors go to stderr with a nonzero exit. `--json` works before or after
the command. Objects and arrays use JSON flags; booleans support explicit `false`.
See the [full command reference](https://semrush.micr.dev/docs/reports).

## MCP

Complete setup and authentication, then configure your MCP client:

```json
{
  "mcpServers": {
    "semrush": {
      "command": "semrush",
      "args": ["mcp"]
    }
  }
}
```

Use an absolute executable path if your client does not inherit the terminal's
PATH. `npx -y semrush-cli@0.1.0 mcp` also works. MCP tool names use underscores,
for example `keyword_overview` and `domain_keywords`. Input schemas and reports
match the CLI. All 48 tools are annotated read-only. Login, account mutations,
arbitrary URLs and JavaScript execution are not MCP tools.

## Sessions

```sh
semrush auth status --check --json
semrush auth logout
semrush daemon stop
semrush daemon start
```

Galleton stores credentials under `~/.local/share/semrush-cli/galleton`. The
private daemon listens on `127.0.0.1:8768`. It continues after the terminal closes;
run `daemon start` after reboot. The CLI installs no system startup service.

Each CLI process restores its encrypted session into a fresh, transient Chromium
context. The MCP server reuses one context and serializes requests. Successful
reports capture cookie updates back to Galleton. Session expiry requires sign-in
or import again. No anonymous fallback or automatic request retries.

The unchanged Galleton TypeScript SDK is vendored at a pinned upstream commit
because it is not on npm. The bundled daemon adds a tested `static` provider for
storage without renewal. Semrush has no proven renewal contract in the reference
integration, so this tool does not invent one. See [architecture](docs/architecture.md)
and [SDK provenance](src/vendor/README.md).

| Variable | Default |
| --- | --- |
| `SEMRUSH_GALLETON_URL` | `http://127.0.0.1:8768` |
| `SEMRUSH_GALLETON_TOKEN_FILE` | `~/.local/share/semrush-cli/galleton/api.token` |
| `SEMRUSH_SESSION` | `semrush-cli` |
| `SEMRUSH_BROWSER_EXECUTABLE` | Patchright's Chromium |

The setup/daemon commands manage only the default CLI-owned daemon. An external
daemon must support the documented static-provider extension. Never expose its
API token or credential directory.

## Limits

Semrush account permissions, quotas and product access apply. A read-only report
can consume an allowance. Internal web endpoints may change. Provider caps remain
visible; there is no unlimited-export claim. Galleton encrypts at rest but its key
and vault share a private local directory. Other processes running as your OS user
are within the same trust boundary.

## Development

```sh
npm ci
npm run check
npm --prefix docs-site ci
npm --prefix docs-site run build
```

Development builds require Go 1.23+ and `tar`/`patch` to build the pinned Galleton
daemon with its storage-only extension. The build runs the upstream core suite
with the extension's integration test. Published users do not need Go.

Tests compare all 48 request shapes against the Python reference, use real
Chromium and Galleton with a local HTTP fixture, and exercise the built executable.
They never require a Semrush account. See [verification](docs/verification.md) for
the separate live-account evidence.

## Uninstall

```sh
semrush auth logout
semrush daemon stop
npm uninstall -g semrush-cli
```

The private vault and browser cache remain on disk. Remove them only after
checking they contain nothing you need.

MIT. Independent project, not affiliated with Semrush.
