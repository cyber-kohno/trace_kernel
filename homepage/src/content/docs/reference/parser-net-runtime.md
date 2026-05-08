---
title: $parser / $net / $runtime
description: パース、ネットワーク、実行制御に関するAPI。
---

このページは、今後ソースから仕様を抽出するための仮ページです。

## $parser

Excel、XML、CSV、TSVなどを扱うためのAPI群です。

```ts
const book = await $parser.excel(buffer);
```

## $net

HTML取得や外部API呼び出しに関するAPIです。

```ts
const html = await $net.getHtml('https://example.com');
```

## $runtime

実行制御に関するAPIです。

```ts
await $runtime.sleep(1000);
```

## 今後ソースから確認する主な対象

- `dcl-parser.ts`
- `dcl-net.ts`
- `dcl-runtime.ts`
- Rust側のparser / scraper実装
