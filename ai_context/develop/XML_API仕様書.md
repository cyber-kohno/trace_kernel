# XML API 仕様書

## 概要

`$parser.xml(source)` は、XML 文字列を読み込み、DOM 風の API で参照するための機能。

主に以下の用途を想定する。

- XML のノード抽出
- 属性値の取得
- 要素配下テキストの取得
- XPath 風の簡易検索


## 基本の使い方

```ts
const doc = await $parser.xml(xmlSource);

const root = await doc.root();
$println(String(await root?.name()));

await doc.dispose();
```


## API 一覧

### `$parser.xml`

```ts
const doc = await $parser.xml(source);
```

- 引数
  - `source: string`
- 戻り値
  - `Promise<DomController>`


## `DomController`

### `root()`

ルート要素を取得する。

```ts
const root = await doc.root();
```

- 戻り値
  - `Promise<XmlNode | null>`


### `query(xpath)`

ドキュメント全体を対象に簡易 XPath で検索する。

```ts
const items = await doc.query("//item");
```

- 引数
  - `xpath: string`
- 戻り値
  - `Promise<XmlNode[]>`


### `debug()`

内部状態の確認用。

```ts
const info = await doc.debug();
$println(`domId=${info.domId}, nodeCount=${info.nodeCount}`);
```

- 戻り値
  - `Promise<{ domId: number; nodeCount: number }>`


### `dispose()`

内部で保持している DOM を破棄する。

```ts
await doc.dispose();
```

- 実行後はその `doc` を使わないこと


## `XmlNode`

### `name()`

要素名を取得する。

```ts
const name = await node.name();
```

- 戻り値
  - `Promise<string | null>`
- 要素以外では `null`


### `text()`

そのノード配下のテキストを連結して取得する。

```ts
const text = await node.text();
```

- 戻り値
  - `Promise<string>`


### `attr(name)`

属性値を取得する。

```ts
const id = await node.attr("id");
```

- 戻り値
  - `Promise<string | null>`


### `children()`

子ノード一覧を取得する。

```ts
const children = await node.children();
```

- 戻り値
  - `Promise<XmlNode[]>`


### `parent()`

親ノードを取得する。

```ts
const parent = await node.parent();
```

- 戻り値
  - `Promise<XmlNode | null>`


### `query(xpath)`

そのノード配下を起点に検索する。

```ts
const prices = await product.query("./price");
```

- 戻り値
  - `Promise<XmlNode[]>`


## 対応している XPath 風記法

最小構成のため、対応は限定的。

### 子要素指定

```ts
/root/item
```

### 子孫要素指定

```ts
//item
```

### ワイルドカード

```ts
/root/*
```

### 属性存在条件

```ts
//item[@id]
```

### 属性一致条件

```ts
//item[@id="A001"]
```


## サンプル XML

```xml
<catalog>
  <book id="B001" category="tech">
    <title>Trace Kernel Guide</title>
    <price>1200</price>
  </book>
  <book id="B002" category="novel">
    <title>Hello Story</title>
    <price>800</price>
  </book>
</catalog>
```


## スクリプト例

### 1. ルート要素名を表示

```ts
const doc = await $parser.xml(source);
const root = await doc.root();
$println(String(await root?.name()));
await doc.dispose();
```


### 2. `book` 要素を全件取得

```ts
const doc = await $parser.xml(source);
const books = await doc.query("//book");

for (const book of books) {
  $println(`id=${await book.attr("id")}`);
  $println(`text=${await book.text()}`);
}

await doc.dispose();
```


### 3. 属性条件で抽出

```ts
const doc = await $parser.xml(source);
const techBooks = await doc.query('//book[@category="tech"]');

for (const book of techBooks) {
  const titles = await book.query("./title");
  if (titles.length > 0) {
    $println(await titles[0].text());
  }
}

await doc.dispose();
```


### 4. 子ノードを手でたどる

```ts
const doc = await $parser.xml(source);
const root = await doc.root();
if (root != null) {
  const children = await root.children();
  for (const child of children) {
    $println(String(await child.name()));
  }
}
await doc.dispose();
```


## 注意点

- `dispose()` は最後に呼ぶことを推奨
- 完全な XPath 実装ではない
- 非同期 API なので `await` が必要
- `text()` は配下のテキストを連結して返す


## 現時点の向いている用途

- 設定 XML から特定タグを抜く
- 属性付き要素の抽出
- 小中規模の XML 解析

