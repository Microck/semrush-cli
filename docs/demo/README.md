# terminal demos

these are terminal replays of captured cli output, with purple text on black.
the layout follows the plain terminal gifs in
[kagi-cli](https://github.com/Microck/kagi-cli) and
[wallapop-cli](https://github.com/Microck/wallapop-cli).

the captures were made on 2026-10-15 using the v0.5.0 source build.
`scenes.json` contains the displayed commands and their actual stdout.

- `keywords` reads the public keyword `email marketing` in the us database,
  then uses `jq` to select four returned fields. it uses a signed-in session
  but contains no account data.
- `projects` runs `project-create --dry-run`, then selects the preview's method
  and path with `jq`. it does not authenticate, connect to semrush or create a
  project.

the renderer animates typing and reveals the captured output. the playback
timing is scripted, so it does not represent live request latency. it never
executes the displayed commands or modifies the captures. refreshing keyword
metrics requires a separate authenticated read and can consume account limits.

## regenerate

requires python 3, pillow and fontconfig. set `DEMO_FONT` to a local monospace
ttf file if fontconfig is unavailable.

```bash
node scripts/render-demo.mjs
```

outputs `assets/demo-keywords.gif`, `assets/demo-projects.gif` and matching png
posters. the font is noto sans mono when available. text uses `#c4a7ff`, with
`#a970ff` for the command, on `#000000`.
