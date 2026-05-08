---
title: 基本ワークフロー
description: Trace Kernelで作業を始めて、結果を確認するまで。
---

Trace Kernelの基本ワークフローは、次の流れです。

1. ワークスペースを作る、または `.trk` ファイルを開く
2. env / resource / dataset / process でコンテキストを定義する
3. workにTypeScriptを書く
4. 実行して結果を見る
5. 必要に応じてトランザクションでファイル変更を確認、コミットする

![スタート画面](/screen_shot/スタート.JPG)

## ワークスペース

ワークスペースは、コンテキストとプログラムをまとめて保持する作業単位です。

```text
workspace
├── context
│   ├── env
│   ├── resource
│   ├── dataset
│   └── process
└── program
    └── work
```

## スクリプト実行

workのソースはMonacoエディタで編集します。ワークスペースに登録したコンテキストは、エディタ補完と実行時オブジェクトに注入されます。

```ts
for (const file of $dataset.workspace) {
  const content = await file.content();
  if (content.includes('TODO')) {
    $println(file.relativePath);
  }
}
```

![プログラムエディタ](/screen_shot/プログラムエディタ表示時.JPG)
