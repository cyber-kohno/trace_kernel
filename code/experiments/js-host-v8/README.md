# Rust V8 host verification

V8 was selected for the product CLI on 2026-10-13. This executable remains an
isolated verification host. It uses pinned deno_core 0.412.0, deno_web 0.290.0,
deno_webidl 0.259.0 and embedded ICU data. Node and WebView are not launched
by the Rust executable. Node is used by the comparison runner to bundle the
shared TypeScript fixture and supply a reference result.

## Build and compare

From the repository root:

```powershell
cargo build --release --locked --manifest-path code/experiments/js-host-v8/Cargo.toml
cargo build --release --locked --manifest-path code/experiments/js-host-quickjs/Cargo.toml
node code/experiments/js-host-common/compare-engines.mjs
node code/experiments/js-host-v8/verify-host.mjs
node code/experiments/js-host-v8/verify-native-io.mjs
node code/experiments/js-host-v8/verify-native-services.mjs
node code/experiments/js-host-v8/verify-workspace.mjs
npm --prefix code/packages/runtime-core run build:assets
node code/experiments/js-host-v8/verify-shared-assets.mjs
node code/experiments/js-host-v8/verify-channels.mjs
cargo clippy --locked --manifest-path code/experiments/js-host-v8/Cargo.toml --all-targets -- -D warnings
```

The first build downloads Cargo dependencies and the official prebuilt V8 static
library. If local Cargo config sets offline mode, add `--config net.offline=false`.
After caching all assets, builds can use `--offline`. `compare.mjs --release` in
this directory runs only the V8 candidate.

The host accepts one JSON request on stdin and writes a JSON report on stdout.
The report format matches the QuickJS candidate. `generated/results.json` and
`../js-host-common/generated/comparison.json` are regenerated and ignored by Git.

Install `code/packages/runtime-core` dependencies too (see its README). The engine
fixture now imports the shared execution, transaction, data, runtime, network
parser, filesystem/VFS and transaction plan implementations
from that package. The existing JSON protocol is a test harness, not the future
product CLI's command-line argument specification.

## Same input, common code

Both candidates use the QuickJS experiment's fixture.ts, cases.mjs, compiler
fixture and comparison runner. Only QuickJS uses profile.js; V8 installs the
official Deno Web implementations. The same desktop execution plan,
context builder, reserved API factory, Work runner and output scheduler are
bundled. Both Rust hosts include `../js-host-common/native-model.rs`; filesystem
mutations, scans, process output and stream registration use the same simulated
I/O model. Native APIs are not reimplemented for the V8 comparison.
Both the Work and compiler bundles reject dependencies on Desktop source and
import the shared package directly. The runner still uses Desktop's installed
esbuild as a development tool.

## Stop and memory behavior

Async native ops are connected through deno_core. A separate watchdog thread
terminates the V8 isolate for CPU loops and microtask loops; Tokio also bounds
Promise and native-op waiting by the same deadline. External cancellation is
measured after the user Work has started. The final event-loop drain is bounded.

V8's near-heap-limit callback terminates execution under retained allocation
pressure. The callback temporarily increases the heap limit by 128MiB so V8 can
observe termination instead of aborting the process. This is a reserve, not a
strict process memory bound. The report records the configured limit, V8 heap
statistics, external backing-store bytes and whether a memory stop occurred.

In addition, a watchdog requests heap checks on the isolate thread every 5ms;
native calls, timer callbacks, Work completion and final report conversion have
explicit checks. Used heap plus external memory exceeding the configured budget
terminates the isolate. A catch in user JavaScript cannot resume a transaction.
Single arrays, ArrayBuffers, CPU and microtask loops are regression cases.
Allocation can transiently exceed the budget before a check. This does not cap
RSS, all Rust allocations, or peak memory during a single V8 builtin.

URL, URLSearchParams, TextEncoder, TextDecoder, DOMException, structuredClone
(including ArrayBuffer transfer), atob, btoa, setTimeout and setInterval are installed.
The native Base64 decoder's InvalidCharacterError class is registered with a
DOMException builder, so malformed input throws the expected exception.
Work completion cancels outstanding user timers before output draining and
transaction commit; awaited timers continue during Work execution. Timer callback
errors fail the host. `verify-host.mjs` checks selected API edge cases and disposal.
For bootstrap development before rebuilding, `verify-host.mjs --bootstrap-source`
overrides the embedded bootstrap with the source file. The verification gate uses
the default command to exercise only the compiled bootstrap.

## Boundaries

The default mode still uses in-memory native I/O. With `nativeFiles: true`, the
fifteen filesystem commands, directory scan, process, HTTP, DOM, Excel and channel calls use
native-core against actual files and services. The flag name is retained for
test protocol compatibility. ExecutionIo admission occurs before the async wait; cancellation and
memory stopping close admission immediately. A Work with outstanding owned
native requests or recorded cleanup failures fails before transaction commit,
after output draining. Catching a native panic in JavaScript cannot allow commit.
The host drops V8 futures and waits for all blocking/async Operation guards before
returning its report, then clears its execution-owned DOM store. `nativeIo`
reports cleanup status, duration and remaining document count.
The report captures retained native channel lines, then clears the store and
reports channelsAfterCleanup. The fixture option nativeChannels sends production
append_lines batches to that store; default parity mode still uses simulated output.
Table channels retain JSON records and metadata as Desktop does; no CLI output
file format or path is specified here.

`verify-native-io.mjs` creates a unique fixture under generated/native-io, checks
seven transaction operations, direct APIs, Shift-JIS, dataset reads, errors,
conflicts, saturation, unfinished native work and cancel/deadline/memory stop.
It verifies the cleanup target stays inside that fixture base before removal.
`scanProgressDelayMs`, `nativeCallDelayMs` and `scanProgressPanic` are test-only injection;
the default values leave production scan callbacks without an artificial delay.

`verify-native-services.mjs` exercises actual process stdin/stdout/stderr,
Shift-JIS, child termination/reaping, output overflow, local HTTP response and
body cancellation, domain queue timeouts, XML/HTML DOM disposal and real XLSX
parsing through the shared TypeScript APIs. Node is a process fixture and local
HTTP server in these tests. Network tests need an environment that permits
loopback connections; restricted Windows sandbox runs may reject them.

`verify-workspace.mjs` bundles shared compression, Workspace preparation,
migration and license verification without Desktop source. It checks gzip
interoperability, Unicode, generations, truncated input, existing repository
trk fixtures, valid signatures against Node crypto and tampered-license rejection.
It supplies compressed text in the test request; there is no product file entry point yet.

`verify-shared-assets.mjs` reads the common asset manifest and checks generated
declarations, semantic diagnostics, standard libraries, permission visibility,
compilation, context injection and Work execution in Node and V8. It uses the
generated assets rather than a separately built Desktop fixture.
`verify-channels.mjs` checks native text/table output, joining/ranges, duplicate
registration, byte/line/channel/ID limits and output retention on stop. Fixture
directories are removed only after validating their resolved paths.

No integrated Workspace-to-Work file entry point, no product-embedded assets,
no GUI authoring MCP session inside V8, and no actual browser
Worker reference. Selected Web APIs are tested, not full browser compatibility.
The V8 binary includes ICU data but not the shared JS/compiler assets or
all of the product's native functionality. No clean-machine distribution test is included.

See `ai_context/develop/task/2_runtime_foundation/28_V8ホスト比較とエンジン選定.md`
for the historical comparison; subsequent adoption and verification are in 29.
Shared TypeScript migration, actual native ownership, services and Workspace
verification are recorded in 31/32/33/34/35.
