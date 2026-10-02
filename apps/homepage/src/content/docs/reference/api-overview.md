---
title: API概要
description: Trace Kernelがworkから利用できる標準API。
---

Trace Kernelは、workから利用できる独自APIを提供します。

contextはワークスペースで定義した内容によって変わります。一方、APIはTrace Kernelが実行環境として提供する機能です。

```text
標準API
├── $print / $println
├── $channel
├── $state
├── $parser
└── $runtime
```

## contextとの違い

contextは、ユーザーがワークスペースに登録した情報です。

```ts
$env.OUTPUT_DIR
$resource.userData
$dataset.workspace
```

APIは、Trace Kernelの実行環境が提供する操作能力です。

```ts
$println('hello');
const { tick } = $state.useProgress(100);
```

この2つは役割が異なるため、リファレンス上も分けて扱います。

## 出力方式とAPI

workの`output_method`により、出力用APIが変わります。

| output_method | 利用できる出力API | 用途 |
| --- | --- | --- |
| `Plain` | `$print` / `$println` | シンプルなテキスト出力 |
| `Channel` | `$channel` | 複数ストリーム、テーブル出力 |

`$state`、`$parser`、`$runtime`は、出力方式とは別に利用するAPIです。

## Pro API

ファイル操作やネットワークアクセスのようにTrace Kernelの外側へ作用するAPIは、[Pro](/pro/)配下で扱います。
