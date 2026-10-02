# Trace Kernel Agent Knowledge

Trace Kernel is a desktop TypeScript workbench. A workspace contains context and independent Works: env, resource, dataset, process, logic, and works.

## Agent policy

- Inspect the live workspace before proposing code.
- Existing entries are read-only through MCP.
- `validate_work` checks a candidate without changing the workspace.
- `create_work` is the only update operation. It creates one new AI-origin Work and never edits or deletes existing entries.
- Works are independent TypeScript programs; there are no imports or automatic dependency ordering between Works.
- The user reviews and saves the new Work.

Use the live `get_work_context` result as the exact declaration for the current workspace. It accounts for invalid context entries and current licensing.

## Work basics

A Work has a unique name, an output method (`plain` or `channel`), and TypeScript source. `plain` exposes `$print` and `$println`; `channel` exposes `$channel`. Both also expose `$runtime`, `$state`, and `$parser`. `$fs` and `$net` are available only with the Pro capability.

## Current UI target

When a user refers to "this Work", "the selected item", or "the open editor", call `get_ui_state` for the relevant session. The response is a snapshot of UI state:

```json
{
  "outlineSelection": { "type": "work", "name": "HelloWorld", "index": 0 },
  "editor": { "type": "work", "name": "HelloWorld", "index": 0, "open": true }
}
```

`outlineSelection` is the highlighted entry in the outline and is null when nothing is selected or its target no longer exists. `editor` is null when no source editor is open. A selected Work alone does not imply an open editor. Work, Logic, and Declare source editors are reported; Declare has null name and index. Settings is not a source editor.

The current UI shares the selected target with the Work/Logic editor. Closing that editor leaves the outline selection intact. `open: true` reports an open editor; it does not establish that the user is typing, has unsaved edits, or is currently executing code.

Only identifiers are returned. Read a Work's complete current source with `get_work` using its returned name. Logic source retrieval is not currently provided by MCP. The zero-based index describes the snapshot and is not a persistent identifier; refresh UI state when the user changes selection.
