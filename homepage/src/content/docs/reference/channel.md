---
title: $channel
description: テキストストリームとテーブルストリーム。
---

`$channel`は、`output_method`が`Channel`のworkで使用できる出力APIです。

複数の出力ストリームを動的に生成し、ストリームごとに結果を分けて確認できます。

`output_method`が`Plain`のworkでは`$channel`は利用せず、代わりに`$print` / `$println`を使います。

## テキストストリーム

### 生成

```ts
const log = $channel.createTextStream('log');
```

`createTextStream(name)`でテキスト出力用のストリームを生成します。

### 出力

```ts
log.print('hello');
log.println('world');
```

### コード例

```ts
const log = $channel.createTextStream('log');
const error = $channel.createTextStream('error');

log.println('処理を開始します');
error.println('警告: 対象ファイルが見つかりません');
log.println('処理を終了しました');
```

![チャンネルストリーム出力](/screen_shot/チャンネルストリーム出力.JPG)

実行結果画面では、`log`ストリームと`error`ストリームを切り替えて確認できます。

## テーブルストリーム

### 生成

```ts
const report = $channel.createTableStream('report', [
  { name: 'id' },
  { name: 'name' },
  { name: 'age', type: 'number' },
]);
```

`createTableStream(name, columns)`でテーブル出力用のストリームを生成します。

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `name` | `string` | カラム名 |
| `type` | `'number'` | 数値カラム。省略時は文字列カラムとして扱われます。 |

### 行の追加

```ts
report.add({ id: '001', name: 'taro', age: 22 });
```

`add()`で行を追加します。定義した列に基づいて補完が効きます。

### コード例

```ts
const report = $channel.createTableStream('report', [
  { name: 'id' },
  { name: 'fileName' },
  { name: 'matchCount', type: 'number' },
]);

for (const file of $dataset.files) {
  const content = await file.content();
  const count = (content.match(/pattern/g) ?? []).length;
  report.add({ id: file.fileName, fileName: file.relativePath, matchCount: count });
}
```

![テーブルストリーム出力](/screen_shot/テーブルストリーム出力.JPG)

## 複数ストリームの使い分け

```ts
const summary = $channel.createTextStream('summary');
const details = $channel.createTableStream('details', [
  { name: 'file' },
  { name: 'line', type: 'number' },
  { name: 'content' },
]);

let totalCount = 0;

for (const file of $dataset.files) {
  const lines = (await file.content()).split('\n');
  lines.forEach((line, i) => {
    if (line.includes('TODO')) {
      totalCount++;
      details.add({ file: file.fileName, line: i + 1, content: line.trim() });
    }
  });
}

summary.println(`TODO件数: ${totalCount}件`);
```

実行結果画面のストリーム選択UIで、`summary`と`details`を切り替えて確認できます。
