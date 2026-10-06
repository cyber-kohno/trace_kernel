# Trace Kernel APIs and Work Creation

Use `get_api_reference` to fetch focused documentation when needed: `output`, `runtime-state`, `parser`, `filesystem`, or `network`. These topics cover every built-in Work API. `context` covers workspace-injected `$env`, `$resource`, `$dataset`, `$process`, and `$logic`. `$fs`, `$net`, `$process`, and `$logic` are Pro-only. Call `get_work_context` with the intended Work method (`plain` or `channel`); its `apiDeclarations` and `contextDeclarations` are the authoritative live type declarations for injected APIs and workspace inputs. Its `context` and `declare` fields also provide names, signatures, and user declarations.

## Choose a capability

| Goal | MCP discovery and data tools | Work API |
| --- | --- | --- |
| Inspect the current project and available entries | `get_workspace_overview`, `list_resources`, `list_works` | `$env`, `$resource`, `$dataset`, `$process`, `$logic` as present in live context |
| Read a workbook or structured text | `get_resource_sample`, `get_resource`, inspect Dataset metadata | `$parser.excel`, `html`, `xml`, `csv`, `tsv`, `json` |
| Produce simple text or structured output | Choose `plain` or `channel` in the Work | `$print` / `$println` or `$channel` |
| Report progress or wait | — | `$state`, `$runtime` |
| Read or change files | Confirm the requested path and effect | Pro-only `$fs`; use its transaction API for reviewable grouped changes |
| Contact a web service | Confirm the intended endpoint and transmitted data | Pro-only `$net` |

For a Work, inspect the current workspace, fetch guidance for each API area it needs, request `get_work_context` with the chosen method, then validate before creating a new uniquely named Work. A parser's presence in its declaration does not mean that inputs, file paths, sheet names, or external services have been verified.

Call `validate_work` before `create_work`. Validation checks the Work name, duplicate names, method, empty source, TypeScript syntax, and semantic types against the live workspace, Work method, built-in API declarations, and user Declare source. It does not execute the Work or validate runtime data, external processes, file operations, or network requests. Treat success as a static preflight result, not a guarantee of runtime behavior; state any remaining assumptions clearly. `create_work` repeats the validation against the current workspace before saving a new Work. To revise an existing Work, read `get_ui_state` and `get_work`, preserve the open Work's `editorId` and exact source baseline, and submit a complete replacement with `propose_work_update`. The app checks that the same editor is still open and the source still matches before showing a whole-file diff; it checks again on Apply. A stale proposal is rejected without showing a dialog. Only explicit app approval applies the replacement; the tool returns applied, rejected, stale, or validation-failed status to the chat. It never executes the Work.

## Safe sequence

1. Discover a live session.
2. Read the workspace overview and resources.
3. Read the relevant resource samples.
4. Read `get_work_context` and use its declarations as the TypeScript contract.
5. Validate a new uniquely named Work.
6. Create it once if valid.
7. Tell the user to review and save it.

Never replace an existing Work through `create_work`. To revise one, use the
app-mediated `propose_work_update` flow above; it requires an open editor,
matching source baseline, and explicit app approval.
