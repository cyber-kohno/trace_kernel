# Trace Kernel MCP API coverage plan

This is the engineering traceability ledger for making every Work API usable
from an agent. It is not a claim that runtime behavior is guaranteed. An API
family is complete only when its live declarations, usage guide, positive and
negative compile examples, and relevant behavioral boundaries are all
traceable and checked.

## Public surface inventory

| Surface | Runtime/type source | Agent guide | Coverage status |
| --- | --- | --- | --- |
| Work context: `$env`, `$resource`, `$dataset`, `$process`, `$logic` | `ContextDataUtil.createDeclareDef`; workspace model and `ProgramInjectionUtil` | `resources/context.md` | Dynamic signatures and availability are exposed by `get_work_context`; examples and limitations need per-entry validation. |
| Plain output: `$print`, `$println` | `DeclareUtil.createUtilDeclareDef`; `DeclareUtil.createUtilObject` | `resources/api-output.md` | Basic signatures/examples documented; no compile-positive/negative case ledger yet. |
| Channel output: `$channel` | `DclChannel.getTypeDeclare/getObject` | `resources/api-output.md` | Table typing and duplicate names documented; text method variants, duplicate IDs, and stream lifecycle need explicit checks. |
| Runtime/state: `$runtime`, `$state` | `DclRuntime`, `DclState` | `resources/api-runtime-state.md` | Core behavior and deterministic exit/progress/monitor behavior tested in desktop `check`; timer/signal edge cases remain. |
| Parser: `$parser` and Excel, DOM, CSV, TSV, JSON inspectors | `DclParser`, parser implementations and inspector types | `resources/api-parser.md`, `resources/context.md` | All public members are inventoried; compile examples plus deterministic Table/JSON/Excel inspector boundary tests run in desktop `check`. DOM, CSV/TSV, and parser error paths remain. |
| Filesystem: `$fs` direct operations | `DclFileSystem`, `RealFSWriter`, Tauri filesystem commands | `resources/api-filesystem.md` | Broad method list exists; path, size, overwrite, and error contracts need an operation-by-operation matrix. |
| Filesystem transaction API | `DclFSTransaction` and `fs/tx/*` | `resources/api-filesystem.md` | Core virtual state transitions (create/update, duplicate destination, rename, directory registration, invalid path) execute under isolated dependency mocks in desktop `check`; open/snapshot conflicts and commit conflicts remain. |
| Network: `$net` | `DclNet` and desktop `load_http` / `load_html_from_url` commands | `resources/api-network.md` | Request shape is documented; defaults, redirects, errors, timeout/body limits, and response details need verification against command implementations. |
| MCP authoring/validation flow | `apps/mcp/src/server.rs`, desktop MCP workspace handler | `resources/api-and-validation.md`, `resources/core.md` | Syntax and semantic checks are described; live Codex smoke test passed, but automated contract tests and production build verification remain. |

### Member checklist to verify against live declarations

- `$print(str)`, `$println(str)`; channel mode is mutually exclusive with
  plain output.
- `$channel.createTextStream(channelId)` returns `print` and `println`;
  `$channel.createTableStream(channelId, cols)` returns `add`. Column members:
  `name`, optional `type` (`string`/`number`), optional `width`.
- `$runtime.exit()`, `$runtime.sleep(ms)`.
- `$state.useProgress(denominator)` returns `getCurrent()` and `tick()`;
  `$state.useMonitor(allocSize)` returns text callbacks.
- `$parser.xml(source)`, `html(source)`, `excel(filePath)`, `csv(source)`,
  `tsv(source)`, `json(source)`.
- Excel members: Book `sheets`, `sheet(name)`; Sheet `name`, `maxRow`, `maxCol`,
  `rows`, `rowAt(index)`, `cellAt(row,col)` / `cellAt(address)`,
  `toTable(headerRowIndex?)`; Row `rowIndex`, `cells`, `cellAt(colIndex)`;
  Cell `rowIndex`, `colIndex`, `address`, `value`.
- DOM controller: `root`, `query`, `debug` (`domId`, `nodeCount`), `dispose`;
  node: `name`, `text`, `attr`, `children`, `parent`, `query`.
- Table inspector: `rowCount`, `colCount`, `columns`, `row`, `toObject`; row:
  `get`, `getString`, `getNumber`, `has`, `keys`.
- JSON inspector: `root`, `query`, `queryString`, `queryNumber`,
  `queryBoolean`, `exists`, `keys`, `length`, `toObject`, `toCsv`, `toTsv`.
- `$fs` direct: `exists`, `glob`, `stat`, `readDir`, `readText`, `tailText`,
  `saveText`, `copyFile`, `makeDir`, `deleteFile`, `deleteDir`, `renameFile`,
  `renameDir`. Stat fields: `size`, `isFile`, `isDir`, optional `createdAt`,
  `modifiedAt`.
- `$fs.useTransaction()` is per worker session and returns `makeDir`,
  `deleteDir`, `openText`, `saveText`, `updateText`, `copyFile`,
  `copyFileByToken`, `deleteFile`, `deleteFileByToken`, `renameFile`,
  `renameFileByToken`.
- Transaction tokens are branded opaque identifiers returned by `openText`;
  `__fileTokenBrand` is a type-level implementation detail, not a value to
  construct or persist.
- `$net.getHtml`, `request`, `getText`, `getJson`; request options `url`,
  optional `method`, `query`, `headers`, `body`, `timeoutMs`; response fields
  `url`, `status`, `ok`, optional `contentType`, `headers`, `body`, `fetchedAt`.
- Dynamic context: `$env` string properties; `$resource` string or parsed table
  properties; `$dataset` entries with `fileName`, `absolutePath`,
  `relativePath`, `content`; `$process` functions with workspace-defined
  parameters and `stdout`, `stderr`, `exitCode`; `$logic` functions with
  workspace-defined inferred signatures. Pro capability gates `$process`,
  `$logic`, `$fs`, and `$net`; validation state can further disable context
  entries. Declare source contributes workspace-specific ambient declarations.

## Phases and completion gates

1. **Freeze the inventory.** Enumerate every exported API member from the
   declarations that `get_work_context` returns, plus dynamic workspace
   namespaces. Record method availability (`plain`/`channel`, Pro/license,
   valid workspace entry), source implementation, docs section, example, and
   test. New public members must update this ledger.
2. **Audit contracts.** For each member, compare declared types and prose to
   runtime implementation and native commands. Record sync/async behavior,
   nullability, indexing, validation, thrown errors, side effects, limits, and
   license/method gates. Resolve each discrepancy in code or docs before
   marking it covered.
3. **Complete usage examples.** Provide at least one minimal idiomatic example
   for every API member or tightly related overload group, plus warnings where
   type declarations cannot prove runtime input shape or side effects.
4. **Add static verification.** Compile every example against the actual
   generated API declarations. Include negative cases for common misuse (wrong
   method, argument/record types, null handling, and unavailable APIs). Tests
   must prove that valid examples pass and representative invalid examples
   fail with useful diagnostics.
5. **Add behavioral boundary tests.** Test deterministic parser, state, output,
   transaction, filesystem, and network behavior with fixtures/mocks or an
   isolated temporary directory/local test server. Never use a user's live
   data or external service as a test fixture.
6. **Enforce coverage in CI.** Fail if a declared public member has no ledger
   entry, guide anchor/example, or required test. Run desktop type checks, MCP
   tests, and production build. Add integration checks for list session,
   reference lookup, live context, valid/invalid validation; do not execute or
   create generated Works in those checks.
7. **Release acceptance.** Confirm a clean production build and repeat the
   read-only/validation smoke test in Codex after restarting the rebuilt app.

## Progress

- Phase 1 is complete for built-in Work APIs: a script extracts members
  reachable from the real channel, runtime, state, parser, filesystem, and
  network declarations, then checks family documentation, implementation
  sources, and this ledger. Workspace-defined context shapes remain live and
  are checked through `get_work_context` rather than a static inventory.
- Phase 2 has completed an initial audit for validation, parser, filesystem,
  and network guidance. Further method-by-method behavior review remains.
- Phase 3 has a first baseline: all 15 current TypeScript examples compile
  against declarations from the current API sources, with controlled ambient
  inputs for workspace-specific names.
- Phase 4 now includes five representative negative checks for output argument
  types, channel table records, nullable Excel sheets, plain/channel method
  separation, and the Pro-only filesystem API. Per-API negative cases and
  license variants beyond the basic Pro gate remain.
- The coverage script runs as part of the desktop `check` command. There is no
  repository CI workflow in this checkout to wire separately yet.
- A no-dependency behavior script now executes the production Table, JSON,
  Runtime, and State namespaces plus the Excel parser wrapper with mocked
  native calls. It checks row/column and type errors, JSON paths and exports,
  Excel address/null lookups, table conversion, runtime exit-signal identity,
  progress ticks, and monitor callbacks. Numeric-looking JSON strings are
  intentionally classified as numeric by current CSV/TSV conversion behavior.
- The same script executes the production FS transaction facade and
  deterministic transaction/path components with an in-memory VFS and mocked
  external file reads. It covers create/update, duplicate copy destination,
  rename targets, directory registration, and invalid Windows path/name rules;
  it does not yet exercise optimistic snapshots or final commit conflict logic.
- The behavior script is integrated into the desktop `check` command. This is
  representative boundary coverage, not runtime coverage for every API.

## Findings from the initial pass

- The API overview still described `validate_work` as syntax-only even though
  the desktop now performs semantic type checking. The overview was corrected.
- Filesystem guidance incorrectly treated the 50 MiB `readText` limit as a
  whole-file limit for `tailText`. The implementation scans backward and caps
  the tail buffer; `lineCount === 0` returns before opening the path. The guide
  now distinguishes these behaviors.
- `tailText` initially did not enforce an absolute path, unlike `readText`. Its
  implementation now applies the same absolute-path guard; zero-line requests
  validate path syntax and count but still do not open the target file.
- The initial API member test found that Excel `rowAt` was not explained. The
  parser guide now covers the Sheet/Row/Cell members and null/zero-based lookup
  behavior.
- The network implementation has material behavior not stated in the original
  guide: 8-second default timeout, up to 3 redirects, 2 MiB response cap, and
  per-host pacing / 30-request app-session limit. The guide now documents these
  limits and clarifies that body helpers do not reject non-2xx statuses.
- A desktop script now extracts reachable members from the actual built-in API
  declarations and checks that each appears in its family guide and this
  ledger. This covers built-in API signatures but not workspace-dependent
  context entries; those remain integration-tested against live declarations.
  The script checks documentation presence, not yet whether every code example
  compiles. No API-specific desktop behavioral test suite was found in the
  initial source scan.
- Production build was previously attempted but stopped after Node memory grew
  above 2 GiB. Retrying `vite build` reproduced the issue: the Vite client
  transform reached roughly 2.8 GiB RSS while processing existing Monaco
  worker bundles, then exited without a successful artifact. MCP code, type
  checks, and behavior tests all pass, but the production build remains an
  unresolved release gate requiring investigation or a higher-memory build
  environment.

## What the gates can and cannot guarantee

The inventory and CI gates can guarantee that every declared public member is
accounted for in documentation and static tests. Type checking can catch
syntax/type/signature misuse relative to the live declarations. Fixture tests
can verify selected runtime boundaries. None of these can prove that an
arbitrary generated Work matches the user's intent, has correct business logic,
or will succeed against unknown live files, services, or external programs;
the user remains the authority who decides whether to execute it.
