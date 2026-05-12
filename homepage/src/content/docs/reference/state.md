---
title: $state
description: 実行中の進捗とモニター表示。
---

`$state`は、workの実行中にGUI上へプログレスバーやモニターを表示するAPIです。

大量のファイルを処理する場合や、現在どの対象を処理しているか確認したい場合に使います。

たとえば、`dataset`で定義した数千件のファイルを順番に開いて解析する処理では、完了まで数分かかることがあります。何も指定しない場合、実行中の画面には`Executing...`だけが表示されます。

この状態では、いつ終わるのか、今どのファイルを解析しているのかがわかりません。`$print`で都度出力することもできますが、実行中の状態として見たい情報は、出力結果とは分けて固定表示した方が扱いやすくなります。

![スクリプト実行中](/screen_shot/スクリプト実行中.JPG)

## Progress

`useProgress`は、完了まで時間がかかる処理の進捗を可視化します。

```ts
const { tick } = $state.useProgress(totalCount);
```

`useProgress`を実行すると、指定した母数のプログレスバーをGUIに表示することを宣言し、進捗を操作するためのハンドルを取得できます。返り値の`tick()`を呼び出すたびに、プログレスバーが1つ進みます。

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

このように、プログレスバーの宣言と、ループ内での加算関数呼び出しを追加するだけで、実行中の画面に進捗を表示できます。

![プログレスバー](/screen_shot/スクリプト実行中（プログレスバー）.JPG)

## Monitor

`useMonitor`は、処理中に変化する値を固定テキストとしてリアルタイム更新します。

```ts
const [summary, current] = $state.useMonitor(2);
```

モニターは、実行中に確認したい値をGUI上に固定表示するための仕組みです。たとえば、条件に一致したファイル数や、現在解析中のファイル名をリアルタイムで更新できます。

`useMonitor(count)`を呼び出すと、指定した数だけモニターの更新関数を配列で返します。分割代入で受け取ると、それぞれの表示を関数呼び出しで更新できます。

| 引数 | 型 | 説明 |
| --- | --- | --- |
| `count` | `number` | 確保するモニタースロット数です。 |

返り値は、スロット数と同じ長さの更新関数配列です。

### コード例

```ts
const [summary, current] = $state.useMonitor(2);

let matchCount = 0;

for (const file of $dataset.files) {
  current(`解析中のファイル: [${file.fileName}]`);
  const content = await file.content();

  if (content.includes('TARGET')) {
    matchCount++;
  }

  summary(`パターン一致件数: ${matchCount}件`);
}
```

取得した更新関数に文字列を渡すと、対応するモニター表示が更新されます。出力パネルにログを増やさずに、実行中の状態だけを画面上で追えます。

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
