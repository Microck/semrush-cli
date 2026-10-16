# Architecture

The CLI and stdio MCP share a catalog of 209 operations (142 reads and 67 writes) and one Semrush Effect service. Input validation populates defaults before credential-bearing resources are acquired. The browser layer owns a transient Chromium context, reads page bootstrap metadata without evaluating page-owned JavaScript, serializes report requests, and closes its browser with the Effect scope. JSON parsing outside Chromium preserves large identifiers as decimal strings.

Galleton owns durable encrypted cookies. Its TypeScript SDK is the published, pinned `galleton@0.1.0` npm dependency. The npm package bundles platform builds of the pinned Galleton daemon plus the storage-only provider extension in `patches/galleton-static-provider.patch`.

## Storage-only Galleton provider

Upstream Galleton `efe7b742536d6c118c37a269bf626c5927e2a1b9` requires a renewal adapter and schedules renewal immediately after import. Semrush's observed browser login has no proven HTTP renewal contract. A `/home/` request does not return replacement cookies and correctly fails Galleton's renewal-evidence check. Treating that request as renewal would misrepresent session validity.

The bundled daemon therefore adds one canonical `static` provider kind. It permits encrypted credential import, scoped header retrieval, cookie capture and explicit forgetting, with no automatic renewal. Static providers reject renewal configuration. Explicit refresh fails with `reauth_required`. The scheduler skips unscheduled sessions. Existing Galleton HTTP/OAuth semantics remain intact. Semrush validates account access before every report; expired sessions require a new login or import.

The patch includes a real Go integration test for import, origin restrictions, persistence, cookie rotation, explicit refresh refusal, and absence of network requests. The build runs the upstream core suite including this test before compiling platform binaries. No upstream repository is modified or published by this project.

This is a current feature extension, not a compatibility shim or an alternate credential path. Remove the patch when an upstream Galleton revision supplies equivalent storage-only semantics and its tests pass here; update the SDK and daemon pin together. Do not revert to a fabricated renewal adapter.

## Trust boundaries

Only fixed Semrush endpoints and catalog RPC methods are exposed. Mutations require explicit confirmation or a credential-free dry run before the browser is acquired. Users cannot supply a URL, auth field, JavaScript snippet or arbitrary RPC method. The local Galleton API is authenticated and loopback-only. CDP imports accept literal loopback HTTP origins. Durable state lives outside the repository. The CLI never exports browser cookies. MCP exposes only catalog research and account tools, not login or daemon management.

Provider report data can contain nested objects and provider errors. Secret fields and known secret strings are redacted before output. Raw browser and SDK failures stop at their adapters. Account limits and permission errors remain failures, never empty datasets.
