# Releasing

Use Node.js 22+ and the repository's npm lockfile. Builds require Go 1.23+,
`tar` and `patch`. Never put Semrush credentials in CI or a release archive.

1. Update the version in `package.json` and run `npm install --package-lock-only`.
   The executable and MCP server derive their version from this manifest.
2. Update any version-pinned `npx` examples in the README and MCP documentation.
3. Run `npm run check`. It builds the executable and five daemon targets, runs the
   Galleton core suite, and tests the real browser/session integration locally.
4. Run `npm pack --ignore-scripts` and inspect its file list. Install the tarball
   into a temporary prefix and run its version, help and doctor commands.
5. Commit and push the source. Require the CI source check, docs build and three
   native packed-package setup jobs to pass.
6. Publish with an authorized local npm identity using `npm publish --access public`.
   Verify the exact version on the public registry, install that version in a
   clean prefix, and compare the downloaded archive's checksum.
7. Create the matching `v<version>` tag and a visible GitHub release with the npm
   tarball and checksum. Describe user-facing behavior and relevant limits.
8. Deploy `docs-site` to its own `semrush-cli` Vercel project. Check the custom
   domain, navigation, search, `/llms.txt`, and mobile layout.

The manual GitHub publish workflow uses npm OIDC. Before using it, configure a
trusted publisher on npm for `Microck/semrush-cli`, workflow `publish.yml`,
environment `npm`. This is a one-time npm account setting. No npm publish token
is stored in the repository or GitHub Actions. Local authenticated publication
is the verified first-release path.

The `semrush-cli` executable deliberately coexists with the separately installed
`semrush-mcp` package, which owns the `semrush` command on this host.
