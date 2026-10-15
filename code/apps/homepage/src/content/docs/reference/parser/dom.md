---
title: DomController / DomNode
description: XML や HTML を DOM として扱うための API リファレンス
---

`$parser.xml()` と `$parser.html()` は、文字列を DOM として解析し、XPath でノードを検索できる `DomController` を返します。

Trace Kernel では、まず `$parser.xml()` または `$parser.html()` で文字列を `DomController` に変換し、`query()` で必要なノードを探します。見つかったノードは `DomNode` として扱い、`text()` や `attr()` で値を取り出します。

```ts
const dom = await $parser.html($resource.pageHtml);

const titles = await dom.query('//title');
for (const title of titles) {
  $println(await title.text());
}

await dom.dispose();
```

## 基本の流れ

DOM 解析は、次の流れで使います。

1. 文字列を `DomController` へ変換する
2. `query(xpath)` で必要なノードを検索する
3. 見つかった `DomNode` からテキストや属性を取り出す
4. 最後に `dispose()` で DOM を解放する

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

`text()` や `attr()` は非同期メソッドなので、呼び出すときは `await` します。

## XML と HTML の違い

`$parser.xml()` は XML として厳密に解析します。タグの閉じ忘れなど、XML として不正な文字列はエラーになります。

```ts
const xml = `<users>
  <user id="001">taro</user>
  <user id="002">jiro</user>
</users>`;

const dom = await $parser.xml(xml);
```

`$parser.html()` は HTML として解析します。Web ページや保存済み HTML から、リンク、見出し、表などを取り出す用途に向いています。

```ts
const dom = await $parser.html($resource.pageHtml);
```

## XPath の最小パターン

`query()` には XPath 文字列を渡します。Trace Kernel の DOM API は、実務で使いやすい範囲の XPath を想定しています。

| XPath | 意味 |
| --- | --- |
| `//a` | すべての `a` 要素を検索します。 |
| `/html/body/h1` | ルートから `html` → `body` → `h1` をたどります。 |
| `//*` | すべての要素を検索します。 |
| `//a[@href]` | `href` 属性を持つ `a` 要素を検索します。 |
| `//div[@class="item"]` | `class` 属性が `item` の `div` 要素を検索します。 |

## DomController

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `root()` | `Promise<DomNode \| null>` | ルートノードを取得します。 |
| `query(xpath)` | `Promise<DomNode[]>` | XPath でノードを検索します。 |
| `debug()` | `Promise<{ domId: number; nodeCount: number }>` | DOM の内部情報を取得します。 |
| `dispose()` | `Promise<void>` | DOM を解放します。 |

`query()` は DOM 全体を対象に検索します。

```ts
const root = await dom.root();

if (root) {
  $println((await root.name()) ?? '');
}
```

## DomNode

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `name()` | `Promise<string \| null>` | ノード名を取得します。 |
| `text()` | `Promise<string>` | テキストを取得します。 |
| `attr(name)` | `Promise<string \| null>` | 属性値を取得します。 |
| `children()` | `Promise<DomNode[]>` | 子ノードを取得します。 |
| `parent()` | `Promise<DomNode \| null>` | 親ノードを取得します。 |
| `query(xpath)` | `Promise<DomNode[]>` | 対象ノード配下を XPath で検索します。 |

`DomNode` は、検索で見つかった要素やテキストを表します。

```ts
const links = await dom.query('//a[@href]');

for (const link of links) {
  const label = await link.text();
  const href = await link.attr('href');
  $println(`${label}: ${href ?? ''}`);
}
```

`children()` と `parent()` を使うと、XPath だけではなくツリー探索としてノードをたどれます。

```ts
const sections = await dom.query('//section');

for (const section of sections) {
  const children = await section.children();
  $println(`children: ${children.length}`);
}
```

`node.query(xpath)` は、そのノード配下だけを対象に検索します。

```ts
const articles = await dom.query('//article');

for (const article of articles) {
  const titles = await article.query('h2');
  const title = titles[0] ? await titles[0].text() : '';
  $println(title);
}
```

## 例

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

## 注意点

- `DomController` と `DomNode` のメソッドは非同期です。基本的に `await` して使います。
- `attr(name)` は、属性がない場合に `null` を返します。
- 使い終わった DOM は `dispose()` を呼んで解放してください。
