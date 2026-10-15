---
title: ログ/CSVを解析する
description: resourceに登録したテキストをTypeScriptで処理し、結果を出力する例。
---

このレシピでは、GUIで登録したCSVをworkから参照し、集計結果を出力します。

標準機能だけで完結する作業です。ファイルを更新したり、外部プログラムを呼び出したりせず、Trace Kernel上で入力を確認し、TypeScriptで処理し、結果をコピーして利用します。

## やりたいこと

売上CSVを`resource`として登録し、担当者ごとの合計金額を集計します。

```csv
owner,amount
sato,1200
sato,800
suzuki,2000
```

## 例

```ts
const totals = new Map<string, number>();

for (const row of $resource.sales) {
  const owner = row.owner;
  const amount = Number(row.amount);
  totals.set(owner, (totals.get(owner) ?? 0) + amount);
}

$println('owner,total');

for (const [owner, total] of totals) {
  $println(`${owner},${total}`);
}
```

## 結果

```csv
owner,total
sato,2000
suzuki,2000
```

出力結果は、必要に応じてコピーし、表計算ソフトや報告用のメモに貼り付けて使います。

> **画像メモ:** resourceにCSVを登録し、`$resource.sales`と列名が補完され、実行結果をコピーするまでのGIFがあるとよい。
