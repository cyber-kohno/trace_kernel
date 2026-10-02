---
title: resource
description: CSV、JSON、ログ、テキストなどの入力を登録する。
---

`resource`は、静的な入力データを変数に紐づけるためのcontextです。

ログ、CSV、TSV、JSON、メモ用テキストなどをGUIのテキストエリアに貼り付け、workから`$resource`として参照します。

![resource追加時](/screen_shot/resource追加時.JPG)

## 設定項目

| 項目 | 説明 |
| --- | --- |
| `variable_name` | workから参照する変数名です。 |
| `source` | ソーステキストです。複数行のログやCSVを直接貼り付けます。 |
| `parse_method` | ソーステキストの変換方法です。 |

## parse_method

| 選択肢 | 動作 |
| --- | --- |
| 未指定 | `string`型のテキストとしてそのまま参照します。 |
| `CSV to JSON` | CSVのヘッダを解析し、オブジェクト配列に変換します。 |
| `TSV to JSON` | TSVのヘッダを解析し、オブジェクト配列に変換します。 |

CSV to JSONでは、全レコードの値がNULLでなく、ダブルクォーテーションで囲われていない場合、数値変換できる値は`number`型として扱われます。

## コード例

parse_method未指定の場合は、文字列として参照します。

```ts
const text: string = $resource.rawLog;
$println(text.slice(0, 100));
```

CSV to JSONを指定した場合は、ヘッダ名をプロパティとして持つ配列として参照します。

```ts
for (const user of $resource.userData) {
  $println(`${user.id}: ${user.name}`);
}
```

## 補完

resourceとして登録した名前は、エディタ補完に反映されます。

CSVのように列構造を持つ入力では、列名をプロパティとして補完しながら処理を書けます。

![補完](/screen_shot/補完.JPG)

> **画像メモ:** CSV登録後に`$resource.userData[0].`で列名が補完されるGIFがあるとよい。
