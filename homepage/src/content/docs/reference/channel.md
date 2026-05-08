---
title: $channel
description: テキストストリームとテーブルストリーム。
---

`$channel` は、複数の出力ストリームを作るためのAPIです。

## テキストストリーム

```ts
const log = $channel.createTextStream('log');
log.println('start');
log.println('done');
```

![チャンネルストリーム出力](/screen_shot/チャンネルストリーム出力.JPG)

## テーブルストリーム

```ts
const report = $channel.createTableStream('report', [
  { name: 'id' },
  { name: 'name' },
  { name: 'age', type: 'number' },
]);

report.add({ id: '001', name: 'taro', age: 22 });
```

![テーブルストリーム出力](/screen_shot/テーブルストリーム出力.JPG)
