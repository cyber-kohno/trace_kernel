---
title: $state
description: 実行中の進捗とモニター表示。
---

`$state`は、workの実行中にGUI上へプログレスバーやモニターを表示するAPIです。

大量のファイルを処理する場合や、現在どの対象を処理しているか確認したい場合に使います。

![スクリプト実行中](/screen_shot/スクリプト実行中.JPG)

## Progress

`useProgress`は、完了まで時間がかかる処理の進捗を可視化します。

```ts
const { tick } = $state.useProgress(totalCount);
```

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `totalCount` | `number` | プログレスバーの総数です。 |

| 返り値 | 型 | 説明 |
| --- | --- | --- |
| `tick` | `() => void` | プログレスバーを1つ進める関数です。 |

### コード例

```ts
const { tick } = $state.useProgress($dataset.files.length);

for (const file of $dataset.files) {
  const content = await file.content();
  // ...処理...
  tick();
}
```

![プログレスバー](/screen_shot/スクリプト実行中（プログレスバー）.JPG)

## Monitor

`useMonitor`は、処理中に変化する値を固定テキストとしてリアルタイム更新します。

```ts
const [summary, current] = $state.useMonitor(2);
```

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `count` | `number` | 確保するモニタースロット数です。 |

返り値は、スロット数と同じ長さの更新関数配列です。

### コード例

```ts
const [summary, current] = $state.useMonitor(2);

let matchCount = 0;

for (const file of $dataset.files) {
  current(`解析中のファイル: ${file.fileName}`);
  const content = await file.content();

  if (content.includes('TARGET')) {
    matchCount++;
  }

  summary(`パターン一致件数: ${matchCount}件`);
}
```

![モニター](/screen_shot/スクリプト実行中（モニター）.JPG)

## 組み合わせ

`useProgress`と`useMonitor`は同時に使えます。

```ts
const { tick } = $state.useProgress($dataset.files.length);
const [summary, current] = $state.useMonitor(2);

let matchCount = 0;

for (const file of $dataset.files) {
  current(`解析中: ${file.fileName}`);
  const content = await file.content();

  if (content.includes('TARGET')) {
    matchCount++;
    summary(`一致件数: ${matchCount}件`);
  }

  tick();
}
```

実行中のGUIには、全体の進捗、現在処理中の対象、累積件数を同時に表示できます。
