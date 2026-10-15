# Desktop / MCP release identity

`desktop-mcp.json` is the authoritative release definition for Desktop and the
independent MCP server. It does not version the CLI, Work APIs or saved Workspaces.

Current internal baseline: release `0.2.0`, bridge generation `1`.
API and Workspace generations come from the existing literal exports in
`packages/runtime-core/src/metadata/gen-version.js` (currently `1` and `0`).
The Node and Rust build helpers read those exports directly, reject unsupported
expressions/duplicate constants, and do not maintain a second generation value.
Rust/MCP builds do not launch Node or require generated runtime JS assets.

## Updating and checking

For a new Desktop/MCP release:

1. Update `desktop-mcp.json`. Published product versions must not be overwritten
   with different contents. Advance `bridgeProtocolGen` whenever the MCP-facing
   integration contract changes, including additive Work APIs. UI-only fixes do
   not advance it. There is no separate release ID.
2. Synchronize the required manifest mirrors: Desktop Cargo.toml, package.json,
   package-lock.json (both root versions), tauri.conf.json, and MCP Cargo.toml.
   These are tool manifests, not independent runtime version authorities.
3. Update the two application Cargo.lock files through Cargo and review the diff.
   Dependency upgrades are not part of a version-only change.
4. Run the checks below. They reject stale mirrors instead of silently accepting
   a partially updated release. Update release-specific fixture expectations when
   intentionally advancing the baseline.

From the repository root:

Run the complete offline/locked automated suite (26 steps, including both Rust
apps, shared TS, Frontend build and isolated real-process acceptance):

```powershell
node code/release/check-desktop-mcp-suite.mjs
```

It requires existing dependencies/toolchains; it does not install anything,
launch a GUI, access a live Workspace, edit AI-client settings, build the CLI,
or package/distribute either app. See task document 50 for the manual GUI and
internal-rollout gates. Selected individual checks:

```powershell
node code/release/check-desktop-mcp.mjs
node code/release/test-desktop-mcp.mjs
cargo test --offline --locked --manifest-path code/crates/mcp-protocol/Cargo.toml
cargo test --offline --locked --manifest-path code/crates/native-core/Cargo.toml
cargo test --offline --locked --manifest-path code/apps/mcp/Cargo.toml
cargo test --offline --locked --manifest-path code/apps/desktop/src-tauri/Cargo.toml --lib
cargo build --offline --locked --manifest-path code/apps/mcp/Cargo.toml
node code/apps/mcp/scripts/test-stdio.mjs
node code/apps/desktop/scripts/test-mcp-diagnostics.mjs
cargo build --offline --locked --manifest-path code/apps/mcp/Cargo.toml --bin trace-kernel-mcp --example compatibility_host
node code/apps/mcp/scripts/test-acceptance.mjs
```

Desktop's `npm run check` runs release checks through `precheck`. Vite dev/build
also checks identity; editing identity inputs restarts the dev server. Rust build
scripts validate their package identity and track the authoritative inputs.

Vite emits `product-identity.json` with the Frontend build. Desktop release builds
require its identity to match Rust's, so build the Frontend before invoking a
Rust release build. Missing or stale identity requires rebuilding the Frontend.
This is an identity check, not a hash verification of every Frontend asset.

MCP supports `--version` / `-V`, `--version-json`, and default stdio mode with no
arguments. Its `ping` reports its own identity, not Desktop compatibility.
Desktop exposes the same information through `get_product_info`.

## Compatibility contract and runtime enforcement

The `mcp-protocol` crate provides strict identity DTOs and a pure compatibility
decision. It has no application, filesystem, V8 or Tauri dependency.
`BridgeContract` contains only `bridgeProtocolGen`: an exact match with the local
build's generation is required. Missing, malformed, zero or different generations
are rejected. There is no older/newer inference or range negotiation. The JSON
release definition owns the generation; the library does not duplicate its value.

Product version, API generation and Workspace generation are diagnostic/build
information, not connection gates. Manifest version checks and Rust/Frontend
identity checks above detect inconsistent parts of a single build; they do not
require the installed Desktop and MCP to have the same product version.

The MCP integration contract includes bridge request/response schemas, tools/resources, methods,
errors, approval semantics, exposed Work APIs (including additions), and embedded
API guidance. Increment the generation for any change to that contract, even
when API generation remains unchanged. Keep it for UI-only changes or fixes that
restore the existing contract; a fix changing MCP-visible behavior needs review
and a generation increment if it changes the contract. Wording-only guidance
corrections need no increment when the described API contract is unchanged.
Different Free/Pro licenses or runtime capabilities remain per-session checks,
not additional version comparisons.

Review every release for contract changes and run the bridge/API/guidance tests.
A generation number alone cannot detect a missed increment or prove implementation
correctness; build validation does not claim to do so. Session authentication,
request validation and update approval remain separate safeguards.

Desktop now enforces the contract after authentication and before registering a
pending request or publishing a WebView event. MCP probes authenticated health
for each operation and does not send a bridge request to a noncompatible session.
Descriptor contract data is a hint checked against health, not its authority.
Every bridge request includes `sessionId` to prevent port reuse targeting a
different Desktop session. Legacy requests are rejected; no fallback is provided.

Internal descriptors include a bearer token; public session results do not.
Session listing/probing report `compatible`, `incompatible`, `legacy`, `invalid`
or `unavailable`, with `compatible` boolean, contracts and sanitized diagnostics.
Product/API/Workspace version differences do not change connectivity. Duplicate
session IDs or descriptor/health session/contract disagreements are not safe
targets. Diagnostic identity extensions or missing diagnostic data are not gates.

MCP only connects to numeric loopback addresses. Connect timeout is 500 ms and
health has a 2-second absolute deadline. Bridge response deadlines are 35 seconds
normally or 605 seconds for user approval (Desktop waits 600 seconds). Writes are
also bounded. HTTP headers, response bodies and descriptor reads are limited to
16 KiB, 32 MiB and 16 KiB respectively. Desktop's existing 4 MiB request cap,
32 request threads, read deadline, cancellation and stop/join behavior remain.

`get_work_context` adds `mcpConnection` containing the verified contract and
diagnostic identities. Embedded resources and `get_api_reference` identify their
MCP target generation and do not claim an unverified Desktop is compatible.

Loopback tests compile the real native bridge source into the MCP test target;
uuid is a test-only dependency, not a heavy native-core production dependency.
The stdio smoke test initializes a built executable, reads tools/resources and
checks identity/guidance without discovering or accessing a Desktop Workspace.

The acceptance test uses a dedicated temporary app-data root, real MCP process,
real native bridge fixture process, and actual Desktop request handler, API
declarations and semantic validator. Store/empty-context/license/UI ports are
in-memory test fixtures. Four Free/Pro x plain/channel combinations, fixture-only
create/update decisions, mixed compatible/foreign/legacy sessions, direct guarded
requests and secret-free diagnostics are verified. Work source is never executed.
The host is an example target, not a product mode. This does not replace native
Tauri WebView, real license signature or actual mouse approval acceptance.

`apps/mcp/scripts/check-live-session.mjs` is separate and requires an explicit full
session ID and expected license. It uses only probe/overview/context/validate tools;
optional `--check-rejections` sends two deliberately invalid-generation read-only
getWorkContext requests to test Desktop diagnostics. It never creates/updates or
executes a Work, reads env values/Work source, changes a license/client setting, or
prints bearer credentials. It is not run against live sessions by the suite.

Desktop's small MCP popover shows only the MCP generation, concise publication or
historical request status, the session ID, publication controls and a diagnostic
link. A rejection count appears only when nonzero. Product/API/Workspace versions
are not shown. A separate native HTML modal has Overview / Rejections / Help
views; history is paginated one group at a time instead of extending the popover.
The presentation polls a local IPC snapshot once per second after
each completed read, without per-rejection events/toasts. Repeated code/generation
pairs are grouped, only the newest 8 groups are retained, and a stopped/new session
clears the history. Authentication failures and health probes do not imply a verified
MCP request. Diagnostics never retain a token, raw request/source, or invalid input.
Peer product version is not sent in the bridge contract, so the UI uses observed
MCP generation rather than guessing a version. MCP-side preflight refusals are
still shown only to the MCP client, not fabricated as Desktop-observed failures.
Stale IPC replies across start/stop/unmount are suppressed, and no fake client count
or persistent Connected state is shown. External processes/settings are untouched.

`node scripts/preview-mcp-diagnostics.mjs` from `apps/desktop` starts a loopback-only
UI fixture using the real Svelte components, without accessing a Desktop session,
Workspace, license or client setting. It is not a product route or build target.
Small viewport rendering, paging, history reorder, session reset and modal dismissal
were checked there. The small popover has no internal scrolling; the separate modal
retains a defensive content overflow for unusually small/zoomed viewports.

The user's Free Desktop passed live plain/channel read-only checks, rejection
display/grouping, stop/republication reset and reconnection with a new session ID.
Native Tauri acceptance of the new compact layout, real mouse proposal decisions,
Pro license integration and internal rollout remain pending.
This is not a finished public-release acceptance run.
Homepage, packaging and the verified CLI binaries are unchanged. Native-core's
new lightweight dependency is reflected in CLI Cargo.lock; the CLI was not rebuilt.
