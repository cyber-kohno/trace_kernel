---
title: 共通ロジック
description: Pro版で複数のworkから再利用する処理を定義する。
---

Pro版では、複数のworkで使う処理をlogicとして定義できます。

標準機能では、workごとにTypeScriptを書きます。Pro版のlogicを使うと、よく使う整形処理、検証処理、変換処理などを共通化し、複数のworkから呼び出せます。

## 主な用途

- CSV行の正規化処理を共通化する
- ファイル名やパスの変換ルールをまとめる
- 複数のworkで使う検証処理を定義する
- チーム内で同じ処理を再利用する

## 使い方のイメージ

```ts
const normalized = $logic.normalizeUserName(row.name);
$println(normalized);
```

> **画像メモ:** logicを登録し、別のworkで`$logic.xxx()`として補完される流れを見せるGIFがあるとよい。

## 位置づけ

logicは、workが増えてきたときに効く機能です。

一度きりの解析ではworkに直接書けば十分です。同じ処理を繰り返し使うようになった段階で、logicとして切り出します。
