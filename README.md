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

`semrush` is a terminal cli for semrush. research keywords, compare domains, inspect backlinks, manage projects and run seo tools from your own account. output is json, so scripts, `jq` and agents can use the same results. built with typescript and effect, with mcp included.

[documentation](https://semrush.micr.dev/docs) | [npm](https://www.npmjs.com/package/semrush-cli) | [command reference](https://semrush.micr.dev/docs/reports) | [mcp](https://semrush.micr.dev/docs/mcp)

![keyword research demo](assets/demo-keywords.gif)

## why

if you already pay for semrush, you should be able to use it from the terminal too. this cli uses your web session. no developer api key to buy or configure.

look up a keyword, compare competitors, save a list, run an audit or download a report. your account's permissions and limits still apply. the [coverage page](https://semrush.micr.dev/docs/coverage) lists supported workflows and the parts that still need the web ui.

## quickstart

requires node.js 22 or newer. linux, macos and windows are supported.

```bash
npm install -g semrush-cli
semrush setup
semrush auth login
semrush keyword-overview --keyword 'email marketing'
```

`semrush-cli` is the package. `semrush` is the command.

`setup` downloads chromium and starts the bundled galleton session engine. npm users do not need python or go. if chromium needs system libraries on linux, run `npx patchright install-deps chromium`.

### auth

`semrush auth login` opens a browser. sign in there and the cli saves the session in galleton's encrypted vault. it does not ask for your password in the terminal.

already signed in through a browser with a local debugging port? import that session:

```bash
semrush auth import --cdp-url http://127.0.0.1:9234
semrush auth status --check --json
semrush doctor
```

import does not start or stop your browser. `doctor` checks the session engine, browser and authenticated semrush connection. see [authentication](https://semrush.micr.dev/docs/authentication) for remote browsers and headless hosts.

sign in or import again when your session expires. after a reboot, start the session engine with `semrush daemon start`. `semrush auth logout` forgets the cli's saved session without logging out your other browsers.

## examples

### keyword research

```bash
semrush keyword-overview --keyword 'email marketing'
semrush keyword-magic --keyword 'email marketing' --questions-only --page-size 20
semrush keyword-bulk --keywords '["email marketing","email automation"]' --currency EUR
semrush keyword-serp --keyword 'email marketing'
```

pull out the fields you need:

```bash
semrush keyword-overview --keyword 'email marketing' \
  | jq '.data | {phrase, volume, difficulty, cpc}'
```

keyword research also includes local metrics, prepared-domain personalization, topic groups, ai topic samples and native table exports. refreshing metrics is a separate confirmed command. see [keyword research](https://semrush.micr.dev/docs/keyword-research).

download a keyword overview as a native pdf:

```bash
semrush keyword-overview-pdf --keyword typescript --confirm --output overview.pdf
```

this also keeps a report in my reports. it does not send email or set a schedule.

### competitors and backlinks

```bash
semrush domain-overview --domain example.com
semrush domain-keywords --domain example.com --page-size 20
semrush keyword-gap --domains '["example.com","example.org"]'
semrush backlink-links --domain example.com
semrush backlink-gap --domains '["example.com","example.org"]'
```

use [organic research](https://semrush.micr.dev/docs/organic-research) for historical comparisons and ranking changes. [backlink audit](https://semrush.micr.dev/docs/backlink-audit) covers saved campaigns, review lists and disavow files.

### projects and audits

preview a project before creating it:

```bash
semrush project-create --name 'my website' --domain example.com --dry-run
semrush project-create --name 'my website' --domain example.com --confirm
```

![project request preview demo](assets/demo-projects.gif)

copy the returned folder id, enable its seo project, then use the returned seo project id as the audit campaign id:

```bash
semrush project-enable-seo --folder-id 123 --confirm
semrush audit-create --campaign-id 456 --domain example.com --page-limit 100 --confirm
semrush audit-start --campaign-id 456 --confirm
semrush audit-status --campaign-id 456
semrush audit-pages --campaign-id 456 --page 0 --limit 20
semrush audit-export-all --campaign-id 456 --output audit-reports.zip
```

creating an audit saves settings. starting the crawl is separate. [site audit](https://semrush.micr.dev/docs/site-audit) covers crawl settings, protected sites, javascript impact and exports. [on page seo checker](https://semrush.micr.dev/docs/on-page-seo-checker) and [position tracking](https://semrush.micr.dev/docs/position-tracking) have their own setup and analysis commands.

### reports

find saved reports and available templates:

```bash
semrush reporting-overview
semrush reporting-overview --ownership own --search monthly
```

create a report from a template, then inspect its saved document:

```bash
semrush reporting-create --template tc_organic_search_positions \
  --parameters '{"domain":"example.com","database":"us"}' --confirm
semrush reporting-get --report-id 123
```

replace `123` with the returned `data.userDocumentId`. creation does not generate a pdf. to generate one and inspect its tasks:

```bash
semrush reporting-generate --report-id 123 --confirm
semrush reporting-tasks --report-id 123
```

copy the exact id of a ready task, then download it:

```bash
semrush reporting-download --report-id 123 --task-id '<task_id>' --output report.pdf
```

saving or generating accepts the reporting privacy policy. generation can consume allowance and uses the report's saved delivery settings. review recipients and schedules first. the [reporting guide](https://semrush.micr.dev/docs/reporting) covers full-document edits, cloning, pagination and deletion.

## scripting

reports return json. use `--help` for each command's inputs, filters and defaults:

```bash
semrush reports
semrush keyword-magic --help
semrush project-create --help
```

objects and arrays use json arguments. writes require `--confirm`; `--dry-run` validates and previews them offline. writes do not retry automatically. if a response is lost, inspect the resource before sending another write.

file exports require `--output` and refuse an existing destination. see [scripting](https://semrush.micr.dev/docs/scripting) for exit codes and shell workflows.

## mcp

finish setup and authentication, then add this to your client's config:

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

the server exposes the same operations with underscores, such as `keyword_overview` and `project_create`. writes require `confirm: true` or `dry_run: true`. exports return artifact resources instead of writing a local file. see [mcp](https://semrush.micr.dev/docs/mcp) for resource reads and client setup.

## building from source

```bash
git clone https://github.com/Microck/semrush-cli.git
cd semrush-cli
npm ci
npm run build
node dist/cli.js --help
npm run check
```

session storage uses the published [`galleton` sdk](https://www.npmjs.com/package/galleton). source builds of the bundled daemon need go 1.23 or newer, `tar` and `patch`.

## contributing

issues and pull requests are welcome. include the command and error when reporting a problem. leave cookies and account details out of it.

## disclaimer

this is an unofficial client, not affiliated with semrush. it uses internal web endpoints that can change. your subscription and account limits apply.

## license

[mit](LICENSE)
