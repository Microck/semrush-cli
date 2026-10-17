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

`semrush` is a terminal cli for semrush. research keywords, check rankings and backlinks, compare competitors, manage projects and keyword lists, track positions, add chart notes, and run site audits from your own account. output is json, so you can pipe it into `jq` or give the same commands to an agent through mcp. built with typescript and effect.

[documentation](https://semrush.micr.dev) | [command reference](https://semrush.micr.dev/docs/reports) | [npm](https://www.npmjs.com/package/semrush-cli) | [mcp](https://semrush.micr.dev/docs/mcp)

![keyword research demo](assets/demo-keywords.gif)

## why

if you already pay for semrush, you should be able to use it from the terminal too. this cli uses your existing web session, so there is no developer api key to buy or configure. look up a keyword, save the result, compare a few domains, or let an agent do it through mcp.

your plan's permissions and limits still apply. this doesn't cover the whole semrush suite. full ads research, ai prompt workflows, local, social and connected content tools remain outside verified coverage. the [coverage page](https://semrush.micr.dev/docs/coverage) lists what works, what is blocked and what still needs the web ui.

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

`auth status --check` and `doctor` verify an authenticated account report and include `account.email` when semrush supplies it. use it to check which account the cli is using.

already have a signed-in browser with a local debugging port? import its session instead:

```bash
semrush auth import --cdp-url http://127.0.0.1:9234
semrush doctor
```

the browser has to be running with debugging enabled. import doesn't start or stop it. see the [authentication guide](https://semrush.micr.dev/docs/authentication) for headless hosts and remote browsers.

semrush can expire your session. sign in or import again when that happens. the cli saves rotated cookies after successful requests, but doesn't renew expired sessions in the background.

if semrush redirects to `/multilogin/`, the cli reports that session confirmation is required before sending a report. resolve the prompt in your signed-in browser, then reimport its session.

```bash
semrush auth logout
semrush daemon stop
semrush daemon start
```

logout forgets this cli's saved session. it doesn't log out your other browsers. the daemon keeps running after the terminal closes. start it again after a reboot.

## command surface

336 operations, available as cli commands and mcp tools. 235 reads and 101 writes that need explicit confirmation.

| command | what it does |
| --- | --- |
| `keyword-overview`, `keyword-magic` | volume, difficulty, cpc, intent, related keywords and filtered research |
| `keyword-magic-groups`, `keyword-magic-groups-summary`, `keyword-magic-topic-suggestions`, `keyword-magic-access` | inspect groups, group totals, suggested phrases and product limits |
| `keyword-serp`, `keyword-ads`, `keyword-clusters` | search results, ads and keyword clusters |
| `keyword-countries`, `keyword-bulk`, `keyword-product-ads` | country metrics, bulk keyword research and product listing ad previews |
| `keyword-serp-organic-metrics`, `keyword-serp-backlink-metrics` | enrich selected search result urls with organic or backlink metrics |
| `keyword-bulk-export`, `keyword-serp-export`, `keyword-serp-domains-export` | download native keyword, search result url or domain tables |
| `keyword-locations`, `keyword-local-overview`, `keyword-local-serp` | find locations and read current local keyword metrics and search results |
| `keyword-local-serp-organic-metrics`, `keyword-local-serp-export` | enrich local result urls or download their native table |
| `keyword-serp-domain-organic-metrics`, `keyword-serp-domain-backlink-metrics` | read organic and backlink metrics for search result domains |
| `keyword-refresh`, `keyword-refresh-status` | request a confirmed metric refresh or read its status |
| `keyword-domain-suggestions`, `keyword-domain-root`, `keyword-domain-prepare`, `keyword-domain-status` | discover domains, resolve their roots and prepare personalized metrics |
| `keyword-ai-databases`, `keyword-ai-summary`, `keyword-ai-topics` | read keyword ai databases, native model volumes and topic samples |
| `domain-overview`, `domain-keywords`, `domain-competitors` | organic rankings and competing domains |
| `domain-pages`, `domain-subdomains`, `domain-position-changes` | pages, subdomains and ranking changes |
| `domain-position-changes-presets`, `domain-position-changes-daily-trend`, `domain-position-changes-monthly-trend` | read native comparison presets and ranking change trends |
| `keyword-gap`, `backlink-gap` | compare domains and find keyword or backlink opportunities |
| `backlink-links`, `backlink-referring-domains`, `backlink-anchors` | inspect backlinks, referring domains and anchor text |
| `backlink-audit-limits`, `backlink-audit-project`, `backlink-audit-scopes`, `backlink-audit-create` | check allowance and scope, then start a backlink audit |
| `backlink-audit-campaigns`, `backlink-audit-info`, `backlink-audit-status`, `backlink-audit-configure` | find campaigns, read progress and change selected settings |
| `backlink-audit-replace-scope` | replace an audit's scope and discard its old analysis |
| `backlink-audit-links-summary`, `backlink-audit-links-history`, `backlink-audit-authority-distribution` | inspect profile totals, history and distributions |
| `backlink-audit-links`, `backlink-audit-links-count` | filter audit rows or count matching backlinks |
| `backlink-audit-target-pages`, `backlink-audit-target-pages-count` | inspect linked target pages and their counts |
| `backlink-audit-tags`, `backlink-audit-tag-counts` | read target-page labels and their counts |
| `backlink-audit-target-tag-add`, `backlink-audit-target-tag-remove`, `backlink-audit-tag-delete` | label a target page, remove one association or delete a label |
| `backlink-audit-comments`, `backlink-audit-comment-save`, `backlink-audit-comment-delete` | read, write or delete referring-domain comments |
| `backlink-audit-export` | download filtered audit rows as native csv |
| `backlink-audit-import` | import source page urls from csv and start analysis |
| `backlink-audit-move-domains`, `backlink-audit-move-links`, `backlink-audit-move-networks` | move selections between review, whitelist, remove and disavow lists |
| `backlink-audit-disavow`, `backlink-audit-disavow-count`, `backlink-audit-disavow-counters` | inspect disavow entries and workflow totals |
| `backlink-audit-disavow-import`, `backlink-audit-disavow-export` | import or export native disavow txt files |
| `backlink-audit-disavow-move`, `backlink-audit-disavow-delete`, `backlink-audit-disavow-clear` | move or delete selected entries, or clear explicitly chosen sources |
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
| `keyword-list-export-mindmap` | download a structured strategy's native mind map as jpg or png |
| `domain-strategies`, `domain-strategy-get`, `domain-strategy-summary`, `domain-strategy-status` | find domain strategies and read generation status |
| `domain-strategy-create`, `domain-strategy-rename`, `domain-strategy-delete` | start domain strategy generation, rename or delete strategies |
| `domain-strategy-presets`, `domain-strategy-pages`, `domain-strategy-pages-summary` | filter and page through existing or new page opportunities |
| `domain-strategy-page`, `domain-strategy-page-urls`, `domain-strategy-page-serp` | inspect page details, matching urls and search results |
| `domain-strategy-existing-keywords`, `domain-strategy-recommended-keywords` | read ranking keywords and recommendations for a page |
| `domain-strategy-keywords-delete`, `domain-strategy-export` | remove selected generated keywords or export a filtered strategy |
| `onpage-campaigns`, `onpage-info`, `onpage-limits`, `onpage-settings` | find on page seo checker campaigns and read their state, allowance and settings |
| `onpage-overview`, `onpage-pages`, `onpage-progress`, `onpage-serps`, `onpage-serp` | read page priorities, optimization ideas, trends and collected search results |
| `onpage-page-keywords`, `onpage-page-ideas`, `onpage-page-details`, `onpage-page-keyword-details` | inspect one page snapshot's metrics and recommendations |
| `onpage-create`, `onpage-configure`, `onpage-location-set` | configure an seo project or change checker settings |
| `onpage-page-add`, `onpage-page-update`, `onpage-pages-add`, `onpage-pages-delete` | manage landing pages and keyword assignments |
| `onpage-run`, `onpage-page-run` | start campaign analysis or rerun one page |
| `audit-create`, `audit-configure`, `audit-start` | configure and launch a site audit |
| `audit-urls-upload` | upload a text or csv url list for an audit |
| `position-create`, `position-targets`, `position-info` | create targets and read tracking settings |
| `position-configure` | edit tracking address, business name, brands or volume settings |
| `position-keywords` | read the complete tracked keyword and tag list, even before rankings arrive |
| `position-replace` | change engine, device, location or language and clear the target's ranking history |
| `position-delete` | permanently delete one target and its ranking history |
| `position-keywords-add`, `position-keywords-delete`, `position-keyword-tags` | manage tracked keywords and tags |
| `position-competitors-set` | replace the tracked competitor list |
| `position-alerts`, `position-alert-counts`, `position-triggers`, `position-trigger-count` | read alerts, rules and counts |
| `position-alert-read`, `position-alert-mark-all-read`, `position-alert-delete` | read and mark an alert, mark all alerts read or delete one alert |
| `position-trigger-create`, `position-trigger-update`, `position-trigger-delete` | create, replace or delete an alert rule |
| `position-overview`, `position-pages`, `position-overview-trend` | rankings, landing pages and trends |
| `position-distribution`, `position-competitors`, `position-targets-compare` | ranking buckets, competitor discovery and device/location comparisons |
| `audit-status`, `audit-snapshots`, `audit-snapshot` | check progress and read audit results |
| `audit-pages`, `audit-page`, `audit-issue`, `audit-history` | inspect crawled pages, issues and crawl history |
| `audit-recrawl`, `audit-abort`, `audit-finalize` | recrawl a page, cancel a crawl or process results early |
| `audit-export-pages`, `audit-export-issues`, `audit-export-issue` | download native csv or xlsx reports |
| `audit-export-page-issues` | download the latest crawl's page-by-issue matrix |
| `audit-export-markup` | download a crawl's markup and structured data |
| `audit-export-compare` | download a comparison of two crawls |
| `audit-export-all` | collect available native reports in one zip with an availability manifest |
| `audit-js-impact-guide`, `audit-js-impact-changed-pages`, `audit-js-impact-pages` | inspect changes caused by javascript rendering |
| `audit-export-js-impact` | download matching javascript impact rows as csv or xlsx |
| `audit-web-vitals-status`, `audit-web-vitals-overview`, `audit-web-vitals-pages` | inspect core web vitals processing and page metrics |
| `audit-web-vitals-history`, `audit-web-vitals-recommendations`, `audit-web-vitals-improvements` | read page history, lighthouse recommendations and top improvements |
| `audit-web-vitals-settings`, `audit-web-vitals-settings-set` | read or replace the urls selected for the next audit |
| `notes`, `note`, `note-databases`, `note-hidden-categories` | list and read chart notes, database options and hidden categories |
| `notes-export` | download all chart notes as native csv |
| `note-create`, `note-update`, `note-delete` | create, edit or delete your own user notes |
| `note-hide`, `note-show`, `note-hidden-categories-set` | change note visibility or replace hidden categories for a chart |
| `reporting-overview` | read my reports access, quotas and templates, then filter and page through saved reports |
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

keyword magic accepts a prepared `--domain` for personalized metrics. choose topic or word grouping, read group totals, or inspect suggested phrases and product limits:

```bash
semrush keyword-magic --keyword 'email marketing' --domain example.com
semrush keyword-magic-groups --keyword 'email marketing' --group-by words --groups-sort-field volume
semrush keyword-magic-groups-summary --keyword 'email marketing' --group-by topics
semrush keyword-magic-topic-suggestions --keyword 'email marketing'
semrush keyword-magic-access
```

topics are the default. personalized keyword rows default to relevance order for topics and volume for word groups. `--groups-sort-field count|volume` and `--groups-descending` apply only to word grouping. these reads do not prepare a domain or refresh keywords. access returns keyword magic's own product flags, row limits and update allowance. report requests wait up to 90 seconds and make one attempt. keyword magic exports remain unsupported because the native export job failed before producing a file.

pull out the numbers you care about:

```bash
semrush keyword-overview --keyword 'email marketing' \
  | jq '.data | {phrase, volume, difficulty, cpc}'
```

check country metrics or compare up to 100 unique keywords:

```bash
semrush keyword-countries --keyword 'email marketing'
semrush keyword-bulk --keywords '["email marketing","email automation"]' --currency EUR
semrush keyword-product-ads --keyword 'running shoes'
```

`keyword-overview`, `keyword-ideas`, `keyword-ideas-summary`, `keyword-serp` and `keyword-ads` accept `--device desktop|mobile`, `--date YYYYMM` and `--currency USD`. desktop, current data and usd are the defaults; use a currency code semrush supports. countries, product ads and the two url metrics commands accept those options too. bulk commands read current data only and do not accept device or date.

bulk inputs are json arrays of one to 100 unique phrases. an optional `--domain` reads personalized metrics already prepared by semrush; it does not start a domain update.

copy one to 100 exact http or https urls from `keyword-serp` to read their organic and backlink metrics. repeated urls are allowed:

```bash
semrush keyword-serp-organic-metrics --keyword 'email marketing' --urls '["https://example.com/"]'
semrush keyword-serp-backlink-metrics --keyword 'email marketing' --urls '["https://example.com/"]'
```

export bulk keywords or search result urls and domains as native tables:

```bash
semrush keyword-bulk-export --keywords '["email marketing","email automation"]' --output keywords.csv
semrush keyword-serp-export --keyword 'email marketing' --format xlsx --output serp-urls.xlsx
semrush keyword-serp-domains-export --keyword 'email marketing' --format csv_semicolon --output serp-domains.csv
```

all three exports accept `csv`, `csv_semicolon` or `xlsx`, default to csv and require an unused `--output` path. serp exports accept device and date, but no currency. mcp returns artifact resources.

bulk exports accept `--columns` as a json array of `keyword`, `intent`, `volume`, `trend`, `difficulty`, `cpc`, `competition`, `serp_features`, `results`, `personalized_difficulty`, `positions` or `potential_traffic`. the last three require `--domain`. see [keyword research](https://semrush.micr.dev/docs/keyword-research) for the full inputs and verification limits.

find a location, then read local keyword metrics and search results:

```bash
semrush keyword-locations --database us --input 'New York'
semrush keyword-local-overview --keyword 'email marketing' --location-id 21167
semrush keyword-local-serp --keyword 'email marketing' --location-id 21167
semrush keyword-local-serp-export --keyword 'email marketing' --location-id 21167 --output local-serp.csv
```

use the location id returned for your database. local research reads current desktop data only, without mobile, historical dates or personalized domain metrics. local url metrics take one to 100 `--urls` from the result, including repeats. local exports accept `csv`, `csv_semicolon` or `xlsx` and require an unused `--output` path; they have no currency option.

for national results, pass one to 100 distinct bare domains to `keyword-serp-domain-organic-metrics` or `keyword-serp-domain-backlink-metrics`:

```bash
semrush keyword-serp-domain-organic-metrics --keyword 'email marketing' --domains '["example.com"]'
semrush keyword-serp-domain-backlink-metrics --keyword 'email marketing' --domains '["example.com"]'
```

research reads use cached data and do not request fresh metrics. preview a refresh separately, then use `--confirm` if you want to spend the native update allowance:

```bash
semrush keyword-refresh --keywords '["email marketing"]' --location-id 21167 --dry-run
semrush keyword-refresh-status --keywords '["email marketing"]' --location-id 21167
```

refresh accepts one to 100 unique keywords. omit `--location-id` or use `0` for national data. the cli returns semrush's quota receipt and statuses without retrying or polling. if a refresh response is lost, read its status before submitting another request. mcp exposes these operations with underscores.

prepare a domain before requesting personalized keyword metrics:

```bash
semrush keyword-domain-suggestions
semrush keyword-domain-root --domain www.example.com
semrush keyword-domain-prepare --domain www.example.com --dry-run
semrush keyword-domain-prepare --domain www.example.com --confirm
```

preparation resolves the root online and returns `data.domain` plus semrush's `data.preparation` receipt. native status `1` is pending and includes a job id. status `2` is ready and may have no job id. when pending, pass the returned root and non-empty id to a separate status read:

```bash
semrush keyword-domain-status --domain example.com --job-id '<job_id>'
semrush keyword-overview --keyword 'email marketing' --domain example.com
```

preparation and status do not poll or retry automatically. an empty job id is rejected because the native request would start preparation again. keyword overview, countries, ideas, idea totals, serp and clusters accept an optional prepared root domain without preparing it themselves. current mobile personalization is supported; combining a domain with a historical month is rejected. national `keyword-serp --limit` accepts up to 1000 rows and defaults to 10.

read keyword overview's ai volumes and topic samples:

```bash
semrush keyword-ai-databases
semrush keyword-ai-summary --keyword 'running shoes' --database us
semrush keyword-ai-topics --keyword 'running shoes' --database us
```

these reads use current national data, with an optional prepared `--domain`. use a database from `keyword-ai-databases`. the summary can report a larger topic count than the sample returned by `keyword-ai-topics`; the native topic endpoint returns five samples. these commands do not manage ai toolkit prompts or export the full counted topic set.

### competitors and backlinks

```bash
semrush domain-overview --domain openai.com
semrush domain-keywords --domain openai.com --page-size 20
semrush keyword-gap --domains '["openai.com","anthropic.com"]'
semrush backlink-links --domain openai.com
semrush backlink-gap --domains '["openai.com","anthropic.com"]'
```

compare organic research snapshots and select the changes you want:

```bash
semrush domain-position-changes --domain openai.com \
  --date-range '{"start_date":"20261001","end_date":"20261015"}' \
  --change-types '["new","improved"]' --positions-type organic
semrush domain-position-changes --domain openai.com --date-type monthly \
  --date-range '{"start_date":"202609","end_date":"202610"}'
semrush domain-position-changes-presets --domain openai.com
semrush domain-position-changes-daily-trend --domain openai.com
semrush domain-position-changes-monthly-trend --domain openai.com
```

use `YYYYMMDD` for daily comparisons or `YYYYMM` with `--date-type monthly`. an explicit date range cannot be combined with a snapshot `--date`. `--change-types` takes unique `new`, `improved`, `declined` or `lost` values; omit it for all changes. `domain-keywords` and `domain-position-changes` accept `--positions-type all|organic|serp` to select all positions, organic rankings or serp features. use a mobile database such as `mobile-us` for mobile research. see [organic research](https://semrush.micr.dev/docs/organic-research) for the comparison inputs.

### backlink audit

backlink audit stores a campaign under an seo project, separate from backlink analytics. enable seo first, then check your allowance and available scopes:

```bash
semrush project-enable-seo --folder-id 123 --confirm
semrush backlink-audit-limits
semrush backlink-audit-project --project-id 456
semrush backlink-audit-scopes --project-id 456
semrush backlink-audit-create --project-id 456 --scope root --confirm
semrush backlink-audit-info --project-id 456
```

use the returned seo project id for `--project-id`. creation starts analysis immediately and consumes your allowance. recurring analysis defaults to `never`, with recurring email notifications and majestic refresh off.

copy the campaign's `userDomainId` into `--audit-id`; it differs from the folder and seo project ids:

```bash
semrush backlink-audit-status --audit-id 789
semrush backlink-audit-links-summary --audit-id 789
semrush backlink-audit-links-history --audit-id 789
semrush backlink-audit-authority-distribution --audit-id 789
semrush backlink-audit-links --audit-id 789 --mode for-review
semrush backlink-audit-links-count --audit-id 789 --category-id 6
semrush backlink-audit-configure --audit-id 789 --brands '["Example"]' --confirm
```

settings updates change only supplied fields. omitted settings and integrations remain intact. tables group by referring domain by default; use `--by-domain false` for individual links.

import backlinks from a one-column csv with source page urls in the first column:

```bash
semrush backlink-audit-import --audit-id 789 --contents-file backlinks.csv --dry-run
semrush backlink-audit-import --audit-id 789 --contents-file backlinks.csv --confirm
semrush backlink-audit-status --audit-id 789
```

use the pages that contain the backlinks, not their destination urls. do not use a native audit export as the import template. the audit must be ready with `statusId: 1`, `isLocked: false` and `isLockedSettings: false`. import checks that semrush staged at least one url before starting analysis. a successful response acknowledges the asynchronous crawl; check status again for completion. recurring analysis stays unchanged, including `never` for manual runs.

move selected rows with `backlink-audit-move-domains` or `backlink-audit-move-links`, using their native `id` values in `--ids`, not `urlHash`. `backlink-audit-move-networks` takes numeric `linkNetworkId` values. choose `--list for-review`, `whitelist`, `to-remove` or `disavow`, then add `--confirm`. move back to the original list to reverse a move.

read the disavow list and its counts, then export its native txt file:

```bash
semrush backlink-audit-disavow --audit-id 789
semrush backlink-audit-disavow-count --audit-id 789
semrush backlink-audit-disavow-counters --audit-id 789
semrush backlink-audit-disavow-export --audit-id 789 --output disavow.txt --confirm
semrush backlink-audit-disavow-import --audit-id 789 --contents-file current-disavow.txt --confirm
```

export requires a ready, unlocked audit and refuses an existing output file. it marks entries exported in semrush, so it requires confirmation. import can remove earlier file-imported entries missing from the new file. export first and include entries you want to retain, then inspect `backlink-audit-status` and the list after importing.

`backlink-audit-disavow-move` and `backlink-audit-disavow-delete` take a numeric `--item-id` from the disavow list. move also needs `--list for-review`, `whitelist` or `to-remove`. `backlink-audit-disavow-clear` requires an explicit source selection with `--with-manual true`, `--with-file true` or `--with-gdt true`. these writes need `--confirm`; use `--dry-run` to preview them.

these commands change lists in semrush. they do not contact website owners or upload to google.

inspect target pages and label a url returned in a row's `urls` array:

```bash
semrush backlink-audit-target-pages --audit-id 789
semrush backlink-audit-target-tag-add --audit-id 789 \
  --target-url https://example.com/ --label review --confirm
semrush backlink-audit-target-pages --audit-id 789 --labels '["review"]'
semrush backlink-audit-tags --audit-id 789
semrush backlink-audit-tag-counts --audit-id 789
```

replace the example url with one from your results. `backlink-audit-target-tag-remove` removes one url's label; `backlink-audit-tag-delete` deletes the label across the campaign. both need `--audit-id`, `--label` and `--confirm`; removal also needs `--target-url`.

save a comment using a backlink row's `source` domain, then read or delete it with the returned numeric comment id:

```bash
semrush backlink-audit-comment-save --audit-id 789 \
  --domain example.net --comment 'check this domain' --confirm
semrush backlink-audit-comments --audit-id 789 --ids '[321]'
semrush backlink-audit-comment-delete --audit-id 789 --comment-id 321 --confirm
```

replace `321` with your comment id. saving again for the same domain replaces the text.

export the audit table as csv, with the same filters used for link reads:

```bash
semrush backlink-audit-export --audit-id 789 --output backlinks.csv
semrush backlink-audit-export --audit-id 789 \
  --query example.net --query-mode url --output selected-backlinks.csv
```

csv export downloads all matching rows, waits up to five minutes for semrush to prepare the file and refuses an existing destination. it works with the verified guru session even though that account's web ui shows a trial upgrade dialog. it does not need `--confirm`. mcp returns an artifact resource.

replace an existing audit's scope when you want to discard its old analysis:

```bash
semrush backlink-audit-replace-scope --project-id 456 --scope both --dry-run
semrush backlink-audit-replace-scope --project-id 456 --scope both --confirm
semrush backlink-audit-info --project-id 456
```

replacement creates a fresh audit id. read `backlink-audit-info` again and use the new `userDomainId` for later audit commands. the audit must be ready, unlocked and editable; choosing its current scope fails before writing.

the cli reads current settings and preserves them in one write, including empty brands, categories and countries, manual scheduling and disabled notifications. it never retries the replacement. if the response is lost, inspect the project before sending another write. mcp exposes the same operation as `backlink_audit_replace_scope`.

pdf reports and connected services remain outside cli coverage. see [backlink audit](https://semrush.micr.dev/docs/backlink-audit) for filters, scope choices and disavow behavior.

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

select phrases from keyword magic or keyword gap, then pass them to `saved-keywords-import` or `position-keywords-add`. saved collections also appear as builder baskets. the [keyword workflow guide](https://semrush.micr.dev/docs/keyword-workflows) shows how to select, save and track phrases with `jq`. importing into a list does not start tracking.

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

download the native mind map for an existing structured strategy:

```bash
semrush keyword-list-export-mindmap --basket-id 123 --owner-id 456 --output mindmap.jpg
semrush keyword-list-export-mindmap --basket-id 123 --owner-id 456 --format png --output mindmap.png
```

use `BasketID` and `Owner.ID` from `keyword-lists`. jpg is the default and has a white background; png has a transparent background. the native image is 4336 x 2228 pixels and shows up to seven topics, plus a count of extra topics. use the table exports above for all rows.

this command downloads the image from semrush's web renderer without changing its bytes. it does not start clustering or strategy generation. `--output` is required and refuses an existing file. mcp exposes `keyword_list_export_mindmap` and returns an artifact resource with `data: null`.

live checks on raft verified both the source and a fresh npm install of v0.25.0. cli and mcp downloads matched native jpg and png bytes exactly, including image dimensions, file sizes and resource reads. the authenticated connection check passed too.

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
semrush position-keywords --campaign-id 456_789
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

new targets need time to collect rankings. `position-keywords` reads the complete keyword and tag list before ranking data arrives. use the dates from `position-info` for ranking, page and trend reports. competitor writes replace the whole list. see [position tracking](https://semrush.micr.dev/docs/position-tracking) for locations, tags, keyword deletion and report inputs.

### replace or delete a tracking target

`position-replace` changes the search engine, device, location or language. it permanently clears that target's ranking history. create a separate target if you need to keep history.

```bash
semrush position-replace --campaign-id 456_789 --device phone --dry-run
semrush position-replace --campaign-id 456_789 --device phone --confirm
```

supply at least one of `--engine`, `--device`, `--location-id` or `--language-code`. replacement reads and preserves the current keywords, tags, title, url, business name, brands, weekly notification and volume settings. time zone defaults to utc; use `--timezone` for another whole-hour offset. use the returned `data.result.id` as the campaign id for later commands.

location ids depend on the search engine. before switching engines, resolve the location and language options for the new engine:

```bash
semrush position-locations --query 'United Kingdom' --engine bing
```

do not reuse google's location ids for bing. pass the resolved id with `--location-id` when replacing the target.

preview deleting one target:

```bash
semrush position-delete --campaign-id 456_789 --dry-run
```

use `--confirm` to delete it and its ranking history permanently. other targets and the seo project remain. both writes require an editable target and do not retry automatically. dry runs show supplied changes without reading current settings.

### tracking competitors and targets

read ranking buckets for selected websites, discover competitors or compare your device and location targets. use dates within the history returned by `position-info`, in `YYYYMMDD` format:

```bash
semrush position-distribution --campaign-id 456_789 --date-begin 20261001 --date-end 20261015 \
  --competitors '["*.example.com/*"]' --sort-field top10 --sort-top new
semrush position-competitors --campaign-id 456_789 --date-begin 20261001 --date-end 20261015 \
  --main-competitor example.com --url-type rootdomain --sort-field matches --limit 20 --offset 0
semrush position-targets-compare --campaign-id 456_789 --date-begin 20261001 --date-end 20261015 \
  --competitors '["*.example.com/*"]' --target-ids '["456_789","456_790"]' \
  --intersection-type shared --sort-target 1
```

distribution returns the selected competitors without pagination. `--sort-top` accepts `all`, `new`, `lost`, `improved` or `declined` when sorting a top-position bucket. competitor discovery takes a website and url type; it supports `--limit` and `--offset`.

target comparison takes exactly one website pattern and complete target ids from `position-targets`. keep those composite ids as strings. choose `all`, `shared`, `not_in_main` or `only_in_main` for the keyword intersection. `--sort-target` starts at zero and selects a target in your array, so `1` sorts by the second target. use `--help` for each report's sort fields.

### tracking alerts

list a target's alerts and alert rules, or read their counts:

```bash
semrush position-alerts --campaign-id 456_789 --page 1 --limit 20
semrush position-alert-counts --campaign-id 456_789
semrush position-triggers --campaign-id 456_789
semrush position-trigger-count --campaign-id 456_789
```

alert lists leave unread status unchanged. use an exact `alert_id` string from `position-alerts` to read and mark one event, or preview deleting it:

```bash
semrush position-alert-read --campaign-id 456_789 --alert-id '<alert_id>' --confirm
semrush position-alert-mark-all-read --campaign-id 456_789 --dry-run
semrush position-alert-delete --campaign-id 456_789 --alert-id '<alert_id>' --dry-run
```

`position-alert-read` returns the alert detail and marks it read, so it requires confirmation. `position-alert-mark-all-read --confirm` marks every alert in that target read across all pages. `position-alert-delete --confirm` permanently deletes the selected event. these commands do not change alert rules, and they do not retry writes. mcp exposes the same operations with underscores and requires `confirm: true` or `dry_run: true`.

stateful http fixtures verify event changes. live source cli and mcp checks matched native responses when marking an empty target read and native failures when reading or deleting a missing event. positive live event changes remain unverified because the owned target had no alert events.

create a rule for a keyword entering the top 10, then use its returned trigger id to replace or delete it:

```bash
semrush position-trigger-create --campaign-id 456_789 --domain example.com \
  --condition enters_top --threshold 10 --confirm
semrush position-trigger-update --campaign-id 456_789 --trigger-id '<trigger_id>' \
  --domain example.com --condition leaves_top --threshold 20 --confirm
semrush position-trigger-delete --campaign-id 456_789 --trigger-id '<trigger_id>' --confirm
```

copy `--domain` exactly from `position-info`'s `data.campaign_settings.tracking_url`, or use a competitor url from that result. thresholds run from 1 to 100. keep trigger ids as strings. updates replace the rule, so supply its domain, condition and threshold together. writes require `--confirm`, or use `--dry-run` to preview them.

### my reports

read your reporting access, quotas, privacy acknowledgment status and native templates:

```bash
semrush reporting-overview
semrush reporting-overview --ownership own --branding branded --schedule weekly --search seo
semrush reporting-overview --ownership own --branding branded --schedule weekly --search seo --offset 30
```

the result includes up to 30 matching saved reports, newest update first, with their schedules and at most one ready task per report. `--ownership` accepts `all`, `own`, `shared` or `team`; `--branding` accepts `all`, `branded` or `standard`; `--schedule` accepts `all`, `daily`, `weekly` or `monthly`. `--search` matches report names with semrush's native contains filter. the filters combine and default to `all` with no search.

start at offset `0`, then use `30`, `60` and so on with the same filters. stop when the page is empty or the offset reaches the filtered total. concurrent edits can change page order. offsets must be whole numbers between `0` and `2147483647`.

task filenames are metadata; this command does not download pdfs or change schedules. mcp exposes `reporting_overview` with the same optional filters and offset.

live checks verified both the source and a fresh npm install of v0.27.0. cli and mcp matched the native query on a guru account with 34 templates, no saved reports and three essential report slots. the account had not accepted reporting's privacy policy. report creation, saving and pdf generation remain unsupported; the native workflow requires an explicit privacy acknowledgment.

live source and fresh npm v0.28.0 cli and mcp checks matched native results for nine filter and pagination selections. the account had no saved reports, so populated pages and positive filter matches have stateful http fixture coverage only.

### chart notes

read notes for a chart, then inspect a note by its returned id:

```bash
semrush notes --tools '["DOMAIN_OVERVIEW"]' --database us --page 1 --per-page 20
semrush note --note-id '<note_id>'
semrush note-databases
semrush note-hidden-categories --tool POSITION_TRACKING --project-id 456
```

lists include hidden notes by default. use `--categories '["USER_NOTE"]'` to select user notes, or `--datetime-from` and `--datetime-to` with utc timestamps such as `2026-10-15T00:00:00Z` to narrow the dates. project filters use numeric seo project ids.

export all notes as semrush's native csv:

```bash
semrush notes-export --output notes.csv
```

export does not apply list filters. `--output` is required and refuses an existing file.

create a note for a change you want to track:

```bash
semrush note-create --title 'updated landing page' --datetime 2026-10-15T12:00:00Z \
  --tools '["DOMAIN_OVERVIEW"]' --databases '["US"]' --confirm
semrush note-update --note-id '<note_id>' --note 'changed the headline and signup form' --confirm
semrush note-delete --note-id '<note_id>' --dry-run
```

`note-update` reads the current note and preserves fields you omit. pass `--note ''` or `--link ''` to clear those fields. only your own editable user notes can be updated or deleted. published notes and other users' notes are protected.

note creation and updates use uppercase database codes such as `US`, or `ALL`. domain overview and organic positions notes need a database selection. omitting `--project-id` when creating a note applies it to all projects.

hide or show a note without changing its content, or replace a chart's hidden categories:

```bash
semrush note-hide --note-id '<note_id>' --confirm
semrush note-show --note-id '<note_id>' --confirm
semrush note-hidden-categories-set --tool POSITION_TRACKING --project-id 456 \
  --categories '["GOOGLE_ORGANIC","UNCONFIRMED"]' --confirm
```

category writes replace the whole selection. use `--categories '[]'` to show every category. project tools require `--project-id` for category preferences. every notes write needs `--confirm`, or use `--dry-run` to preview it.

### on page seo checker

use an existing seo project id from `project-enable-seo`, then check its checker state and allowance:

```bash
semrush onpage-campaigns
semrush onpage-info --campaign-id 456
semrush onpage-limits --campaign-id 456
semrush onpage-create --campaign-id 456 \
  --landings '[{"url":"https://example.com/","keywords":["example website"]}]' --dry-run
```

use `--confirm` to configure an unconfigured project. setup saves the selected pages and keywords without starting analysis. manual scheduling and notifications off are the defaults. start analysis separately when ready:

```bash
semrush onpage-run --campaign-id 456 --confirm
semrush onpage-info --campaign-id 456
semrush onpage-overview --campaign-id 456
semrush onpage-pages --campaign-id 456
semrush onpage-progress --campaign-id 456
semrush onpage-serp --campaign-id 456 --keyword 'example website'
```

`onpage-progress` returns optimization ideas and daily trends, not a job percentage. use `onpage-info` and page analysis statuses to inspect a run. page snapshot reads require exact page and snapshot ids from the results:

```bash
semrush onpage-page-ideas --campaign-id 456 --page-id '<page_id>' --snapshot-id '<snapshot_id>'
semrush onpage-page-details --campaign-id 456 --page-id '<page_id>' --snapshot-id '<snapshot_id>' --detail readability
```

`onpage-configure` preserves settings you omit. location changes use `onpage-location-set`; page edits and location changes do not start another analysis. adding pages can reassign existing keywords, and page updates replace their url and keyword selection. all writes require `--confirm` or an offline `--dry-run`.

batch additions, selected-page deletions and analysis launches can return an empty acknowledgment. read `onpage-pages` or `onpage-info` afterward; the cli never retries those writes. see [on page seo checker](https://semrush.micr.dev/docs/on-page-seo-checker) for settings, batch inputs and detail reports. mcp exposes the same operations with underscores.

### site audits

```bash
semrush project-enable-seo --folder-id 123 --confirm
```

use the returned seo project `id` as the campaign id:

```bash
semrush audit-create --campaign-id 456 --domain example.com --page-limit 100 --confirm
semrush audit-start --campaign-id 456 --confirm
semrush audit-status --campaign-id 456
semrush audit-snapshots --campaign-id 456
```

creating an audit saves its settings. starting it is a separate command. defaults are manual scheduling and email off.

names belong to projects. rename one with `project-update --folder-id 123 --name 'my audit' --confirm`.

upload a text or csv url list, then select it as the crawl source:

```bash
semrush audit-urls-upload --campaign-id 456 --contents-file urls.txt --confirm
semrush audit-configure --campaign-id 456 --domain example.com --page-limit 100 \
  --crawl-source-type 3 --confirm
semrush audit-start --campaign-id 456 --confirm
```

uploading does not configure or start a crawl. the file belongs to the campaign; leave `--crawl-source-url` empty for source type `3`. the filename is display metadata and defaults to `semrush-crawl-urls.txt`. use `--contents-file -` to read stdin. mcp accepts a `contents` string.

for a site behind http basic authentication, read the password from a file:

```bash
semrush audit-configure --campaign-id 456 --domain example.com --page-limit 100 \
  --auth-enabled true --auth-username USER --auth-password-file password.txt --confirm
```

`audit-create` accepts the same auth flags. use `--auth-password-file -` to read stdin. passwords are redacted in previews. when editing a protected audit, pass `--auth-enabled true` without credentials to keep them, or `--auth-enabled false` to disable authentication. changing credentials requires both username and password.

for web bot auth, save the complete header values supplied by the website owner in a json file:

```json
{
  "signature_agent": "<complete Signature-Agent value>",
  "signature_input": "<complete Signature-Input value>",
  "signature": "<complete Signature value>"
}
```

replace those placeholders, then enable it with the file:

```bash
semrush audit-configure --campaign-id 456 --domain example.com --page-limit 100 \
  --web-bot-auth-enabled true --web-bot-auth-file web-bot-auth.json --confirm
```

`audit-create` accepts the same flags. use `--web-bot-auth-file -` to read stdin. mcp takes a `web_bot_auth` object directly. all three fields are redacted in previews and responses. the cli does not create or renew third-party signatures.

when editing an audit that already uses web bot auth, pass `--web-bot-auth-enabled true` without a file to retain the stored credentials, or `false` to disable it. retention fails before saving if the current header metadata is missing. enabling or replacing credentials requires all three header values together and `true`.

live checks on raft verified both the source and a fresh npm install of v0.26.0. cli and mcp checks covered enabling, retaining, replacing and disabling web bot auth. a five-page test crawl reached a protected endpoint that verified the signature; missing or invalid signatures returned http 401.

`audit-configure` replaces settings; include everything else you want to retain. google analytics connections still block settings replacement. editing settings does not start a crawl. see the [site audit guide](https://semrush.micr.dev/docs/site-audit) for the full settings.

inspect pages and issues after the crawl, then download a report:

```bash
semrush audit-pages --campaign-id 456 --page 0 --limit 20
semrush audit-page --campaign-id 456 --page-id '<page_id>'
semrush audit-issue --campaign-id 456 --snapshot-id '<snapshot_id>' --issue-id 2
semrush audit-history --campaign-id 456
semrush audit-export-pages --snapshot-id '<snapshot_id>' --output pages.csv
semrush audit-export-issues --snapshot-id '<snapshot_id>' --format xlsx --output issues.xlsx
semrush audit-export-page-issues --campaign-id 456 --output page-issues.csv
semrush audit-export-markup --snapshot-id '<snapshot_id>' --format xlsx --output markup.xlsx
```

copy page and snapshot ids from the results. exports require `--output` and refuse an existing file. they download semrush's native csv or xlsx files.

`audit-export-page-issues` uses the campaign id and exports the latest crawl's page-by-issue matrix. `audit-export-markup` uses a snapshot id and exports that crawl's markup and structured data. both accept `--format csv` or `--format xlsx`, with csv as the default. downloads do not retry failed network requests automatically.

live mcp checks for both exports matched native csv and xlsx bytes exactly. the cli markup xlsx matched all worksheet and content bytes; only semrush's creation timestamp in `docProps/core.xml` differed.

compare two crawls using distinct snapshot ids from `audit-snapshots`:

```bash
semrush audit-export-compare --first-snapshot-id '<previous_snapshot_id>' \
  --second-snapshot-id '<latest_snapshot_id>' --output comparison.csv
```

both ids are required, and the cli preserves their order. semrush puts the second crawl's columns before the first crawl's columns. the download keeps semrush's calculated changes intact. csv is the default, or use `--format xlsx`. live cli and mcp checks verified both formats on existing 23-page historical crawls. csv bytes matched fresh native downloads exactly. xlsx workbook contents matched except for semrush's creation timestamp in `docProps/core.xml`.

collect the latest crawl's available reports in one zip:

```bash
semrush audit-export-all --campaign-id 456 --output reports.zip
semrush audit-export-all --campaign-id 456 --format xlsx --output reports-xlsx.zip
```

semrush's web ui downloads each report separately. the cli collects those native files unchanged into a zip, with `manifest.json` recording the snapshot id, included files and any omitted reports. every archive includes crawled pages, the page-by-issue matrix, markup and issues. it adds a comparison with the previous completed crawl when one exists, and javascript impact when that crawl has data for it.

csv is the default. `--relative`, `--sort` and `--filter` apply to the three page exports. `--output` is required and refuses an existing file. if the latest crawl changes during download, the command fails without saving an archive. failed or cancelled downloads leave no partial mcp artifact resources. mcp exposes `audit_export_all` and returns one zip artifact with the manifest in `data`.

live source cli and mcp checks on raft verified five-file archives after a first crawl, with comparison omitted, and six-file csv and xlsx archives after a second crawl. all 34 file comparisons matched independent native downloads. csv bytes matched exactly; xlsx contents matched except for semrush's creation timestamp. zip integrity, manifests and mcp resource reads also passed.

`audit-recrawl` queues a page again. `audit-abort` cancels a running crawl; `audit-finalize` stops collecting pages and processes what it has. these writes need `--confirm`. see [site audit](https://semrush.micr.dev/docs/site-audit) for crawl settings, stop conditions and limits.

### javascript rendering impact

read the javascript impact summary, changed-page count and before/after page values for a campaign:

```bash
semrush audit-js-impact-guide --campaign-id 456
semrush audit-js-impact-changed-pages --campaign-id 456
semrush audit-js-impact-pages --campaign-id 456 --page 0 --limit 10
semrush audit-js-impact-pages --campaign-id 456 \
  --status changed --parameters '["title","canonical"]' --query example.com
semrush audit-export-js-impact --campaign-id 456 --output js-impact.csv
semrush audit-export-js-impact --campaign-id 456 --format xlsx --output js-impact.xlsx
```

these commands read existing crawl results and do not start rendering or analysis. use the seo campaign id, not a snapshot id. page reads default to page `0`, limit `10`, status `all` and sort `desc`. choose `--status changed` or `--status unchanged`, use `--query` to search urls, or pass `--sort asc`.

`--parameters` accepts `clientSideRedirect`, `metaRobots`, `title`, `metaDescription`, `linksCount`, `wordsCount`, `canonical` and `googleStructuredData`. a non-empty selection requires `--status changed`. exports use the same filters, request page `0` with a limit of `100000`, and require `--output`. csv is the default; xlsx is also supported. mcp returns an artifact resource.

live cli and mcp checks on an owned three-page crawl with rendering enabled matched native summary, count and filtered/paginated page json. the results included one unchanged page and no changed-title rows. csv bytes matched native downloads for both clients. mcp xlsx bytes matched exactly; cli xlsx workbook contents matched except for semrush's creation timestamp in `docProps/core.xml`.

### core web vitals

read core web vitals processing status, overview and page metrics for an existing audit:

```bash
semrush audit-web-vitals-status --campaign-id 456
semrush audit-web-vitals-overview --campaign-id 456
semrush audit-web-vitals-pages --campaign-id 456
semrush audit-web-vitals-improvements --campaign-id 456
```

these reports use semrush's native lcp, tbt and cls values. long native numeric values can appear as strings so their digits stay intact. copy an exact `urlId` string from the pages result to read its history or lighthouse recommendations. keep a leading minus sign and do not convert it to a json number:

```bash
semrush audit-web-vitals-history --campaign-id 456 --url-id '<urlId>'
semrush audit-web-vitals-recommendations --campaign-id 456 --url-id '<urlId>'
```

read the current url selection before replacing it:

```bash
semrush audit-web-vitals-settings --campaign-id 456
semrush audit-web-vitals-settings-set --campaign-id 456 \
  --urls '["https://example.com/","https://example.com/about"]' --dry-run
```

use `--confirm` to save one to ten unique absolute http or https urls. this replaces the whole selection for the next audit and does not start a crawl. clearing the selection with an empty array is unsupported because the native endpoint rejects it. mcp exposes the same commands with underscores.

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

the current source passed 289 tests on raft, including a dropped-response mutation fixture that verifies exactly one write. live guru checks on an owned project verified scope replacement through mcp, including preserved empty selections, manual scheduling and disabled notifications.

## documentation

full docs live at [semrush.micr.dev](https://semrush.micr.dev). setup, authentication, projects, saved keywords, keyword strategy builder, position tracking, chart notes, site audits, backlink audit, exports, mcp and the complete command reference.

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
