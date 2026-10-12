# Rust JS Host Spike

This is an isolated experiment, not a product CLI. It has its own Cargo
workspace and lockfile. It does not change Desktop dependencies or run real
filesystem mutations.

The Rust executable accepts one JSON request on stdin and prints one JSON
report on stdout. Work output is captured in the report's stdout field.
The host filesystem is an in-memory model. Native callbacks cross a JSON
boundary, return Promises, and deliberately delay completion.

## Run

Frontend dependencies in apps/desktop must already be installed. Node is used
to bundle the existing TypeScript code and provide the V8 comparison baseline.
The Rust host does not start Node.

From the repository root:

```powershell
cargo build --release --locked --manifest-path experiments/js-host-quickjs/Cargo.toml
node experiments/js-host-quickjs/compare.mjs --release
cargo clippy --locked --manifest-path experiments/js-host-quickjs/Cargo.toml --all-targets -- -D warnings
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

Only WorkerInvoke is replaced at build time. The GUI injection layer, license
selection, context preparation, and browser Worker scheduler are not reused.
Printing and the output completion barrier are probe-only host adapters.

## Coverage

There are 21 scenario checks: 11 Node/V8-versus-QuickJS comparisons, 5 stop checks,
3 failure/resource checks, and 2 in-host TypeScript compilation checks.
Comparisons include output, host calls, normalized transaction results, and final
in-memory entries. Stop tests assert that user execution started before stopping.

The runner also probes missing globals, checks the bundle for GUI dependencies,
and records executable/bundle sizes and minimal-process timings.
The Node VM baseline is not an actual browser Worker test.

## Boundaries

This does not load .trk files, resolve Work/Logic/Declare, enforce product license
rules, implement all native commands, or perform semantic TypeScript validation.
It does not establish atomic writes, rollback, process cancellation, stream
backpressure, memory bounds outside the JS engine, or security sandbox guarantees.

profile.js only provides the TextEncoder/TextDecoder and timers used in these
fixtures. It is not a standards-complete Web API implementation.
The TypeScript compiler bundle is sent in the request, not embedded in the Rust
executable. The measured executable size is not a complete CLI distribution size.

See ai_context/develop/task/2_runtime_foundation/04_JSホストの小規模検証.md
for the results, risks, and next steps.
