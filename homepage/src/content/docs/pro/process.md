---
title: 外部プログラム
description: Pro版でworkから外部プログラムを呼び出す。
---

Pro版では、外部プログラムをcontextとして登録し、workから関数のように呼び出せます。

標準機能だけではTrace Kernel内で処理が完結します。Pro版の外部プログラム連携を使うと、既存のCLIツール、社内ツール、変換スクリプトなどをTrace Kernelの作業フローに組み込めます。

## 主な用途

- 既存の変換ツールを呼び出す
- 社内CLIから情報を取得する
- TypeScriptだけでは扱いにくい処理を外部プログラムに任せる
- 解析結果を外部ツールへ渡して追加処理する

## 使い方のイメージ

```ts
const result = await $process.convert($resource.sourceText);

if (result.stderr) {
  $println(result.stderr);
}

$println(result.stdout);
```

> **画像メモ:** processを登録し、workから`$process.xxx()`として補完・実行し、stdoutを出力するGIFがあるとよい。

## 注意

外部プログラムはTrace Kernelの外側で実行されます。実行対象、引数、出力、エラーを確認しながら使うことが重要です。
