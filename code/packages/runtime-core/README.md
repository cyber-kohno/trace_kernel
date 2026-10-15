# Trace Kernel runtime core

Shared TypeScript for Workspace types and validation, execution planning,
context and reserved API creation, Work completion, output scheduling,
transactions, paths, data conversion, runtime caches, filesystem/network/parser
APIs, Workspace compression and migration state, license verification and
TypeScript transpilation, semantic analysis, Logic signatures and declarations.
Hosts supply I/O, compilation,
parser creation, output and state notifications through ports.

The package exports TypeScript source for bundlers. It has its own pinned npm
lockfile; it does not import Desktop, Svelte, stores or Tauri. Desktop preserves
its existing imports through small re-export bridges and aliases its Workspace
types to the shared definitions. Desktop still owns state factories, GUI state,
the Worker/native adapters, file dialogs, license storage and UI migration flow.
Network, DOM and Excel factories receive a `NativeCall` port; runtime helpers
and table/JSON inspectors use the same shared implementation in both hosts.
Filesystem APIs and VFS openText receive an explicit native/filesystem port;
transaction plan normalization is shared with the Desktop review UI.
Desktop analysis and transpilation use the same pinned TypeScript instance.
Channel registration receives NativeCall and a notification callback; state
notifications also come from the host. Work semantic validation takes its
standard-library files explicitly and has no fetch or disk dependency.

From the repository root, install both sets of dependencies on a new checkout:

```powershell
npm ci --prefix code/packages/runtime-core
npm ci --prefix code/apps/desktop
npm --prefix code/packages/runtime-core run check
npm --prefix code/packages/runtime-core run build:assets
npm --prefix code/apps/desktop run check
npm --prefix code/apps/desktop run test:shared-runtime-dev
npm --prefix code/apps/desktop run build
```

`check` validates all source types and rejects imports that escape this package
or use undeclared/host dependencies. Desktop's behavioral regression suites and
the Rust engine comparisons exercise the same implementation through the
bridges and shared source. The dev-server test uses an ephemeral local port and
closes its server; it verifies shared-module and encoding-dependency delivery.

Workspace generation decisions, validation rules, execution permissions,
transaction ordering and payload formats retain their existing behavior.
The `.trk` gzip/Base64 format and license signature rules are retained.
A truncated gzip stream that yields no text is rejected explicitly.
Migration preserves the existing generation-header update; schema conversion
algorithms for future generations are not introduced by this move.
Generation metadata and declaration/analysis rules now live in this package.
`build/standard-libs.mjs` collects the es2020/webworker library closure from the
pinned compiler and is also used by Desktop Vite. `build:assets` generates
runtime.js, compiler.js, typescript-libs.json and a version/size/SHA-256 manifest
under ignored generated/runtime-assets. Build inputs cannot escape this package.
These are library assets; product CLI entry points and embedded asset delivery
are subsequent steps. Node/esbuild are build tools and are not launched by V8.
