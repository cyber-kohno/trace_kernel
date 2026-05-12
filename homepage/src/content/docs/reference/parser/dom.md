---
title: DomController / XmlNode
description: XML、HTMLをDOMとして操作するオブジェクト。
---

`$parser.xml()`と`$parser.html()`は、文字列をDOMとして解析し、XPathでノードを検索できる`DomController`を返します。

DOMは、XMLやHTMLを「ノードのツリー」として扱うための形式です。タグは要素ノード、タグの中の文字はテキストノードとして管理されます。

Trace Kernelでは、まず`$parser.xml()`または`$parser.html()`で文字列を`DomController`に変換し、`query()`で必要なノードを探します。見つかったノードは`XmlNode`として扱い、`text()`や`attr()`で値を取り出します。

```ts
const dom = await $parser.html($resource.pageHtml);

const titles = await dom.query('//title');
for (const title of titles) {
  $println(await title.text());
}

await dom.dispose();
```

## 基本の流れ

DOM操作は、次の流れで使います。

1. 文字列を`DomController`へ変換する
2. `query(xpath)`で必要なノードを探す
3. 見つかった`XmlNode`からテキストや属性を取り出す
4. 最後に`dispose()`でDOMを破棄する

```ts
const html = `<html>
  <body>
    <h1>Trace Kernel</h1>
    <a href="/download/">Download</a>
  </body>
</html>`;

const dom = await $parser.html(html);

const links = await dom.query('//a');
for (const link of links) {
  const text = await link.text();
  const href = await link.attr('href');
  $println(`${text}: ${href ?? ''}`);
}

await dom.dispose();
```

`text()`や`attr()`は非同期メソッドです。呼び出すときは`await`します。

## XMLとHTMLの違い

`$parser.xml()`はXMLとして厳密に解析します。タグの閉じ忘れなど、XMLとして不正な文字列はエラーになります。

```ts
const xml = `<users>
  <user id="001">taro</user>
  <user id="002">jiro</user>
</users>`;

const dom = await $parser.xml(xml);
```

`$parser.html()`はHTMLとして解析します。Webページや保存済みHTMLから、リンク、見出し、表などを取り出す用途に向いています。

```ts
const dom = await $parser.html($resource.pageHtml);
```

## XPathの最小パターン

`query()`にはXPath文字列を渡します。Trace KernelのDOM APIは、基本的な抽出に必要な範囲のXPathをサポートしています。

| XPath | 意味 |
| --- | --- |
| `//a` | 文書全体から`a`要素をすべて探します。 |
| `/html/body/h1` | ルートから順に`html`、`body`、`h1`をたどります。 |
| `//*` | 文書全体からすべての要素を探します。 |
| `//a[@href]` | `href`属性を持つ`a`要素を探します。 |
| `//div[@class="item"]` | `class`属性が`item`の`div`要素を探します。 |

対応している主な構文は次の通りです。

- `/` による子要素の指定
- `//` による子孫要素の指定
- 要素名による検索
- `*` による任意要素の検索
- `[@name]` による属性の存在チェック
- `[@name="value"]` による属性値の一致チェック

複雑なXPath関数、テキスト条件、数値条件、名前空間を使った検索などは、現時点では対象外です。

## DomController

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `root()` | `Promise<XmlNode \| null>` | ルートノードを取得します。 |
| `query(xpath)` | `Promise<XmlNode[]>` | XPathでノードを検索します。 |
| `debug()` | `Promise<{ domId: number; nodeCount: number }>` | DOM内部情報を取得します。 |
| `dispose()` | `Promise<void>` | DOMを破棄します。 |

`query()`は文書全体を起点に検索します。XML/HTMLの中から目的の要素を直接取り出したい場合は、まず`dom.query('//tagName')`を使うのが基本です。

`root()`はルート要素を取得します。ルート要素から順に子要素をたどりたい場合に使います。

```ts
const root = await dom.root();

if (root) {
  $println(await root.name() ?? '');
}
```

`debug()`は、DOM内部のIDとノード数を確認するための補助機能です。通常の解析処理では必須ではありません。

`dispose()`は、Rust側に保持されているDOMを破棄します。DOMを使い終わったら呼び出してください。

## XmlNode

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `name()` | `Promise<string \| null>` | ノード名を取得します。 |
| `text()` | `Promise<string>` | テキストを取得します。 |
| `attr(name)` | `Promise<string \| null>` | 属性値を取得します。 |
| `children()` | `Promise<XmlNode[]>` | 子ノードを取得します。 |
| `parent()` | `Promise<XmlNode \| null>` | 親ノードを取得します。 |
| `query(xpath)` | `Promise<XmlNode[]>` | 対象ノード配下をXPathで検索します。 |

`XmlNode`は、検索で見つかった要素やテキストを表します。

よく使うのは、要素内の文字列を取得する`text()`と、属性値を取得する`attr(name)`です。

```ts
const links = await dom.query('//a[@href]');

for (const link of links) {
  const label = await link.text();
  const href = await link.attr('href');
  $println(`${label}: ${href ?? ''}`);
}
```

`children()`と`parent()`を使うと、XPathではなくツリー構造として前後のノードをたどれます。

```ts
const sections = await dom.query('//section');

for (const section of sections) {
  const children = await section.children();
  $println(`children: ${children.length}`);
}
```

`node.query(xpath)`は、そのノード配下を起点に検索します。たとえば、各`article`の中にあるタイトルだけを取り出す場合に使えます。

```ts
const articles = await dom.query('//article');

for (const article of articles) {
  const titles = await article.query('h2');
  const title = titles[0] ? await titles[0].text() : '';
  $println(title);
}
```

## HTMLからリンクを抽出する例

```ts
const dom = await $parser.html($resource.pageHtml);

const links = await dom.query('//a');
for (const link of links) {
  const href = await link.attr('href');
  const text = await link.text();
  $println(`${text}: ${href ?? ''}`);
}

await dom.dispose();
```

## XMLから属性とテキストを抽出する例

```ts
const xml = `<users>
  <user id="001" role="admin">taro</user>
  <user id="002" role="member">jiro</user>
</users>`;

const dom = await $parser.xml(xml);

const users = await dom.query('//user[@role="admin"]');
for (const user of users) {
  const id = await user.attr('id');
  const name = await user.text();
  $println(`${id}: ${name}`);
}

await dom.dispose();
```

## 注意点

- `DomController`と`XmlNode`のメソッドは非同期です。基本的に`await`して使います。
- `text()`は対象ノード配下のテキストを結合して返します。
- `attr(name)`は、属性がない場合に`null`を返します。
- `query()`で見つからない場合は空配列を返します。
- 文書全体に対する`query()`は、`/`または`//`から始めます。
- ノード配下に対する`node.query()`では、`h2`のように相対的な指定もできます。
- DOMはRust側に保持されるため、使い終わったら`dispose()`を呼び出してください。

<div class="image-memo">
  <strong>画像メモ:</strong> HTML文字列をresourceに登録し、<code>$parser.html()</code>でタイトルやリンクを抽出してテーブル出力する流れのGIFがあるとよいです。DOMツリーそのものより、「HTMLから必要な情報を取り出す」用途が伝わるものが向いています。
</div>
