---
title: Book / Sheet / Row / Cell
description: Excelファイルをシート、行、セルとして操作するオブジェクト。
---

`$parser.excel()`は、Excelファイルのパスを受け取り、`Book`を返します。

`Book`、`Sheet`、`Row`、`Cell`は、Excelファイルを「ブック、シート、行、セル」の単位で参照するための操作オブジェクトです。

```ts
const book = await $parser.excel(`${$env.ROOT_DIR}\\sales.xlsx`);
const sheet = book.sheet('Sheet1');

if (sheet) {
  const cell = sheet.cellAt('A1');
  $println(cell?.value ?? '');
}
```

## 想定するExcel

以降の例では、次のような`Sheet1`を想定します。

| A | B | C |
| --- | --- | --- |
| id | name | amount |
| 001 | taro | 1200 |
| 002 | jiro | 900 |

コードでは、Excelファイルのパスを`$parser.excel()`に渡します。

```ts
const book = await $parser.excel(`${$env.ROOT_DIR}\\sales.xlsx`);
const sheet = book.sheet('Sheet1');

if (!sheet) {
  $println('Sheet1 not found');
  $runtime.exit();
}
```

## Book

| プロパティ/メソッド | 型 | 説明 |
| --- | --- | --- |
| `sheets` | `Sheet[]` | シート一覧です。 |
| `sheet(name)` | `Sheet \| null` | 名前でシートを取得します。 |

`Book`はExcelファイル全体を表します。まず`sheet(name)`で対象シートを取り出し、以降は`Sheet`から行やセルを参照します。

```ts
$println(book.sheets.map((s) => s.name).join(','));
```

出力例:

```txt
Sheet1
```

## Sheet

| プロパティ/メソッド | 型 | 説明 |
| --- | --- | --- |
| `name` | `string` | シート名です。 |
| `maxRow` | `number` | 最大行数です。 |
| `maxCol` | `number` | 最大列数です。 |
| `rows` | `Row[]` | 行一覧です。 |
| `rowAt(index)` | `Row \| null` | 0始まりの行番号で行を取得します。 |
| `cellAt(rowIndex, colIndex)` | `Cell \| null` | 0始まりの行・列番号でセルを取得します。 |
| `cellAt(address)` | `Cell \| null` | `A1`のようなアドレスでセルを取得します。 |
| `toTable(headerRowIndex?)` | `Record<string, string>[]` | 指定行をヘッダとして表形式へ変換します。 |

`Sheet`はExcelの1シートを表します。セル番地で直接セルを取ることも、行を取得してから列番号でセルを取ることもできます。

`rowAt()`や`cellAt(rowIndex, colIndex)`の行番号・列番号は0始まりです。一方、`cellAt('A1')`ではExcel上のセル番地をそのまま指定できます。

```ts
$println(`rows: ${sheet.maxRow}`);
$println(`cols: ${sheet.maxCol}`);

const a1 = sheet.cellAt('A1');
const sameA1 = sheet.cellAt(0, 0);

$println(a1?.value ?? '');
$println(sameA1?.value ?? '');
```

出力例:

```txt
rows: 3
cols: 3
id
id
```

## Row

```ts
type Row = {
  rowIndex: number;
  cells: Cell[];
  cellAt(colIndex: number): Cell | null;
};
```

| プロパティ/メソッド | 型 | 説明 |
| --- | --- | --- |
| `rowIndex` | `number` | 行番号です。0始まりです。 |
| `cells` | `Cell[]` | 行に含まれるセル一覧です。 |
| `cellAt(colIndex)` | `Cell \| null` | 0始まりの列番号でセルを取得します。存在しない場合は`null`を返します。 |

`Row`は、シート内の1行を表します。行に含まれるセルをまとめて扱いたい場合や、列番号で特定セルを取得したい場合に使います。

```ts
const row = sheet.rowAt(1);

if (row) {
  const name = row.cellAt(1)?.value ?? '';
  $println(name);
}
```

想定しているExcelでは、`rowAt(1)`は2行目、つまり`001 / taro / 1200`の行です。`cellAt(1)`はB列を指します。

出力例:

```txt
taro
```

## Cell

```ts
type Cell = {
  rowIndex: number;
  colIndex: number;
  address: string;
  value: string;
};
```

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `rowIndex` | `number` | セルの行番号です。0始まりです。 |
| `colIndex` | `number` | セルの列番号です。0始まりです。 |
| `address` | `string` | `A1`や`B2`のようなセル番地です。 |
| `value` | `string` | セルの値です。文字列として取得されます。 |

`Cell`は、シート内の1セルを表します。値だけでなく、行番号、列番号、セル番地も一緒に確認できます。

```ts
const cell = sheet.cellAt('A1');

if (cell) {
  $println(`${cell.address}: ${cell.value}`);
}
```

出力例:

```txt
A1: id
```

## toTable

`toTable()`は、ヘッダ行のセル値をキーにして、以降の行をオブジェクト配列へ変換します。ヘッダ行がない場合や、ヘッダ名が重複している場合はエラーになります。

```ts
const table = sheet.toTable(0);

for (const row of table) {
  $println(`${row.name}: ${row.amount}`);
}
```

出力例:

```txt
taro: 1200
jiro: 900
```

`toTable(0)`は、0行目をヘッダとして扱います。上の例では、`id`、`name`、`amount`がオブジェクトのキーになります。

```ts
const table = sheet.toTable(0);
const first = table[0];

$println(first.id);
$println(first.name);
$println(first.amount);
```

出力例:

```txt
001
taro
1200
```

`toTable()`の戻り値は`Record<string, string>[]`です。セル値は文字列として扱われます。数値として計算したい場合は、必要に応じて`Number(...)`などで変換します。

```ts
let total = 0;

for (const row of sheet.toTable(0)) {
  total += Number(row.amount);
}

$println(String(total));
```

出力例:

```txt
2100
```

## エラーになりやすいケース

- `book.sheet(name)`で存在しないシート名を指定すると`null`が返る
- `rowAt(index)`で存在しない行番号を指定すると`null`が返る
- `cellAt(address)`で不正なセル番地を指定すると`null`が返る
- `cellAt(rowIndex, colIndex)`で存在しないセルを指定すると`null`が返る
- `toTable()`で指定したヘッダ行が存在しない場合はエラーになる
- `toTable()`でヘッダ名が重複している場合はエラーになる
- `toTable()`の値は文字列なので、数値計算には明示的な変換が必要

<div class="image-memo">
  <strong>画像メモ:</strong> Excelファイルのパスを<code>$parser.excel()</code>へ渡し、シート選択、<code>toTable()</code>、結果出力までを見せるGIFがあるとよいです。Excelを「アプリ内で確認・加工できる」ことが伝わります。
</div>
