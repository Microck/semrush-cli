# Galleton SDK provenance

`galleton.ts` is an unchanged copy of `sdk/typescript/index.ts` from
https://github.com/Microck/galleton/tree/efe7b742536d6c118c37a269bf626c5927e2a1b9.
The SDK is not published to npm. It is bundled into the executable with its MIT
license. `scripts/build-daemon.mjs` builds the daemon with the static-provider extension documented in `docs/architecture.md` from the same
pinned commit for Linux arm64/x64, macOS arm64/x64, and Windows x64. No Go
installation is required to use the published npm package.

To update, inspect the upstream changes, replace the SDK and license from one
commit, update the build script revision and this note, and rerun integration tests.
