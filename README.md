<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-lockup-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-lockup.svg">
    <img src="assets/logo-lockup.svg" width="720" alt="semrush cli logo">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/Microck/semrush-cli/releases"><img src="https://img.shields.io/github/v/release/Microck/semrush-cli?display_name=tag&style=flat-square&label=release&color=000000" alt="release badge"></a>
  <a href="https://www.npmjs.com/package/semrush-cli"><img src="https://img.shields.io/npm/dt/semrush-cli?style=flat-square&label=downloads&color=000000" alt="npm downloads"></a>
  <a href="https://github.com/Microck/semrush-cli/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Microck/semrush-cli/ci.yml?branch=main&style=flat-square&label=ci&color=000000" alt="ci badge"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-mit-000000?style=flat-square" alt="license badge"></a>
</p>

---

`semrush` is a terminal cli for semrush. research keywords, check rankings and backlinks, compare competitors, manage projects and keyword lists, and run site audits from your own account. output is json, so you can pipe it into `jq` or give the same commands to an agent through mcp. built with typescript and effect.

[documentation](https://semrush.micr.dev) | [command reference](https://semrush.micr.dev/docs/reports) | [npm](https://www.npmjs.com/package/semrush-cli) | [mcp](https://semrush.micr.dev/docs/mcp)

![keyword research demo](assets/demo-keywords.gif)

## why

if you already pay for semrush, you should be able to use it from the terminal too. this cli uses your existing web session, so there is no developer api key to buy or configure. look up a keyword, save the result, compare a few domains, or let an agent do it through mcp.

your plan's permissions and limits still apply. it doesn't cover the whole semrush suite. the [coverage page](https://semrush.micr.dev/docs/coverage) lists what works and what still needs the web ui.

## quickstart

### install

requires node.js 22 or newer. linux, macos and windows are supported.

```bash
npm install -g semrush-cli
semrush setup
semrush auth login
semrush keyword-overview --keyword 'email marketing'
```

`semrush-cli` is the npm package. `semrush` is the command.

`setup` downloads chromium and starts the bundled galleton session engine. there is no separate python or go install. on linux, if chromium needs system libraries, run `npx patchright install-deps chromium`.

### auth

`semrush auth login` opens a browser. sign in to semrush there and the cli saves the session in galleton's encrypted vault. it doesn't ask for your password in the terminal.

```bash
semrush auth login
semrush auth status --check --json
semrush doctor
```

already have a signed-in browser with a local debugging port? import its session instead:

```bash
semrush auth import --cdp-url http://127.0.0.1:9234
semrush doctor
```

the browser has to be running with debugging enabled. import doesn't start or stop it. see the [authentication guide](https://semrush.micr.dev/docs/authentication) for headless hosts and remote browsers.

semrush can expire your session. sign in or import again when that happens. the cli saves rotated cookies after successful requests, but doesn't renew expired sessions in the background.

```bash
semrush auth logout
semrush daemon stop
semrush daemon start
```

logout forgets this cli's saved session. it doesn't log out your other browsers. the daemon keeps running after the terminal closes. start it again after a reboot.

## command surface

89 operations, available as cli commands and mcp tools.

| command | what it does |
| --- | --- |
| `keyword-overview`, `keyword-magic` | volume, difficulty, cpc, intent, related keywords and filtered research |
| `keyword-serp`, `keyword-ads`, `keyword-clusters` | search results, ads and keyword clusters |
| `domain-overview`, `domain-keywords`, `domain-competitors` | organic rankings and competing domains |
| `domain-pages`, `domain-subdomains`, `domain-position-changes` | pages, subdomains and ranking changes |
| `keyword-gap`, `backlink-gap` | compare domains and find keyword or backlink opportunities |
| `backlink-links`, `backlink-referring-domains`, `backlink-anchors` | inspect backlinks, referring domains and anchor text |
| `domain-ai-visibility`, `domain-ai-countries`, `domain-ai-sources` | ai visibility, countries and citation sources |
| `project-create`, `project-get`, `project-update`, `project-delete` | create and manage projects |
| `project-tags`, `project-set-tags`, `project-pin` | organize your projects |
| `project-enable-seo`, `project-tools`, `project-toolkits` | enable seo and read project tool status |
| `keyword-lists`, `keyword-list-create`, `keyword-list-import` | manage keyword lists and import keywords |
| `keyword-strategy-create`, `keyword-list-cluster` | generate a strategy or cluster a list |
| `audit-create`, `audit-configure`, `audit-start` | configure and launch a site audit |
| `audit-status`, `audit-snapshots`, `audit-snapshot` | check progress and read audit results |
| `reports` | list every operation and its inputs |
| `mcp` | run the stdio mcp server |
| `doctor` | check the browser, session engine and semrush connection |

```bash
semrush reports
semrush keyword-magic --help
semrush project-create --help
```

global flags: `--json`, `--no-color`, `--no-input`. reports return json with or without `--json`. objects and arrays use json arguments. use `--help` on a command for its filters, pagination and defaults.

## examples

### keyword research

```bash
semrush keyword-overview --keyword 'email marketing'
semrush keyword-magic --keyword 'email marketing' --questions-only --page-size 20
semrush keyword-serp --keyword 'email marketing'
```

pull out the numbers you care about:

```bash
semrush keyword-overview --keyword 'email marketing' \
  | jq '.data | {phrase, volume, difficulty, cpc}'
```

### competitors and backlinks

```bash
semrush domain-overview --domain openai.com
semrush domain-keywords --domain openai.com --page-size 20
semrush keyword-gap --domains '["openai.com","anthropic.com"]'
semrush backlink-links --domain openai.com
semrush backlink-gap --domains '["openai.com","anthropic.com"]'
```

### projects

preview a write before sending it:

```bash
semrush project-create --name 'my website' --domain example.com --dry-run
```

then create it when you're ready:

```bash
semrush project-create --name 'my website' --domain example.com --confirm
```

![project request preview demo](assets/demo-projects.gif)

writes need `--confirm`. `--dry-run` validates the inputs and prints the request without connecting to semrush. creating a project doesn't start tools or share it.

### keyword lists

```bash
semrush keyword-lists
semrush keyword-list-create --name 'content ideas' --confirm
```

use the list id and owner id returned by semrush:

```bash
semrush keyword-list-import --basket-id 123 --owner-id 456 \
  --keywords '["email marketing","email automation"]' --database us --confirm
semrush keyword-list-keywords --basket-id 123 --owner-id 456
```

strategy generation, clustering and metric updates can consume your account allowance. they need explicit confirmation too. see [keyword lists](https://semrush.micr.dev/docs/keyword-lists).

### site audits

```bash
semrush project-enable-seo --folder-id 123 --confirm
```

use the returned seo project `id` as the campaign id:

```bash
semrush audit-create --campaign-id 456 --name 'my audit' \
  --domain example.com --page-limit 100 --confirm
semrush audit-start --campaign-id 456 --confirm
semrush audit-status --campaign-id 456
semrush audit-snapshots --campaign-id 456
```

creating an audit saves its settings. starting it is a separate command. defaults are manual scheduling and email off. see [site audit](https://semrush.micr.dev/docs/site-audit) for crawl settings and limits.

## mcp

finish setup and sign in first, then add this to your client's mcp config:

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

the server exposes the same operations as the cli. tool names use underscores, such as `keyword_overview` and `project_create`. writes need `confirm: true`, or `dry_run: true` to preview the request. it doesn't expose login, arbitrary urls or javascript execution.

## what it looks like

the gifs use captured output for public keyword research and an offline project preview. no account details or credentials. the [capture notes and renderer](docs/demo/README.md) are in the repo if you want to regenerate them.

## building from source

```bash
git clone https://github.com/Microck/semrush-cli.git
cd semrush-cli
npm ci
npm run build
node dist/cli.js --help
npm run check
```

building from source requires go 1.23 or newer, `tar` and `patch` to build the pinned galleton engine. published npm packages include the engine for supported platforms, so npm users do not need go.

## documentation

full docs live at [semrush.micr.dev](https://semrush.micr.dev). setup, authentication, projects, keyword lists, site audits, mcp and the complete command reference.

- [coverage](https://semrush.micr.dev/docs/coverage)
- [authentication](https://semrush.micr.dev/docs/authentication)
- [scripting](https://semrush.micr.dev/docs/scripting)
- [architecture](docs/architecture.md)

## contributing

issues and pull requests are welcome. if semrush changes an endpoint, include the command you ran and the error. leave cookies and account details out of the report.

## disclaimer

this is an unofficial client, not affiliated with semrush. it uses the web product's internal endpoints, which can change. your subscription and account limits apply.

## license

[mit license](LICENSE)
