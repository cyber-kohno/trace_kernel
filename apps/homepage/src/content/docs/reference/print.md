---
title: $print / $println
description: テキストを出力するAPI。
---

`$print`と`$println`は、Trace Kernelの出力領域へテキストを表示するAPIです。

単純なログ、集計結果、コピーして使う成果物を出力するときに使います。

```ts
$print('hello');
$println('world');
```

## 使い分け

| API | 動作 |
| --- | --- |
| `$print` | 改行せずに出力する |
| `$println` | 改行付きで出力する |

## 例

```ts
$println('owner,total');

for (const row of $resource.summary) {
  $println(`${row.owner},${row.total}`);
}
```
