# Parser API

`$parser` is available in every Work. `get_work_context` returns its exact TypeScript declaration. Confirm actual Resource columns or Dataset paths before using them. Parser operations can fail on malformed input, missing sheets/paths, duplicate headers, or incompatible values; handle those cases where appropriate.

## Excel: `$parser.excel`

`excel(filePath)` asynchronously reads an Excel workbook and returns `Book`. `sheets` lists the sheets in workbook order; `sheet(name)` returns an exact-name match or `null`, so check for null before using it. A Sheet exposes `name`, `maxRow`, `maxCol`, and `rows`. `rowAt(index)` uses a zero-based row index and returns `Row | null`; `Row` exposes its zero-based `rowIndex`, `cells`, and `cellAt(colIndex)`, which uses a zero-based column index and returns `Cell | null`. `Sheet.cellAt(rowIndex, colIndex)` also uses zero-based indexes; if either cell is absent it returns null. Alternatively, `Sheet.cellAt(address)` accepts an Excel address such as `B2` and returns null for invalid or absent cells. Cell addresses use normal one-based Excel notation; each Cell exposes zero-based `rowIndex` and `colIndex`, its `address`, and string `value`.

```ts
const book = await $parser.excel(filePath);
for (const sheet of book.sheets) $println(sheet.name);

const sheet = book.sheet('Orders');
if (sheet == null) throw new Error('Orders sheet not found');
const cell = sheet.cellAt('B2');
if (cell != null) $println(`${cell.address}: ${cell.value}`);
const records = sheet.toTable(0); // row 0 contains headers
```

`toTable(headerRowIndex?)` maps following rows to objects using header cell text. It throws if the header row is absent or has duplicate names. Missing cells in returned records become empty strings. Use a known header row index when the workbook has title rows above its table.

## HTML and XML: `$parser.html` and `$parser.xml`

Both accept source text and return a controller asynchronously. They do not fetch URLs. Queries use XPath. DOM node methods are asynchronous; `name()` and `attr()` may return null. Always dispose a controller when finished, including when processing throws.

```ts
const dom = await $parser.html(htmlSource);
try {
  const links = await dom.query('//a[@href]');
  for (const link of links) {
    const href = await link.attr('href');
    const label = await link.text();
    $println(`${label}: ${href ?? ''}`);
  }
} finally {
  await dom.dispose();
}
```

`root()` returns the root node or null; `query(xpath)` searches from the document controller; `node.query(xpath)` searches relative to that node. `children()` and `parent()` also return asynchronous node results. `debug()` returns `domId`, the parser's internal ID for diagnostics, and `nodeCount`, the number of parsed nodes.

## CSV and TSV

`csv(source)` and `tsv(source)` synchronously parse text into a `TableInspector`. `columns()`, `rowCount()`, and `colCount()` describe the table. `row(index)` is zero-based and throws when out of range. CSV columns are inferred as numbers only when all data values fit; TSV values remain strings. Empty cells become `null`. On a row, use `keys()` to list fields and `has(key)` before reading uncertain columns; `get(key)` returns `unknown`, while `getString` and `getNumber` enforce runtime types and throw on missing, null, or mismatched values. `toObject<T>()` returns the parsed records; its generic does not validate a caller-provided type.

```ts
const table = $parser.csv(csvText);
$println(`Rows: ${table.rowCount()}`);
if (table.columns().includes('name')) {
  for (let i = 0; i < table.rowCount(); i++) {
    $println(table.row(i).getString('name'));
  }
}
```

## JSON

`json(source)` parses JSON and returns a `JsonInspector`. `root()` reads the whole value; `query<T>(path)` reads a value; `queryString`, `queryNumber`, and `queryBoolean` enforce primitive types. `exists(path)`, `keys(path?)`, and `length(path?)` inspect a value. Paths use dot-separated property names and numeric bracket indexes, for example `orders[0].id`; there is no quoted-key syntax, so use `toObject<T>()` for keys that contain dots or brackets. Typed queries throw if the path is missing or the value has another type. `toCsv()` and `toTsv()` require a non-empty root array of flat records with consistent keys and string/number values.

```ts
const data = $parser.json(jsonText);
if (data.exists('orders[0].id')) {
  $println(data.queryString('orders[0].id'));
}
```
