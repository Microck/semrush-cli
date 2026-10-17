# Architecture

The CLI and stdio MCP share a catalog of 292 operations, 202 reads and 90 writes,
and one Semrush Effect service. Input validation populates defaults before
credential-bearing resources are acquired. The browser layer owns a transient
Chromium context, reads page bootstrap metadata without evaluating page-owned
JavaScript, serializes report requests and closes its browser with the Effect
scope. JSON parsing outside Chromium preserves large identifiers as decimal strings.

JSON requests use the context's shared-cookie HTTP client with `maxRetries:0`.
Binary exports use a scoped HTTP client seeded from those cookies. It returns
cookie updates to the browser and disposes its responses and client afterward.
Disposal aborts an interrupted download while leaving the report client usable.
Both paths disable network retries because Chromium fetch can silently replay
a committed POST after a connection reset. Artifact files retain the provider's
bytes and remain private to the runtime.

Keyword exports start one native job, validate its private receipt and call
`export.Wait` before downloading from the fixed Keyword Overview route. Only
the native numeric pending code 0 permits two further wait checks; creation
and transport failures never retry. The scoped export stage has a 90-second
deadline and redacts job identifiers from errors. Country metrics and the
selected-country overview share one native table without synthesizing totals.

Mind-map images use a separate scoped renderer page at the fixed Keyword
Strategy Builder route. Semrush's own client renders and downloads the image;
the adapter waits for fonts and native controls, then stores the unchanged
download bytes. It accepts only catalog basket/owner IDs and PNG or JPG, never
caller JavaScript or a URL. Cancellation closes that page and cancels/deletes
its browser download without closing the shared report context.

The All reports operation stages native downloads in a private scoped directory,
then streams them into one ZIP with a JSON manifest. Staged files never become
MCP resources. Only the completed archive is registered. Cancellation aborts
active writers before the scope removes staging and partial output. Snapshot
metadata is checked before and after downloads to reject a changed crawl.

Galleton owns durable encrypted cookies. Its TypeScript SDK is the published, pinned `galleton@0.1.0` npm dependency. The npm package bundles platform builds of the pinned Galleton daemon plus the storage-only provider extension in `patches/galleton-static-provider.patch`.

## Storage-only Galleton provider

Upstream Galleton `efe7b742536d6c118c37a269bf626c5927e2a1b9` requires a renewal adapter and schedules renewal immediately after import. Semrush's observed browser login has no proven HTTP renewal contract. A `/home/` request does not return replacement cookies and correctly fails Galleton's renewal-evidence check. Treating that request as renewal would misrepresent session validity.

The bundled daemon therefore adds one canonical `static` provider kind. It permits encrypted credential import, scoped header retrieval, cookie capture and explicit forgetting, with no automatic renewal. Static providers reject renewal configuration. Explicit refresh fails with `reauth_required`. The scheduler skips unscheduled sessions. Existing Galleton HTTP/OAuth semantics remain intact. Semrush validates account access before every report; expired sessions require a new login or import.

The patch includes a real Go integration test for import, origin restrictions, persistence, cookie rotation, explicit refresh refusal, and absence of network requests. The build runs the upstream core suite including this test before compiling platform binaries. No upstream repository is modified or published by this project.

This is a current feature extension, not a compatibility shim or an alternate credential path. Remove the patch when an upstream Galleton revision supplies equivalent storage-only semantics and its tests pass here; update the SDK and daemon pin together. Do not revert to a fabricated renewal adapter.

## Trust boundaries

Only fixed Semrush endpoints and catalog RPC methods are exposed. Mutations require explicit confirmation or a credential-free dry run before the browser is acquired. Users cannot supply a URL, auth field, JavaScript snippet or arbitrary RPC method. The local Galleton API is authenticated and loopback-only. CDP imports accept literal loopback HTTP origins. Durable state lives outside the repository. The CLI never exports browser cookies. MCP exposes only catalog research and account tools, not login or daemon management.

Provider report data can contain nested objects and provider errors. Secret fields and known secret strings are redacted before output. Raw browser and SDK failures stop at their adapters. Account limits and permission errors remain failures, never empty datasets.

My Reports discovery uses one fixed cookie-authenticated GraphQL query. Its
adapter rejects GraphQL errors even when partial data accompanies them, then
returns the native account object. The query includes one bounded 30-report
page and task metadata. Offset and combined filters stay in JSON variables;
it does not fetch task files or accept caller GraphQL.

Site Audit settings replace the native configuration. Existing HTTP Basic and
Web Bot Auth credentials therefore require an explicit keep or disable choice.
Retaining Web Bot Auth reads current Signature-Agent and Signature-Input once;
an empty native Signature retains the provider's masked stored signature.
Missing authentication metadata fails before the save. Full replacements take
all three headers through one write-only object, whose values are redacted in
previews, responses and provider errors. Google Analytics connections remain
guarded until their connection-preserving contract is verified.

Core Web Vitals uses the shared Site Audit request client. Exact signed URL IDs
remain strings throughout validation, path planning and JSON output. A settings
replacement validates its native URL receipt once; partial or missing receipts
fail with a readback instruction because the write may already have committed.
It never retries, restores an earlier list or starts a crawl.
