---
title: $fs
description: ファイルシステム操作API。
---

`$fs` は、ファイルシステムへの読み書きを行うAPIです。

## 直接操作

```ts
const exists = await $fs.exists(`${$env.DIR}\\input.txt`);
const text = await $fs.readText(`${$env.DIR}\\input.txt`, 'utf8');
await $fs.saveText(`${$env.DIR}\\output.txt`, text);
```

## トランザクション操作

```ts
const tx = $fs.useTransaction();
const { token, content } = await tx.openText(`${$env.DIR}\\input.txt`, 'utf8');
tx.updateText(token, content.trim());
```

## 今後ソースから確認する主な対象

- 直接操作API一覧
- トランザクションAPI一覧
- パス制約
- VFS検証仕様
- verify時の実FS検証仕様
