# MCP Work source update proposal plan

## Status and scope

The feature described here is implemented in the desktop app and MCP adapter.
This plan remains the acceptance/traceability record; items not yet verified
are called out below. `create_work` creates only a new Work. Existing Works can
be changed only through an app-mediated proposal and explicit user approval.

The goal is to let an agent propose a source change for the Work whose source
editor was open when the agent read it. Trace Kernel, not the MCP client, owns
the confirmation UI and the final source mutation. The user chooses between
applying the complete proposed source and rejecting it. Per-hunk acceptance is
out of scope.

## Agreed behavior

1. The agent reads `get_ui_state`, identifies the open Work editor, then reads
   that Work and its current source. It retains the editor identity and exact
   source text as the proposal's read baseline.
2. The proposal request carries the target Work identity, baseline source, and
   complete proposed source. Work name/index alone is not a durable identity;
   the app must resolve the current Work and compare its current source to the
   baseline.
3. Before displaying any app UI, Trace Kernel verifies that the same Work
   editor is still open and that the current source exactly matches the
   baseline. If the editor is closed, the target changed/disappeared, or the
   source differs, reject without showing any dialog. Return a structured
   rejection result so the MCP tool response tells the originating chat that
   the proposal was rejected because the Work/editor/source changed since it
   was read.
4. If preflight and TypeScript semantic validation succeed, show a Monaco
   side-by-side whole-file diff. The only choices are Apply all and Reject.
   Apply remains disabled if the diff editor fails to load.
5. On Apply, re-check that the same Work editor is still open, the target still
   resolves to the same Work, and the source still exactly matches the
   baseline. Revalidate against current declarations and apply atomically
   within the app's event loop. If any check fails, apply nothing and return a
   stale-proposal rejection to chat.
6. On explicit user rejection, apply nothing and return a distinct rejected
   outcome. On acceptance, replace the Work source with the complete proposed
   source, update normal workspace state/dirty tracking/validation, then return
   an applied outcome.
7. When the diff flow closes, return to the still-mounted Work code editor,
   preserving its in-memory editor state where possible. No second independent
   modal stack is introduced; the single dialog manager switches its displayed
   view while retaining the editor component/state.

## Identity and concurrency design

- Capture an opaque editor-open identity/generation in app state, rather than
  relying only on the Work's current array index. Increment/invalidate it when
  the Work editor closes, a different Work opens, or the workspace changes.
- Include that editor identity and a request/proposal ID in the proposal so a
  delayed response cannot target a later editor instance that happens to show
  the same Work.
- Include baseline source (or a collision-resistant digest plus an app-verified
  baseline) and proposed source. The app must compare against its live editor
  model/current workspace source, not trust a client-provided “unchanged” flag.
- Revalidate at the moment of Apply. The compare-and-replace must be a single
  synchronous state transition after the final checks; do not await between
  final verification and mutation.
- If multiple proposals are pending, define one active proposal per editor and
  reject/cancel superseded requests, or explicitly serialize them. Never apply
  a proposal against a different baseline.

## MCP request/response lifecycle

The current bridge request waits for a response (up to 30 seconds), while the
current desktop listener expects each request handler to return and immediately
calls `mcp_respond`. A user decision may take longer. Before implementation,
change the bridge lifecycle to support a pending proposal safely: acknowledge
or register it, keep its MCP request pending while the app awaits the user, and
complete exactly once on apply/reject/stale/timeout/cancel. Revisit the 30-second
bridge timeout and ensure disconnect, app close, editor close, or workspace
switch resolves pending requests rather than leaving a dialog or promise stuck.

Structured outcomes should distinguish at least:

- `applied`: accepted and atomically applied;
- `rejected_by_user`: user declined;
- `rejected_stale`: editor closed/changed or baseline source no longer matches;
- `cancelled` / `timed_out`: request ended without source mutation.

The originating chat receives the terminal tool result. A stale rejection must
not open or leave any app confirmation UI visible.

## Implementation phases

### Phase A — Protocol and state model

- Define proposal request/response types, proposal IDs, editor-generation
  identity, baseline/proposed source payloads, and terminal outcomes.
- Extend the Tauri/MCP bridge to support long-lived pending decisions with
  exactly-once completion, timeout, cancellation, and cleanup.
- Keep all current read tools and `create_work` behavior unchanged.

### Phase B — Editor identity and stale-source protection

- Track which Work editor instance is open and invalidate its identity on close,
  switch, or workspace replacement.
- Add pre-display and pre-Apply checks for editor identity, Work identity, and
  exact source baseline.
- Ensure the editor's live unsaved Monaco source is reflected in the source
  compared by the app. Do not use only a previously saved workspace snapshot.
- Add tests proving every stale condition returns without opening UI or
  mutating the source.

### Phase C — Whole-source diff and apply/reject UI

- Extend the existing single-dialog manager with a proposal-diff view while
  retaining the mounted Work editor and its state.
- Display complete old/new diff with whole-proposal Apply and Reject actions.
- Do not add per-hunk controls.
- Keep user-facing copy, accessibility, and exact visual treatment as an
  explicit product decision before this phase is coded.

### Phase D — Atomic apply, state integration, and tests

- On Apply, synchronously recheck identity and baseline, replace the whole Work
  source once, update Svelte workspace state, dirty tracking and validation, and
  return `applied`.
- On reject/stale/timeout/cancel, leave source and workspace data untouched and
  return the corresponding terminal outcome to chat.
- Test bridge lifecycle, source/editor races, workspace switching, editor
  restoration, full apply, user rejection, stale rejection without UI, and
  duplicate/late completion handling. No test executes a Work.

### Phase E — Tool guidance and acceptance

- Add a proposal MCP tool and instructions requiring: capture open-editor
  identity + source baseline, obtain user intent, validate the complete
  proposed source against the live Work context, then submit one proposal.
- State clearly that a successful static validation is not runtime proof and
  that the app user's approval is required for mutation.
- Perform read-only smoke tests plus valid apply/reject/stale integration tests
  in a disposable fixture workspace. Verify existing Works cannot be directly
  overwritten through `create_work` or another bypass.

## Decisions made

- Diff presentation is Monaco side-by-side. A no-op proposal returns
  `no_changes` without UI. The bridge accepts request bodies up to 4 MiB.
- The decision window is 10 minutes; expiry closes the proposal UI, applies
  nothing, and returns `timed_out` to chat.
- Whether closing the diff window means explicit rejection or cancellation; in
  either case it must not mutate source and must complete the MCP request.
- UX for an already pending proposal when another proposal arrives.
- App-side syntax and semantic validation runs before display and again before
  Apply; errors block the proposal. The Work is never executed.

## Verification still needed

- Automated stale-editor/source and bridge-timeout lifecycle tests are not yet
  present. Smoke-test apply, reject, stale source, closed editor, timeout, and
  session stop before treating the feature as released.
- Run desktop type checks and Rust tests. A successful production bundle/build
  has not been confirmed in this workspace.

## Risks and constraints

- The current `get_ui_state` reports an open editor snapshot but not a durable
  editor identity or “user is typing” status. A new app-generated identity is
  required to protect against close/reopen and delayed requests.
- The current MCP bridge has a 30-second synchronous request/response wait.
  Interactive approval needs an explicit long-running or continuation design;
  simply awaiting a modal inside the current handler can time out.
- Work source changes in Monaco update the in-memory workspace on each change.
  Compare against current in-memory source, including unsaved edits.
- Existing `ProgramDialog` nests the transaction review dialog locally, but the
  global `DialogManager` selects exactly one dialog from a scalar store value.
  Preserve editor component state when switching to a proposal diff view.
- Source equality protects against accidental stale application, not semantic
  correctness. Type validation and human review remain necessary.

## Not in scope

- Applying changes to Logic, Declare, or any non-Work source editor.
- Applying only selected hunks or attempting dependency/overlap analysis.
- Executing the Work as part of proposal creation or acceptance.
- Silent background modification or automatic acceptance.
