---
title: ファイル一括処理
description: datasetと$fsトランザクションを組み合わせる例。
---

このページは、実践レシピの見え方を確認するための仮ページです。

## やりたいこと

datasetで対象ファイルを列挙し、条件に合うファイルだけを書き換えます。

## 例

```ts
const tx = $fs.useTransaction();
const { tick } = $state.useProgress($dataset.workspace.length);

for (const file of $dataset.workspace) {
  const { token, content } = await tx.openText(file.absolutePath, 'utf8');

  if (content.includes('oldName')) {
    tx.updateText(token, content.replaceAll('oldName', 'newName'));
  }

  tick();
}
```

実行後、トランザクションダイアログで変更内容を確認してからコミットします。

![書き込み内容確認](/screen_shot/書き込み内容確認.JPG)
