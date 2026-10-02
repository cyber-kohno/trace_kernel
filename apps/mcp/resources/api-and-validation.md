# Trace Kernel APIs and Work Creation

For `plain` Works, `$print` and `$println` accept a string and return void. For `channel` Works, use `$channel` for multiple streams and table output. `$runtime`, `$state`, and `$parser` are common APIs. `$fs` and `$net` are Pro-only APIs and may affect the machine or network.

Call `validate_work` before `create_work`. The desktop client rejects empty source, invalid names, duplicate names, and TypeScript diagnostics. This is preflight validation, not a guarantee that runtime data or external processes will succeed.

## Safe sequence

1. Discover a live session.
2. Read the workspace overview and resources.
3. Read the relevant resource samples.
4. Read `get_work_context` and use its declarations as the TypeScript contract.
5. Validate a new uniquely named Work.
6. Create it once if valid.
7. Tell the user to review and save it.

Never replace an existing Work through MCP. Create another uniquely named Work or ask the user to edit manually.
