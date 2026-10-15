# Galleton provenance

The runtime uses the published `galleton@0.1.0` TypeScript SDK from npm.
Its source release is `sdk-v0.1.0` in https://github.com/Microck/galleton.
The historical SDK source in this directory is no longer imported. The license
remains included for the bundled daemon and attribution.

The daemon is still built from commit
`efe7b742536d6c118c37a269bf626c5927e2a1b9` with the static-provider extension in
`patches/galleton-static-provider.patch`. Published Semrush packages include its
Linux arm64/x64, macOS arm64/x64 and Windows x64 binaries, so users do not need Go.
