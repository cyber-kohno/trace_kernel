# Excel API 仕様書

## 概要

`$parser.excel(buffer)` は、Excel ファイルのバイナリを読み込み、シート・行・セルを扱うための機能。

主に以下の用途を想定する。

- シート一覧の確認
- 特定シートの行走査
- セル単位の値取得
- 先頭行をヘッダとしてテーブル化


## 基本の使い方

```ts
const buffer = await $fs.readBinary(filePath);
const book = await $parser.excel(buffer);

for (const sheet of book.sheets) {
  $println(sheet.name);
}
```


## API 一覧

### `$parser.excel`

```ts
const book = await $parser.excel(buffer);
```

- 引数
  - `buffer: ArrayBuffer`
- 戻り値
  - `Promise<Book>`


## `Book`

### `sheets`

すべてのシート一覧。

```ts
book.sheets.forEach(sheet => {
  $println(sheet.name);
});
```


### `sheet(name)`

名前でシート取得。

```ts
const users = book.sheet("Users");
```

- 戻り値
  - `Sheet | null`


## `Sheet`

### プロパティ

- `name`
  - シート名
- `maxRow`
  - シート内の最大行 index
- `maxCol`
  - シート内の最大列 index
- `rows`
  - 行一覧


### `row(index)`

行番号で取得する。

```ts
const header = sheet?.row(0);
```

- 戻り値
  - `Row | null`


### `toTable(headerRow?)`

指定した行をヘッダとして、以降の行を `Record<string, string>[]` に変換する。

```ts
const records = sheet?.toTable(0) ?? [];
```

- 引数
  - `headerRow?: number`
  - 省略時は `0`
- 戻り値
  - `Record<string, string>[]`

### `toTable()` のルール

- ヘッダ行のセル値を列名として使う
- データ行に値がないセルは空文字 `""`
- ヘッダ名が重複している場合はエラー
- ヘッダ行が見つからない場合はエラー


## `Row`

### プロパティ

- `index`
  - 行番号
- `cells`
  - セル一覧


### `cell(col)`

列番号でセル取得。

```ts
const c = row?.cell(2);
$println(c?.value ?? "");
```

- 戻り値
  - `Cell | null`


## `Cell`

### プロパティ

- `row`
  - 行番号
- `col`
  - 列番号
- `value`
  - セル値文字列


## スクリプト例

### 1. シート名一覧を表示

```ts
const buffer = await $fs.readBinary(filePath);
const book = await $parser.excel(buffer);

for (const sheet of book.sheets) {
  $println(sheet.name);
}
```


### 2. 特定シートの全行を走査

```ts
const buffer = await $fs.readBinary(filePath);
const book = await $parser.excel(buffer);
const sheet = book.sheet("Users");

if (sheet != null) {
  for (const row of sheet.rows) {
    $println(`row=${row.index}`);
    for (const cell of row.cells) {
      $println(`  col=${cell.col}, value=${cell.value}`);
    }
  }
}
```


### 3. 行・列を指定してセル取得

```ts
const buffer = await $fs.readBinary(filePath);
const book = await $parser.excel(buffer);
const sheet = book.sheet("Users");
const row = sheet?.row(1);
const nameCell = row?.cell(1);

$println(nameCell?.value ?? "");
```


### 4. テーブル化して扱う

```ts
const buffer = await $fs.readBinary(filePath);
const book = await $parser.excel(buffer);
const sheet = book.sheet("Users");

const records = sheet?.toTable(0) ?? [];
for (const record of records) {
  $println(`${record.id} ${record.name} ${record.age}`);
}
```


### 5. dataset と組み合わせて複数 Excel を処理

```ts
for (const file of $dataset.excelFiles) {
  const buffer = await $fs.readBinary(file.absolutePath);
  const book = await $parser.excel(buffer);
  const sheet = book.sheet("Users");
  if (sheet == null) continue;

  const records = sheet.toTable(0);
  $println(`${file.fileName}: ${records.length} records`);
}
```


## 注意点

- 読み込み元は `ArrayBuffer`
- 実際には `await $fs.readBinary(...)` と組み合わせることが多い
- セル値は現時点ではすべて `string`
- 空セルは `cells` に存在しない場合がある
- `toTable()` はヘッダ行前提の簡易変換


## 現時点の向いている用途

- Excel を簡単に一覧化する
- 特定シートの表データを読む
- ヘッダ付きシートをオブジェクト配列化する
