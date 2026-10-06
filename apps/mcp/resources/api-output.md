# Output APIs

Choose the Work method to match the output shape. The live declarations are returned by `get_work_context` for the requested method.

## `plain`: `$print` and `$println`

Both accept one string and return `void`. Use `String(value)` or a template string for non-string values.

```ts
$println('Import complete');
$print(`Rows: ${rows.length}`);
```

## `channel`: `$channel`

Use a `channel` Work for multiple named outputs or typed tables. Choose unique channel IDs within the Work. Table column names must be unique; declared `string` and `number` column types guide TypeScript record checking, omitted types default to `string`, and optional `width` controls a column's display width.

```ts
const log = $channel.createTextStream('status');
const table = $channel.createTableStream('results', [
  { name: 'name', type: 'string' },
  { name: 'count', type: 'number' },
] as const);

log.println('Processing complete');
table.add({ name: 'orders', count: 12 });
```

Create streams before adding records. The channel API creates the corresponding UI stream when the stream is created. Do not use `$print` or `$println` in a `channel` Work; use the returned text stream instead.
