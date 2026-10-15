# Trace Kernel Context Injection

Context is workspace data, not a standard API. The live client injects usable entries into these namespaces. Call `get_work_context` first and use its returned names and signatures; entries disabled by validation or unavailable under the current license are not injected. `$process` and `$logic` are Pro-only.

## `$env`

Environment entries are injected as strings, for example `$env.OUTPUT_DIR`.

## `$resource`

Without parsing, a resource is a `string`. With CSV or TSV parsing, it becomes an array of objects whose properties come from the header. CSV may infer numeric columns; TSV values are strings. Empty cells become `null` at runtime, and declarations include `| null` for columns with empty cells anywhere in the input. Handle nullable values before calling string or numeric methods. Use `get_resource_sample` before coding against it.

`get_resource_sample` uses the same client-side `DataUtil` parser as GUI parsing and Work Context Injection. For CSV/TSV it parses the complete input, then returns `headers`, up to 10 `rows` (arrays of values in header order), and `totalRows` (parsed record count, not physical line count). Values retain runtime types, including numbers and nulls. Parser errors are reported instead of returning a misleading sample. Even records beyond the sample affect type inference and validation.

For a Resource without a parse method, the tool returns `parse: null`, empty `headers` and `rows`, `totalRows: null`, and a `sampleText` of up to 4096 characters with a `truncated` flag. It does not interpret plain text as CSV. Use `get_resource` to read the complete source.

```ts
const text: string = $resource.rawLog;
for (const row of $resource.userData) $println(`${row.id}: ${row.name}`);
```

## `$dataset`

Each dataset is an array of `{ fileName: string; absolutePath: string; relativePath: string; content: () => Promise<string> }`. Use `await file.content()` to read text; use `absolutePath` when an API such as `$parser.excel` requires a path.

## `$process`

Each process is an asynchronous function with workspace-defined arguments and returns `Promise<{ stdout: string; stderr: string; exitCode: number }>`. Its exact function signature is in `get_work_context`. Calling it launches the configured external program, so inspect its purpose and arguments before use and check `exitCode` and `stderr`.

## `$logic`

Logic functions have signatures inferred from their source, the current user Declare source, and available context and other Logic definitions. The GUI and MCP use the same inference and availability rules; non-Pro or disabled Logic entries are not listed or declared. Each Logic can refer to other usable Logic entries, but its own name is excluded from its injected `$logic`. The exact declaration is returned by `get_work_context`. Call a logic function by its injected `$logic` name and use its declared argument and return types; do not assume it has side effects or a particular return shape without reading its source or description.

## `$parser`

`$parser` is injected into every Work. Its live TypeScript declaration is returned by `get_work_context`; use the actual injected context names and Resource samples when adapting these examples.

### Excel

`excel(filePath)` asynchronously opens a workbook. `sheet(name)` returns a sheet or `null`; `cellAt` accepts zero-based row and column indexes or an Excel address. `toTable` treats row 0 as the header by default and returns objects keyed by header text. Duplicate headers throw an error.

```ts
const book = await $parser.excel($dataset.sales[0].absolutePath);
const sheet = book.sheet('Orders');
if (sheet == null) throw new Error('Orders sheet not found');
const rows = sheet.toTable();
for (const row of rows) $println(`${row.OrderId}: ${row.Amount}`);
```

Replace `$dataset.sales` and the sheet/column names with names confirmed from the live workspace and workbook. `rowAt` and numeric `cellAt` indexes are zero-based; `cellAt('B2')` uses a one-based Excel address.

### HTML and XML DOM

`html(source)` and `xml(source)` asynchronously parse strings and return a controller. Queries use XPath. Node methods are asynchronous; `text()` returns descendant text, `attr()` and `name()` may return `null`. Dispose the controller when finished.

```ts
const htmlSource = '<html><head><title>Example</title></head><body></body></html>';
const dom = await $parser.html(htmlSource);
try {
  const titles = await dom.query('//title');
  for (const title of titles) $println(await title.text());
} finally {
  await dom.dispose();
}
```

Use `root()` when you need the document root, and `node.query(xpath)` to search below one node. Keep XPath and source appropriate to the provided data; the parser reads the supplied string and does not fetch URLs itself.

### CSV, TSV, and JSON

`csv(source)` and `tsv(source)` return a table inspector; `json(source)` returns a JSON inspector. Read their exact method and return types from `get_work_context`. For tabular Resources, inspect `get_resource_sample` first so code uses real headers and value types.

Invalid context entries are excluded from injection. Never invent a context variable.
