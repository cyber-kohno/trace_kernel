---
title: Context概要
description: Proで追加されるワークスペースcontext。
---

Proでは、標準contextに加えて、外部プログラムと共通ロジックをworkから参照できます。

| context | 役割 |
| --- | --- |
| `process` | 登録した外部プログラムをworkから呼び出す |
| `logic` | 複数のworkから再利用する処理を定義する |

どちらもワークスペースで定義し、workから`$process`、`$logic`として参照します。
