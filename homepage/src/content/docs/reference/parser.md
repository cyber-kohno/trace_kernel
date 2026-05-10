---
title: $parser
description: XML、HTML、Excel、CSV、TSV、JSONを扱うAPI。
---

`$parser`は、テキストやバイナリデータを解析し、workから扱いやすいオブジェクトとして参照するためのAPIです。

標準機能で利用できます。ファイルを書き換えるAPIではなく、入力を読み取り、解析し、結果を出力する作業に使います。

## API一覧

```ts
$parser.xml(source);
$parser.html(source);
$parser.excel(filePath);
$parser.csv(source);
$parser.tsv(source);
$parser.json(source);
```

| API | 入力 | 戻り値 | 用途 |
| --- | --- | --- | --- |
| `xml(source)` | `string` | `Promise<DomController>` | XMLをDOMとして解析する |
| `html(source)` | `string` | `Promise<DomController>` | HTMLをDOMとして解析する |
| `excel(filePath)` | `string` | `Promise<Book>` | Excelファイルを解析する |
| `csv(source)` | `string` | `TableInspector` | CSVを表として解析する |
| `tsv(source)` | `string` | `TableInspector` | TSVを表として解析する |
| `json(source)` | `string` | `JsonInspector` | JSONをパス指定で参照する |

## XML / HTML

`xml()`と`html()`は、文字列をDOMとして解析し、XPathでノードを検索できる`DomController`を返します。

```ts
const dom = await $parser.html($resource.pageHtml);

const titles = await dom.query('//title');
for (const title of titles) {
  $println(await title.text());
}

await dom.dispose();
```

### DomController

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `root()` | `Promise<XmlNode | null>` | ルートノードを取得します。 |
| `query(xpath)` | `Promise<XmlNode[]>` | XPathでノードを検索します。 |
| `debug()` | `Promise<{ domId: number; nodeCount: number }>` | DOM内部情報を取得します。 |
| `dispose()` | `Promise<void>` | DOMを破棄します。 |

### XmlNode

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `name()` | `Promise<string | null>` | ノード名を取得します。 |
| `text()` | `Promise<string>` | テキストを取得します。 |
| `attr(name)` | `Promise<string | null>` | 属性値を取得します。 |
| `children()` | `Promise<XmlNode[]>` | 子ノードを取得します。 |
| `parent()` | `Promise<XmlNode | null>` | 親ノードを取得します。 |
| `query(xpath)` | `Promise<XmlNode[]>` | 対象ノード配下をXPathで検索します。 |

<div class="image-memo">
  <strong>画像メモ:</strong> HTML文字列をresourceに登録し、<code>$parser.html()</code>でタイトルやリンクを抽出してテーブル出力する流れのGIFがあるとよいです。DOMツリーそのものより、「HTMLから必要な情報を取り出す」用途が伝わるものが向いています。
</div>

## Excel

`excel()`は、Excelファイルのパスを受け取り、`Book`を返します。

```ts
const book = await $parser.excel(`${$env.ROOT_DIR}\\sales.xlsx`);
const sheet = book.sheet('Sheet1');

if (sheet) {
  const cell = sheet.cellAt('A1');
  $println(cell?.value ?? '');
}
```

### Book

| プロパティ/メソッド | 型 | 説明 |
| --- | --- | --- |
| `sheets` | `Sheet[]` | シート一覧です。 |
| `sheet(name)` | `Sheet | null` | 名前でシートを取得します。 |

### Sheet

| プロパティ/メソッド | 型 | 説明 |
| --- | --- | --- |
| `name` | `string` | シート名です。 |
| `maxRow` | `number` | 最大行数です。 |
| `maxCol` | `number` | 最大列数です。 |
| `rows` | `Row[]` | 行一覧です。 |
| `rowAt(index)` | `Row | null` | 0始まりの行番号で行を取得します。 |
| `cellAt(rowIndex, colIndex)` | `Cell | null` | 0始まりの行・列番号でセルを取得します。 |
| `cellAt(address)` | `Cell | null` | `A1`のようなアドレスでセルを取得します。 |
| `toTable(headerRowIndex?)` | `Record<string, string>[]` | 指定行をヘッダとして表形式へ変換します。 |

### Row / Cell

```ts
type Row = {
  rowIndex: number;
  cells: Cell[];
  cellAt(colIndex: number): Cell | null;
};

type Cell = {
  rowIndex: number;
  colIndex: number;
  address: string;
  value: string;
};
```

`toTable()`は、ヘッダ行のセル値をキーにして、以降の行をオブジェクト配列へ変換します。ヘッダ行がない場合や、ヘッダ名が重複している場合はエラーになります。

```ts
const table = sheet.toTable(0);

for (const row of table) {
  $println(`${row.name}: ${row.amount}`);
}
```

<div class="image-memo">
  <strong>画像メモ:</strong> Excelファイルのパスを<code>$parser.excel()</code>へ渡し、シート選択、<code>toTable()</code>、結果出力までを見せるGIFがあるとよいです。Excelを「アプリ内で確認・加工できる」ことが伝わります。
</div>

## CSV / TSV

`csv()`と`tsv()`は、テキストを表として解析し、`TableInspector`を返します。

```ts
const table = $parser.csv($resource.salesCsv);

$println(`rows: ${table.rowCount()}`);
$println(table.columns().join(','));

for (let i = 0; i < table.rowCount(); i++) {
  const row = table.row(i);
  $println(`${row.getString('owner')}: ${row.getNumber('amount')}`);
}
```

### TableInspector

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `rowCount()` | `number` | 行数を返します。 |
| `colCount()` | `number` | 列数を返します。 |
| `columns()` | `string[]` | カラム名一覧を返します。 |
| `row(index)` | `TableRow` | 指定行を取得します。範囲外はエラーです。 |
| `toObject<T>()` | `T[]` | オブジェクト配列として取得します。 |

### TableRow

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `get(key)` | `unknown` | 値を取得します。 |
| `getString(key)` | `string` | 文字列として値を取得します。型が違う場合はエラーです。 |
| `getNumber(key)` | `number` | 数値として値を取得します。型が違う場合はエラーです。 |
| `has(key)` | `boolean` | カラムが存在するか確認します。 |
| `keys()` | `string[]` | カラム名一覧を返します。 |

CSVは列型を推定します。空文字は`null`になり、数値列として推定された列に数値化できない値がある場合はエラーになります。TSVは文字列列として扱われます。

## JSON

`json()`は、JSON文字列を解析し、パス指定で値を取り出せる`JsonInspector`を返します。

```ts
const json = $parser.json($resource.configJson);

if (json.exists('users[0].name')) {
  $println(json.queryString('users[0].name'));
}
```

### JsonInspector

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `root()` | `unknown` | ルート値を返します。 |
| `query(path)` | `unknown` | パスの値を返します。存在しない場合はエラーです。 |
| `queryString(path)` | `string` | 文字列として値を返します。型が違う場合はエラーです。 |
| `queryNumber(path)` | `number` | 数値として値を返します。型が違う場合はエラーです。 |
| `queryBoolean(path)` | `boolean` | 真偽値として値を返します。型が違う場合はエラーです。 |
| `exists(path)` | `boolean` | パスが存在するか確認します。 |
| `keys(path?)` | `string[]` | オブジェクトのキー一覧を返します。 |
| `length(path?)` | `number` | 配列長、またはオブジェクトのキー数を返します。 |
| `toObject<T>()` | `T` | JSON全体を指定型として取得します。 |

パスは、ドットと配列インデックスで指定します。

```ts
json.query('users[0].profile.name');
json.queryNumber('items[3].price');
```

## エラーになりやすいケース

- CSV/TSVの行ごとの列数がヘッダと一致しない
- CSVで数値列として推定された列に数値化できない値がある
- `TableInspector.row()`で範囲外の行を指定する
- `getString()`や`getNumber()`で実際の型と違う型を要求する
- JSON pathが存在しない
- JSON pathの配列インデックスが不正
- Excelの`toTable()`でヘッダ行が存在しない、またはヘッダ名が重複している

## 型定義

work内では、`$parser`は次のAPIとして補完されます。

```ts
type ParserAPI = {
  xml: (source: string) => Promise<DomController>;
  html: (source: string) => Promise<DomController>;
  excel: (filePath: string) => Promise<Book>;
  csv: (source: string) => TableInspector;
  tsv: (source: string) => TableInspector;
  json: (source: string) => JsonInspector;
};
```
