---
title: $parser
description: XML、HTML、Excel、CSV、TSV、JSONを操作オブジェクトへ変換するAPI。
---

`$parser`は、文字列として扱えるXML、HTML、CSV、TSV、JSONや、ファイルパスで指定したExcelファイルを解析し、workから扱いやすい操作オブジェクトとして参照するためのAPIです。

`$parser`は入力を解析して参照しやすい形に変換するためのAPIです。ファイルや入力データを書き換えるものではなく、読み取った内容を検索、参照、集計、出力する作業に使います。

## パースの入口

`$parser`の各関数は、対象データを直接操作するための処理本体ではなく、文字列やファイルパスを専用の操作オブジェクトへ変換する入口です。

| 入口 | 入力 | 返る操作オブジェクト |
| --- | --- | --- |
| `$parser.xml(source)` | XML文字列 | [`DomController`](/reference/parser/dom/) |
| `$parser.html(source)` | HTML文字列 | [`DomController`](/reference/parser/dom/) |
| `$parser.excel(filePath)` | Excelファイルパス | [`Book`](/reference/parser/excel/) |
| `$parser.csv(source)` | CSV文字列 | [`TableInspector`](/reference/parser/table/) |
| `$parser.tsv(source)` | TSV文字列 | [`TableInspector`](/reference/parser/table/) |
| `$parser.json(source)` | JSON文字列 | [`JsonInspector`](/reference/parser/json/) |

以降の検索、行参照、セル参照、パス参照などは、取得した操作オブジェクトのメソッドで行います。

## XML

```ts
const source = `<users>
  <user id="001">taro</user>
  <user id="002">jiro</user>
</users>`;

const dom = await $parser.xml(source);
```

XML文字列をDOMとして扱うための入口です。返り値は`DomController`です。ノード検索や属性取得は[DomController / XmlNode](/reference/parser/dom/)を参照してください。

## HTML

```ts
const source = `<html>
  <body>
    <h1>Trace Kernel</h1>
    <a href="/download/">Download</a>
  </body>
</html>`;

const dom = await $parser.html(source);
```

HTML文字列をDOMとして扱うための入口です。Webページや保存済みHTMLから、タイトル、リンク、表などの必要な要素を取り出す作業に使います。操作APIは[DomController / XmlNode](/reference/parser/dom/)を参照してください。

## Excel

```ts
const book = await $parser.excel(`${$env.ROOT_DIR}\\sales.xlsx`);
```

Excelファイルを`Book`として扱うための入口です。Excelだけは文字列ではなく、ファイルパスを指定します。シート、行、セル、表形式データの参照は[Book / Sheet / Row / Cell](/reference/parser/excel/)を参照してください。

## CSV

```ts
const source = `id,name,amount
001,taro,1200
002,jiro,900`;

const table = $parser.csv(source);
```

CSV文字列を表として扱うための入口です。返り値は`TableInspector`です。行、列、型付きの値の参照は[TableInspector / TableRow](/reference/parser/table/)を参照してください。

## TSV

```ts
const source = `id\tname\tstatus
001\ttaro\tactive
002\tjiro\tinactive`;

const table = $parser.tsv(source);
```

TSV文字列を表として扱うための入口です。CSVと同じく`TableInspector`を返しますが、TSVでは列値は文字列として扱われます。操作APIは[TableInspector / TableRow](/reference/parser/table/)を参照してください。

## JSON

```ts
const source = `{
  "users": [
    { "id": "001", "name": "taro" },
    { "id": "002", "name": "jiro" }
  ]
}`;

const json = $parser.json(source);
```

JSON文字列をパス指定で参照するための入口です。返り値は`JsonInspector`です。`users[0].name`のようなパスで値を取り出す操作は[JsonInspector](/reference/parser/json/)を参照してください。

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
