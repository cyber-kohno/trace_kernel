# $channel API リファレンス

`$channel` は、output_method が **Channel** のワークで使用できる出力APIです。

複数の出力ストリームを動的に生成し、ストリームごとに結果を分けて確認できます。

> output_method が **Plain** のワークでは `$channel` は注入されず、代わりに `$print` / `$println` が使用可能です。

---

## テキストストリーム

### 生成

```typescript
const log = $channel.createTextStream('ストリーム名');
```

`createTextStream(name)` でテキスト出力用のストリームを生成し、ハンドルを返します。

### 出力

```typescript
log.print('hello');    // 改行なし
log.println('world');  // 改行あり
```

### コード例

```typescript
const log = $channel.createTextStream('log');
const error = $channel.createTextStream('error');

log.println('処理を開始します');
error.println('警告: 対象ファイルが見つかりません');
log.println('処理を終了しました');
```

実行結果画面では、`log` ストリームと `error` ストリームをそれぞれ切り替えて確認できます。

---

## テーブルストリーム

### 生成

```typescript
const report = $channel.createTableStream('ストリーム名', [
  { name: 'id' },
  { name: 'name' },
  { name: 'age', type: 'number' },
]);
```

`createTableStream(name, columns)` でテーブル出力用のストリームを生成します。

**columns の定義：**

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `name` | `string` | カラム名 |
| `type` | `'number'`（省略可） | 省略時は文字列カラムとして扱われる |

### 行の追加

```typescript
report.add({ id: '001', name: 'taro', age: 22 });
```

`add()` で行を追加します。定義した列に基づいて**補完が効きます**。

### コード例

```typescript
const report = $channel.createTableStream('report', [
  { name: 'id' },
  { name: 'fileName' },
  { name: 'matchCount', type: 'number' },
]);

for (const d of $dataset.files) {
  const content = await d.content();
  const count = (content.match(/pattern/g) ?? []).length;
  report.add({ id: d.fileName, fileName: d.relativePath, matchCount: count });
}
```

実行結果画面では、テーブル形式でデータを確認できます。

---

## 複数ストリームの使い分け

```typescript
const summary = $channel.createTextStream('summary');
const details = $channel.createTableStream('details', [
  { name: 'file' },
  { name: 'line', type: 'number' },
  { name: 'content' },
]);

for (const d of $dataset.files) {
  const lines = (await d.content()).split('\n');
  lines.forEach((line, i) => {
    if (line.includes('TODO')) {
      details.add({ file: d.fileName, line: i + 1, content: line.trim() });
    }
  });
}

summary.println(`TODO件数: ${totalCount}件`);
```

実行結果画面のストリーム選択UIで、`summary`（テキスト）と `details`（テーブル）をそれぞれ切り替えて確認できます。
