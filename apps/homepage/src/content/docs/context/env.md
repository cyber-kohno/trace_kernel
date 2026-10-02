---
title: env
description: パスや固定値をworkから参照する。
---

`env`は、変数名と値のペアを登録し、workから参照するためのcontextです。

パス、URL、固定文字列、処理条件など、プログラムに直接書き込みたくない値をGUI側で管理できます。

たとえば、ファイル出力先のディレクトリをプログラムに直書きせず、`env`として定義しておくと、Windowsパスの`\`のエスケープミスを避けやすくなります。環境ごとにパスが変わる場合も、プログラムを開かずにGUI上の値だけを変更できます。

```ts
const outputDir = $env.OUTPUT_DIR;
$println(outputDir);
```

![env追加時](/screen_shot/env追加時.JPG)

## 設定項目

| 項目 | 説明 |
| --- | --- |
| `name` | 変数名。大文字のみ許容されます。 |
| `value` | 値です。 |
| `purpose` | 用途です。未指定のほか、`Directory path`または`File path`を選択できます。 |

`purpose`でパス種別を指定すると、入力したパスの妥当性がリアルタイムでチェックされます。これは補助的なUIフィードバックであり、パスが不正でもenv要素自体が必ず`error`になるわけではありません。

## コード例

```ts
const fileName = 'report.txt';
const outputPath = `${$env.DEST_DIR}\\${fileName}`;

$println(outputPath);
```

## 他contextからの参照

他のcontext要素でパスを設定する際、`%`で囲うことでenvの値を参照できます。

```text
%WORKSPACE%\testApp\src\
```

パスの基点や出力先をenvに寄せておくと、work側のコードを変えずに対象を切り替えられます。
