---
title: プログラムを書く
description: Monacoエディタ、補完、実行、出力方式。
---

workは、Trace KernelでTypeScriptを書く単位です。

![プログラムエディタ](/screen_shot/プログラムエディタ表示時.JPG)

## 補完

ワークスペースに登録したコンテキストは、Monacoエディタに型情報として注入されます。

![補完](/screen_shot/補完.JPG)

## 実行

プログラムは画面上のRun操作、またはショートカットで実行します。

実行後は、ソース表示から結果表示に切り替わります。

![プログラム実行時](/screen_shot/プログラム実行時（出力結果）.JPG)

## 出力方式

workの出力方式には、主に次の2系統があります。

| 方式 | 主なAPI | 用途 |
| --- | --- | --- |
| plain | `$print` / `$println` | シンプルなテキスト出力 |
| channel | `$channel` | 複数ストリーム、テーブル出力 |

```ts
$println('hello');
```

```ts
const report = $channel.createTableStream('report', [
  { name: 'id' },
  { name: 'name' },
]);
report.add({ id: '001', name: 'taro' });
```
