---
title: コンテキスト
description: env / resource / dataset / processの概要。
---

コンテキストは、workのプログラムに注入される外部情報です。

```ts
$env.DEST_DIR
$resource.userData
$dataset.workspace
$process.myTool()
```

## env

値やパスを変数として管理します。

```ts
const outputPath = `${$env.DEST_DIR}\\result.txt`;
```

![env追加時](/screen_shot/env追加時.JPG)

## resource

CSV、TSV、ログなどの静的テキストをワークスペース上で管理します。

```ts
for (const user of $resource.userData) {
  $println(user.name);
}
```

![resource追加時](/screen_shot/resource追加時.JPG)

## dataset

ルート配下のファイル群を対象にし、プログラムから遅延ロードします。

```ts
for (const file of $dataset.workspace) {
  const content = await file.content();
  $println(`${file.relativePath}: ${content.length}`);
}
```

![dataset追加時](/screen_shot/dataset追加時.JPG)

## process

外部プログラムをスクリプトから関数として呼び出します。

```ts
const { stdout, stderr } = await $process.hello('taro');
$println(stdout);
```

![process追加時](/screen_shot/process追加時.JPG)
