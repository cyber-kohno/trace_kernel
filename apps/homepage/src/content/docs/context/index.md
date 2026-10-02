---
title: Context概要
description: ワークスペースで定義し、workから参照する情報。
---

contextは、workから参照できる外部情報です。

Trace Kernelでは、ログやCSVなどの入力、処理対象のファイル群、パスや固定値をアプリ上で登録し、TypeScriptコードから`$env`、`$resource`、`$dataset`として参照します。

```ts
$env.OUTPUT_DIR
$resource.sales
$dataset.workspace
```

登録内容はエディタ補完にも反映されます。たとえばCSVをresourceとして登録すると、resource名や列名を補完しながらプログラムを書けます。

## 標準context

| context | 役割 |
| --- | --- |
| `env` | パス、URL、固定値などを定義する |
| `resource` | CSV、JSON、ログ、テキストなどの入力を登録する |
| `dataset` | 処理対象にするファイル群を定義する |

> **画像メモ:** resourceにCSVを登録し、`$resource.sales`と列名が補完される流れを見せるGIFがあるとよい。
