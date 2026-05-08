---
title: $state
description: 実行中の進捗とモニター表示。
---

`$state` は、実行中の状態をGUIへ表示するAPIです。

## Progress

```ts
const { tick } = $state.useProgress($dataset.workspace.length);

for (const file of $dataset.workspace) {
  await file.content();
  tick();
}
```

![プログレスバー](/screen_shot/スクリプト実行中（プログレスバー）.JPG)

## Monitor

```ts
const [summary, current] = $state.useMonitor(2);

for (const file of $dataset.workspace) {
  current(`解析中: ${file.relativePath}`);
}

summary('完了');
```

![モニター](/screen_shot/スクリプト実行中（モニター）.JPG)
