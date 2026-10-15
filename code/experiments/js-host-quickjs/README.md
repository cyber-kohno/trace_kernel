# Rust JS Host Spike

This is an isolated experiment, not a product CLI. It has its own Cargo
workspace and lockfile. It does not change Desktop dependencies or run real
filesystem mutations.

The Rust executable accepts one JSON request on stdin and prints one JSON
report on stdout. Work output is captured in the report's stdout field.
The host filesystem is an in-memory model. Native callbacks cross a JSON
boundary, return Promises, and deliberately delay completion.

## Run

Frontend dependencies in code/apps/desktop must already be installed. Node is used
to bundle the existing TypeScript code and provide the V8 comparison baseline.
The Rust host does not start Node.

From the repository root:

```powershell
cargo build --release --locked --manifest-path code/experiments/js-host-quickjs/Cargo.toml
node code/experiments/js-host-quickjs/compare.mjs --release
cargo clippy --locked --manifest-path code/experiments/js-host-quickjs/Cargo.toml --all-targets -- -D warnings
```

After the dependencies have been downloaded, Cargo commands can use --offline.
If local Cargo configuration forces offline mode, add --config net.offline=false
when downloading dependencies. The test runner starts esbuild and the probe
executable as child processes, which restricted execution environments may block.

Generated bundles and results are written to generated/ and are ignored by Git.
The test runner has a 15-second process watchdog in addition to engine interrupts
and host-side deadlines.

## What Is Reused

- Desktop's TypeScript transpilation options and TypeScript compiler.
- Actual filesystem API, transaction staging API, VFS, normalization,
  TransactionService, and verification.
- Actual runtime exit/sleep API and JSON/CSV parser implementations.

The shared execution plan, reserved API factory, dataset preparation, context
materialization, runPreparedWork entry, and Desktop's output flush scheduler
are reused. The Work and compiler bundles import runtime-core directly and
reject Desktop source dependencies. NativeCall is supplied by the host fixture.
Host adapters provide output storage, stream registration and fixture I/O.
Permission selection uses an explicit Professional flag; license signatures
are not verified by the parity fixture. The network factory uses shared DclNet;
the actual HTTP/DOM/Excel integration is tested separately in the V8 experiment.

## Coverage

There are 30 scenario checks: 19 Node/V8-versus-QuickJS comparisons, 5 stop checks,
4 failure/resource checks, and 2 in-host TypeScript compilation checks.
Comparisons include output, host calls, normalized transaction results, and final
in-memory entries. Work/Logic/resource/dataset/process contexts, channel/state,
permission selection and output registration failures are included. Stop tests
assert that user execution started before stopping.

The V8 candidate runs this same fixture and runner via `../js-host-v8/compare.mjs`.
Both Rust hosts use `../js-host-common/native-model.rs` for the simulated I/O.
Run `node code/experiments/js-host-common/compare-engines.mjs` to compare both release
binaries sequentially and write one summary. The V8 single-allocation heap-limit
difference is recorded explicitly; it is not treated as a passed safety check.

The runner also probes missing globals, checks the bundle for GUI dependencies,
and records executable/bundle sizes and minimal-process timings.
The Node VM baseline is not an actual browser Worker test.

## Boundaries

This does not load .trk files, resolve Declare, verify license signatures,
implement all native commands, or perform semantic TypeScript validation.
Logic source is precompiled with the shared compiler before parity testing;
the separate compiler tests still run the compiler inside the Rust host.
Dataset scans and process results are fixtures. worker_init/add_channel are
simulated acknowledgments, without production execution ownership.
It does not establish atomic writes, rollback, process cancellation, stream
backpressure, memory bounds outside the JS engine, or security sandbox guarantees.

profile.js only provides the TextEncoder/TextDecoder and timers used in these
fixtures. It is not a standards-complete Web API implementation.
The TypeScript compiler bundle is sent in the request, not embedded in the Rust
executable. The measured executable size is not a complete CLI distribution size.

See ai_context/develop/task/2_runtime_foundation/04_JSホストの小規模検証.md
for the original results; 26_予約APIと共通実行入口.md and
27_共通実行入口のRustホスト比較.md record the current changes and design decision.
28_V8ホスト比較とエンジン選定.md records the subsequent V8 comparison and memory differences.
