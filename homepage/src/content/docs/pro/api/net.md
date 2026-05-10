---
title: $net
description: Webスクレイピングや外部API呼び出しを行うAPI。
---

`$net`は、Webページの取得や外部APIの呼び出しを行うAPIです。

Webスクレイピング、HTML取得、HTTPリクエストなど、Trace Kernelの外側にあるネットワーク資源へアクセスする処理を扱います。

```ts
const html = await $net.getHtml('https://example.com');
```

## 今後整理する仕様

- HTML取得
- HTTPリクエスト
- レート制御
- エラー処理
- 外部API呼び出し
