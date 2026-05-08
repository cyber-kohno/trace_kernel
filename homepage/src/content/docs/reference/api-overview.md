---
title: API概要
description: Trace Kernelがworkへ注入するAPI。
---

Trace Kernelは、workの実行時に独自APIを注入します。

```text
$print / $println
$channel
$state
$fs
$parser
$net
$runtime
```

また、ワークスペースで定義したコンテキストも注入されます。

```text
$env
$resource
$dataset
$process
```

## 注意

このページはサイト構造確認用の仮ページです。今後、`app/src/app/contents/detail/program/util/declare-util.ts` と関連実装を正として、API一覧を抽出します。
