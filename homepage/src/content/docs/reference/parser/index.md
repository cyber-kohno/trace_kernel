---
title: $parser
description: XML、HTML、Excel、CSV、TSV、JSON を解析して扱う API
---

`$parser` は、文字列やファイルを解析し、扱いやすい形に変換するための API です。

## パース API 一覧

| API | 入力 | 戻り値 |
| --- | --- | --- |
| `$parser.xml(source)` | XML 文字列 | [`DomController`](/reference/parser/dom/) |
| `$parser.html(source)` | HTML 文字列 | [`DomController`](/reference/parser/dom/) |
| `$parser.excel(filePath)` | Excel ファイルパス | [`Book`](/reference/parser/excel/) |
| `$parser.csv(source)` | CSV 文字列 | [`TableInspector`](/reference/parser/table/) |
| `$parser.tsv(source)` | TSV 文字列 | [`TableInspector`](/reference/parser/table/) |
| `$parser.json(source)` | JSON 文字列 | [`JsonInspector`](/reference/parser/json/) |

## XML

```ts
const source = `<users>
  <user id="001">taro</user>
  <user id="002">jiro</user>
</users>`;

const dom = await $parser.xml(source);
```

XML 文字列を DOM として扱うための入口です。返り値は `DomController` です。ノード検索や属性取得は [DomController / DomNode](/reference/parser/dom/) を参照してください。

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

HTML 文字列を DOM として扱うための入口です。Web ページや保存済み HTML から、タイトル、リンク、表などの必要な要素を取り出す作業に使います。操作 API は [DomController / DomNode](/reference/parser/dom/) を参照してください。

## Excel

```ts
const book = await $parser.excel(`${$env.ROOT_DIR}\\sales.xlsx`);
```

Excel ファイルを `Book` として扱うための入口です。詳細は [Book / Sheet / Row / Cell](/reference/parser/excel/) を参照してください。

## CSV

```ts
const source = `id,name,amount
001,taro,1200
002,jiro,900`;

const table = $parser.csv(source);
```

CSV 文字列は `TableInspector` として扱えます。詳細は [TableInspector / TableRow](/reference/parser/table/) を参照してください。

## TSV

```ts
const source = `id\tname\tstatus
001\ttaro\tactive
002\tjiro\tinactive`;

const table = $parser.tsv(source);
```

TSV 文字列も `TableInspector` として扱えます。

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

JSON 文字列は `JsonInspector` として扱えます。詳細は [JsonInspector](/reference/parser/json/) を参照してください。

## 型定義

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
