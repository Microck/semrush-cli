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

`semrush` is a terminal cli for semrush. research keywords, check rankings and backlinks, compare competitors, manage projects and keyword lists, track positions, and run site audits from your own account. output is json, so you can pipe it into `jq` or give the same commands to an agent through mcp. built with typescript and effect.

[documentation](https://semrush.micr.dev) | [command reference](https://semrush.micr.dev/docs/reports) | [npm](https://www.npmjs.com/package/semrush-cli) | [mcp](https://semrush.micr.dev/docs/mcp)

![keyword research demo](assets/demo-keywords.gif)

## why

if you already pay for semrush, you should be able to use it from the terminal too. this cli uses your existing web session, so there is no developer api key to buy or configure. look up a keyword, save the result, compare a few domains, or let an agent do it through mcp.

your plan's permissions and limits still apply. this doesn't cover the whole semrush suite. full ads research, ai prompt workflows, local, social and connected content tools remain outside verified coverage because the current account plan blocks them. the [coverage page](https://semrush.micr.dev/docs/coverage) lists what works and what still needs the web ui.

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

192 operations, available as cli commands and mcp tools. 133 reads and 59 writes that need explicit confirmation.

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
| `saved-keyword-lists`, `saved-keyword-list-create`, `saved-keyword-list-rename` | find, create and rename saved collections |
| `saved-keywords`, `saved-keywords-import`, `saved-keywords-summary` | import, filter and inspect saved keywords |
| `saved-keyword-list-tags`, `saved-keyword-list-labels`, `saved-keyword-list-topics` | read collection tags, workflow labels and topics |
| `saved-keywords-add-tags`, `saved-keywords-remove-tags`, `saved-keywords-label` | tag keywords and mark workflow status |
| `saved-keywords-copy`, `saved-keywords-move`, `saved-keywords-update-metrics` | transfer keywords or refresh their metrics |
| `saved-keywords-delete`, `saved-keyword-list-delete` | delete keywords or collections, with undo commands |
| `saved-keywords-export` | download native csv, semicolon csv or xlsx files |
| `keyword-lists`, `keyword-list-keywords` | read keyword strategy builder baskets |
| `keyword-strategy-create`, `keyword-list-cluster` | generate a seed-based strategy or cluster a list |
| `keyword-list-page-presets`, `keyword-list-pages`, `keyword-list-clusters` | read native seed-based topics, page opportunities and paginated clusters |
| `keyword-list-clusters-get`, `keyword-list-cluster-keywords`, `keyword-list-page` | inspect selected clusters, their keywords and page details |
| `keyword-list-page-favorite`, `keyword-list-page-unfavorite` | save or remove a page favorite |
| `keyword-list-clusters-delete`, `keyword-list-clusters-update-metrics`, `keyword-list-clusters-updated` | delete selected clusters or refresh and read their metrics |
| `keyword-list-keywords-copy`, `keyword-list-keywords-move` | transfer selected phrases between owner-aware baskets |
| `keyword-list-clusters-copy`, `keyword-list-clusters-move` | transfer keywords from selected clusters between baskets |
| `keyword-list-export`, `keyword-list-export-keywords`, `keyword-list-export-pages`, `keyword-list-export-clusters` | export filtered keyword rows, page selections or selected phrases and clusters |
| `domain-strategies`, `domain-strategy-get`, `domain-strategy-summary`, `domain-strategy-status` | find domain strategies and read generation status |
| `domain-strategy-create`, `domain-strategy-rename`, `domain-strategy-delete` | start domain strategy generation, rename or delete strategies |
| `domain-strategy-presets`, `domain-strategy-pages`, `domain-strategy-pages-summary` | filter and page through existing or new page opportunities |
| `domain-strategy-page`, `domain-strategy-page-urls`, `domain-strategy-page-serp` | inspect page details, matching urls and search results |
| `domain-strategy-existing-keywords`, `domain-strategy-recommended-keywords` | read ranking keywords and recommendations for a page |
| `domain-strategy-keywords-delete`, `domain-strategy-export` | remove selected generated keywords or export a filtered strategy |
| `audit-create`, `audit-configure`, `audit-start` | configure and launch a site audit |
| `position-create`, `position-targets`, `position-info` | create targets and read tracking settings |
| `position-configure` | edit tracking address, business name, brands or volume settings |
| `position-keywords-add`, `position-keywords-delete`, `position-keyword-tags` | manage tracked keywords and tags |
| `position-competitors-set` | replace the tracked competitor list |
| `position-alerts`, `position-alert-counts`, `position-triggers`, `position-trigger-count` | read alerts, rules and counts |
| `position-trigger-create`, `position-trigger-update`, `position-trigger-delete` | create, replace or delete an alert rule |
| `position-overview`, `position-pages`, `position-overview-trend` | rankings, landing pages and trends |
| `audit-status`, `audit-snapshots`, `audit-snapshot` | check progress and read audit results |
| `audit-pages`, `audit-page`, `audit-issue`, `audit-history` | inspect crawled pages, issues and crawl history |
| `audit-recrawl`, `audit-abort`, `audit-finalize` | recrawl a page, cancel a crawl or process results early |
| `audit-export-pages`, `audit-export-issues`, `audit-export-issue` | download native csv or xlsx reports |
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

### saved keywords

manage the collections you see in semrush's saved keywords page:

```bash
semrush saved-keyword-lists
semrush saved-keyword-list-create --name 'content ideas' --confirm
```

copy the returned collection id into `--list-id`, then import or filter keywords:

```bash
semrush saved-keywords-import --list-id 123 \
  --keywords '["email marketing","email automation"]' --tags '["research"]' --database us --confirm
semrush saved-keywords --list-id 123 --filter 'volume >= 100 AND phrase CONTAINS "email"'
semrush saved-keywords-summary --list-id 123
semrush saved-keyword-list-tags --list-id 123
```

saved collection and keyword ids are decimal strings. keep the quotes inside json arrays, such as `'["789","790"]'`. mcp inputs use `"list_id": "123"`, too.

use keyword ids from the results to tag, label or transfer a selection:

```bash
semrush saved-keywords-add-tags --list-id 123 --keyword-ids '["789"]' --tags '["priority"]' --confirm
semrush saved-keywords-label --list-id 123 --keyword-ids '["789"]' --labels '["content_written"]' --confirm
semrush saved-keywords-copy --list-id 123 --target-list-id 456 --keyword-ids '["789"]' --confirm
```

selection writes require either `--keyword-ids` or a non-empty `--filter`, never both. missing selections fail before sending a request. copy and move require a different destination collection. workflow labels mark status; they don't start tracking or generate content.

delete keywords or whole collections, then restore them with the returned undo id while semrush still accepts it:

```bash
semrush saved-keywords-delete --list-id 123 --keyword-ids '["789"]' --confirm
semrush saved-keywords-undo-delete --undo-id '<undo_id>' --confirm
semrush saved-keyword-list-delete --list-ids '["123"]' --confirm
semrush saved-keyword-list-undo-delete --undo-id '<undo_id>' --confirm
```

exports use the same filters as reads. `--output` is required and refuses an existing file:

```bash
semrush saved-keywords-export --list-id 123 --output keywords.csv
semrush saved-keywords-export --list-id 123 --format csv_semicolon --output keywords-semicolon.csv
semrush saved-keywords-export --list-id 123 --format xlsx --output keywords.xlsx
```

### keyword strategy builder

use these commands for seed-based strategy generation and basket clustering:

```bash
semrush keyword-lists
semrush keyword-strategy-create --name 'email strategy' \
  --seed-keywords '["email marketing"]' --database us --confirm
semrush keyword-list-keywords --basket-id 123 --owner-id 456
semrush keyword-list-cluster --basket-id 123 --owner-id 456 --confirm
```

use `BasketID` and `Owner.ID` from the builder results. regular saved collections can share an underlying basket id with keyword strategy builder, but the request fields differ. saved keywords takes string `list_id`; builder commands take numeric `--basket-id` and `--owner-id`. project ids are separate.

strategy generation, clustering and metric updates can consume your account allowance. read their status explicitly; the cli doesn't poll automatically.

once a seed-based strategy finishes, inspect its topics, page opportunities and clusters:

```bash
semrush keyword-list-page-presets --basket-id 123 --owner-id 456
semrush keyword-list-pages --basket-id 123 --owner-id 456 --preset 1
semrush keyword-list-clusters --basket-id 123 --owner-id 456 --page 1 --page-size 20
```

page results use `data.Pages` with numeric `ID` fields. copy a page id to inspect or favorite it:

```bash
semrush keyword-list-page --basket-id 123 --owner-id 456 --page-id 789
semrush keyword-list-page-favorite --basket-id 123 --owner-id 456 --page-id 789 --confirm
semrush keyword-list-page-unfavorite --basket-id 123 --owner-id 456 --page-id 789 --confirm
```

seed-based topics and pages use a different api from domain strategies. use native preset codes from `keyword-list-page-presets`. clusters use one-based `--page` and accept `--parent-id` to narrow the topic. `--page-filters` accepts the native page filter object, separate from keyword rows' `--filters`. for example, `--page-filters '{"IsFavorite":{"Value":true}}'` selects favorites.

use `keyword-list-cluster-keywords --cluster-id 789` to read a cluster's keywords. `keyword-list-clusters-get`, `keyword-list-clusters-delete`, `keyword-list-clusters-update-metrics` and `keyword-list-clusters-updated` take `--cluster-ids '[789]'`. include `--basket-id` and `--owner-id` on each. deletion removes the selected clusters and their keywords. deletion and metric refresh need `--confirm`.

copy or move phrases, or the keywords in selected clusters, into another basket:

```bash
semrush keyword-list-keywords-copy --basket-id 123 --owner-id 456 \
  --target-basket-id 321 --target-owner-id 456 \
  --keywords '["email marketing"]' --database us --confirm
semrush keyword-list-clusters-move --basket-id 123 --owner-id 456 \
  --target-basket-id 321 --target-owner-id 456 --cluster-ids '[789]' --confirm
```

both source and destination need their own basket and owner ids. the destination must differ from the source. `keyword-list-keywords-move` uses the same phrase and database selection as copy; `keyword-list-clusters-copy` uses the same numeric cluster selection as move. moves remove the selected keywords from the source. all four commands need `--confirm`.

exports support `csv`, `csv_semicolon` and `xlsx`. `keyword-list-export` exports keyword rows matching `--filters`; `keyword-list-export-pages` exports keywords matching `--page-filters`. selected keyword exports use phrases and a database. selected cluster exports use numeric ids:

```bash
semrush keyword-list-export --basket-id 123 --owner-id 456 --output keywords.csv
semrush keyword-list-export-pages --basket-id 123 --owner-id 456 \
  --page-filters '{"IsFavorite":{"Value":true}}' --format xlsx --output favorites.xlsx
semrush keyword-list-export-keywords --basket-id 123 --owner-id 456 \
  --keywords '["email marketing"]' --database us --output selected-keywords.csv
semrush keyword-list-export-clusters --basket-id 123 --owner-id 456 \
  --cluster-ids '[789]' --format csv_semicolon --output clusters.csv
```

`--output` is required and refuses an existing file. mcp exports return artifact resources. see [keyword lists](https://semrush.micr.dev/docs/keyword-lists) for native filters and selection inputs.

### domain strategies

start a strategy from a domain, then read its generation status:

```bash
semrush domain-strategy-create --domain example.com --database us --dry-run
semrush domain-strategy-create --domain example.com --database us --confirm
semrush domain-strategies --name-filter example
semrush domain-strategy-summary
```

creation starts an asynchronous job and consumes your account allowance. the database defaults to `us`. copy the numeric `data.id` from the create result:

```bash
semrush domain-strategy-get --strategy-id 123
semrush domain-strategy-status --strategy-ids '[123]'
semrush domain-strategy-rename --strategy-id 123 --name 'content plan' --confirm
semrush domain-strategy-delete --strategy-ids '[123]' --dry-run
```

domain strategies are separate resources from `keyword-strategy-create` baskets and project folders. their ids must be safe json integers, including inside arrays. reads don't wait for generation to finish. the cli doesn't retry writes or poll automatically.

once generation finishes, choose `all`, `improve` for existing pages or `create` for new opportunities. filter by text, volume, difficulty and primary intent, then paginate with `--limit` and `--offset`:

```bash
semrush domain-strategy-presets --strategy-id 123
semrush domain-strategy-pages --strategy-id 123 --preset improve --volume-min 100 --limit 20 --offset 0
semrush domain-strategy-pages-summary --strategy-id 123 --preset improve --volume-min 100
```

copy a numeric page id from those results to inspect it:

```bash
semrush domain-strategy-page --page-id 456
semrush domain-strategy-page-urls --page-id 456
semrush domain-strategy-page-serp --page-id 456
semrush domain-strategy-existing-keywords --page-id 456
semrush domain-strategy-recommended-keywords --page-id 456
```

remove generated keywords with `domain-strategy-keywords-delete --keyword-ids '[789]' --confirm`. it requires explicit numeric keyword ids and has no undo. deleting a whole strategy with `domain-strategy-delete` also needs `--confirm`.

export the whole filtered strategy as native csv, semicolon csv or xlsx. exports accept text, metric and intent filters, but no page preset. `--output` is required and refuses an existing file:

```bash
semrush domain-strategy-export --strategy-id 123 --volume-min 100 --output strategy.csv
semrush domain-strategy-export --strategy-id 123 --format csv_semicolon --output strategy-semicolon.csv
semrush domain-strategy-export --strategy-id 123 --format xlsx --output strategy.xlsx
```

### position tracking

use the numeric seo project id returned by `project-enable-seo`. check your allowance, then create a target:

```bash
semrush position-limits --project-id 456
semrush position-create --project-id 456 --domain example.com \
  --keywords '["example domain"]' --location-id 2840 --confirm
```

keep the full returned campaign id, such as `456_789`:

```bash
semrush position-info --campaign-id 456_789
semrush position-keywords-add --campaign-id 456_789 \
  --keywords '["example website"]' --tags '["research"]' --confirm
semrush position-competitors-set --campaign-id 456_789 \
  --competitors '["example.org"]' --confirm
```

edit an existing target's address, business name, brand list or search volume type:

```bash
semrush position-configure --campaign-id 456_789 --business-name 'example business' --confirm
semrush position-configure --campaign-id 456_789 --business-name '' --confirm
semrush position-configure --campaign-id 456_789 --brands '["example"]' --confirm
semrush position-configure --campaign-id 456_789 --domain example.org --url-type rootdomain --confirm
```

`position-configure` reads the current target and preserves fields you omit. address changes require both `--domain` and `--url-type`. `--volume-type` accepts `national`, `regional` or `local`. an empty business name clears it. brands must contain at least one name; this command cannot clear the brand list because semrush ignores an empty array. engine, device and location changes remain outside this command.

new targets need time to collect rankings. use the dates from `position-info` for ranking, page and trend reports. competitor writes replace the whole list. see [position tracking](https://semrush.micr.dev/docs/position-tracking) for locations, tags, keyword deletion and report inputs.

### tracking alerts

list a target's alerts and alert rules, or read their counts:

```bash
semrush position-alerts --campaign-id 456_789 --page 1 --limit 20
semrush position-alert-counts --campaign-id 456_789
semrush position-triggers --campaign-id 456_789
semrush position-trigger-count --campaign-id 456_789
```

alert lists leave unread status unchanged. create a rule for a keyword entering the top 10, then use its returned trigger id to replace or delete it:

```bash
semrush position-trigger-create --campaign-id 456_789 --domain example.com \
  --condition enters_top --threshold 10 --confirm
semrush position-trigger-update --campaign-id 456_789 --trigger-id '<trigger_id>' \
  --domain example.com --condition leaves_top --threshold 20 --confirm
semrush position-trigger-delete --campaign-id 456_789 --trigger-id '<trigger_id>' --confirm
```

copy `--domain` exactly from `position-info`'s `data.campaign_settings.tracking_url`, or use a competitor url from that result. thresholds run from 1 to 100. keep trigger ids as strings. updates replace the rule, so supply its domain, condition and threshold together. writes require `--confirm`, or use `--dry-run` to preview them.

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

creating an audit saves its settings. starting it is a separate command. defaults are manual scheduling and email off.

inspect pages and issues after the crawl, then download a report:

```bash
semrush audit-pages --campaign-id 456 --page 0 --limit 20
semrush audit-page --campaign-id 456 --page-id '<page_id>'
semrush audit-issue --campaign-id 456 --snapshot-id '<snapshot_id>' --issue-id 2
semrush audit-history --campaign-id 456
semrush audit-export-pages --snapshot-id '<snapshot_id>' --output pages.csv
semrush audit-export-issues --snapshot-id '<snapshot_id>' --format xlsx --output issues.xlsx
```

copy page and snapshot ids from the results. exports require `--output` and refuse an existing file. they download semrush's native csv or xlsx files.

`audit-recrawl` queues a page again. `audit-abort` cancels a running crawl; `audit-finalize` stops collecting pages and processes what it has. these writes need `--confirm`. see [site audit](https://semrush.micr.dev/docs/site-audit) for crawl settings, stop conditions and limits.

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

export tools return an artifact resource uri instead of writing to a local `--output` path. read the resource in base64 chunks and join the decoded bytes. chunks default to 64 kib, with a maximum of 1 mib. downloads last for that mcp process. see the [mcp guide](https://semrush.micr.dev/docs/mcp) for offsets and resource reads.

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

the cli uses the published [`galleton` 0.1.0 sdk](https://www.npmjs.com/package/galleton). the bundled galleton daemon is still required for sessions. building it from source requires go 1.23 or newer, `tar` and `patch`. published cli packages include the daemon for supported platforms, so npm users do not need go.

## documentation

full docs live at [semrush.micr.dev](https://semrush.micr.dev). setup, authentication, projects, saved keywords, keyword strategy builder, position tracking, site audits, exports, mcp and the complete command reference.

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
