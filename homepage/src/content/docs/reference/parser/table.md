---
title: TableInspector / TableRow
description: CSV、TSVを表として操作するオブジェクト。
---

`$parser.csv()`と`$parser.tsv()`は、テキストを表として解析し、`TableInspector`を返します。

`TableInspector`は、CSV/TSVを「ヘッダ付きの行データ」として扱うための操作オブジェクトです。行数や列名を確認し、行ごとに値を取り出したり、オブジェクト配列へ変換したりできます。

```ts
const table = $parser.csv($resource.salesCsv);

$println(`rows: ${table.rowCount()}`);
$println(table.columns().join(','));

for (let i = 0; i < table.rowCount(); i++) {
  const row = table.row(i);
  $println(`${row.getString('owner')}: ${row.getNumber('amount')}`);
}
```

## サンプルCSV

以降の例では、次のCSV文字列を使います。

```ts
const source = `id,name,amount,active
001,taro,1200,true
002,jiro,900,false
003,hanna,,true`;

const table = $parser.csv(source);
```

CSVは列型を推定します。この例では、`amount`は数値列として扱われます。ただし空文字は`null`になります。

## TableInspector

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `rowCount()` | `number` | 行数を返します。 |
| `colCount()` | `number` | 列数を返します。 |
| `columns()` | `string[]` | カラム名一覧を返します。 |
| `row(index)` | `TableRow` | 指定行を取得します。範囲外はエラーです。 |
| `toObject<T>()` | `T[]` | オブジェクト配列として取得します。 |

`rowCount()`、`colCount()`、`columns()`を使うと、表の形を確認できます。

```ts
$println(`rows: ${table.rowCount()}`);
$println(`cols: ${table.colCount()}`);
$println(table.columns().join(','));
```

出力は次のようになります。

```txt
rows: 3
cols: 4
id,name,amount,active
```

`row(index)`は0始まりの行番号で行を取得します。ヘッダ行は含まれず、データ行の先頭が`0`です。

## TableRow

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `get(key)` | `unknown` | 値を取得します。 |
| `getString(key)` | `string` | 文字列として値を取得します。型が違う場合はエラーです。 |
| `getNumber(key)` | `number` | 数値として値を取得します。型が違う場合はエラーです。 |
| `has(key)` | `boolean` | カラムが存在するか確認します。 |
| `keys()` | `string[]` | カラム名一覧を返します。 |

`TableRow`は、1行分の値を列名で参照するためのオブジェクトです。

```ts
const row = table.row(0);

$println(row.getString('id'));
$println(row.getString('name'));
$println(String(row.getNumber('amount')));
```

出力は次のようになります。

```txt
001
taro
1200
```

`get(key)`は値をそのまま返します。型が明確な場合は、`getString()`や`getNumber()`を使うと、型違いを検出できます。

```ts
const row = table.row(2);

$println(row.getString('name'));
$println(String(row.get('amount')));
```

出力は次のようになります。

```txt
hanna
null
```

`getNumber('amount')`は、値が`null`の場合にエラーになります。空欄の可能性がある列は、`get()`で取り出してから判定します。

```ts
const amount = row.get('amount');

if (typeof amount === 'number') {
  $println(String(amount));
} else {
  $println('amount is empty');
}
```

## toObject

`toObject<T>()`を使うと、表全体をオブジェクト配列として取得できます。

```ts
type SalesRow = {
  id: string;
  name: string;
  amount: number | null;
  active: string;
};

const rows = table.toObject<SalesRow>();

for (const row of rows) {
  $println(`${row.id}: ${row.name}: ${row.amount ?? 'empty'}`);
}
```

出力は次のようになります。

```txt
001: taro: 1200
002: jiro: 900
003: hanna: empty
```

`toObject<T>()`の型指定は、TypeScript上で扱いやすくするためのものです。実行時にデータを検証するものではありません。

## TSV

TSVも`TableInspector`として扱います。区切り文字がタブである点以外は、CSVと同じ流れです。

```ts
const source = `id\tname\tstatus
001\ttaro\tactive
002\tjiro\tinactive`;

const table = $parser.tsv(source);

for (let i = 0; i < table.rowCount(); i++) {
  const row = table.row(i);
  $println(`${row.getString('id')}: ${row.getString('status')}`);
}
```

出力は次のようになります。

```txt
001: active
002: inactive
```

TSVでは列値は文字列として扱われます。数値として扱いたい場合は、取得後に自分で変換します。

## エラーになりやすいケース

- `row(index)`で範囲外の行番号を指定する
- 存在しない列名を`get()`、`getString()`、`getNumber()`に指定する
- `getString()`で文字列以外の値を取得しようとする
- `getNumber()`で数値以外、または`null`の値を取得しようとする
- CSVで数値列として推定された列に、数値化できない値が入っている
