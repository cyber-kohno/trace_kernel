# Trace Kernel Context Injection

Context is workspace data, not a standard API. The live client injects usable entries into these namespaces.

## `$env`

Environment entries are injected as strings, for example `$env.OUTPUT_DIR`.

## `$resource`

Without parsing, a resource is a `string`. With CSV or TSV parsing, it becomes an array of objects whose properties come from the header. Use `get_resource_sample` before coding against it.

```ts
const text: string = $resource.rawLog;
for (const row of $resource.userData) $println(`${row.id}: ${row.name}`);
```

## `$dataset`

Each dataset is an array of `{ fileName: string; absolutePath: string; relativePath: string; content: () => Promise<string> }`.

## `$process`

Each process is an asynchronous function with workspace-defined arguments and returns `Promise<{ stdout: string; stderr: string; exitCode: number }>`.

## `$logic`

Logic functions have signatures inferred from their source. The exact declaration is returned by `get_work_context`.

Invalid context entries are excluded from injection. Never invent a context variable.
