---
title: トランザクション
description: 仮想FSに操作を積み、確認してから実FSへ反映する。
---

Trace Kernelのトランザクションは、ファイル変更を直接実行せず、仮想FS上に操作を積んでから確認する仕組みです。

```ts
const tx = $fs.useTransaction();

const { token, content } = await tx.openText(`${$env.DIR}\\target.txt`, 'utf8');
tx.updateText(token, content.replaceAll('old', 'new'));
```

![トランザクションダイアログ](/screen_shot/トランザクションダイアログ.JPG)

## 基本フェーズ

| フェーズ | 説明 |
| --- | --- |
| confirm | 変更内容を目視確認する |
| verify | 実FS上で変更可能か検証する |
| commit | 実FSへ変更を反映する |

## 解決する問題

- 実装ミスで意図しないファイルが変更される
- 途中で失敗して中途半端な変更が残る
- 大量変更の内容を実行前に確認できない

![更新内容確認](/screen_shot/更新内容確認.JPG)
