---
title: 用語と全体像
description: Trace Kernelで使う主要な用語と、それぞれの関係。
---

Trace Kernelには、通常の開発環境とは異なる用語があります。

このページでは、最初に押さえておくべき用語と、それぞれの関係を整理します。詳細な仕様は各機能ページとAPIリファレンスで扱います。

## 全体像

```text
Trace Kernel
└── workspace
    ├── context
    │   ├── env
    │   ├── resource
    │   └── dataset
    ├── work
    └── API
        ├── $print / $println
        ├── $channel
        ├── $state
        ├── $parser
        └── $runtime
```

> **画像メモ:** 上記のツリーを、アプリ画面のどこに対応するか分かる形の図にしたい。左にワークスペース管理画面、右にエディタ上で参照・補完できる`$env`や`$resource`を置く構成がよさそう。

## workspace

workspaceは、Trace Kernelで扱う作業状態です。

context、work、設定をアプリ上でまとめて保持します。保存は必須ではありません。後で再利用したい作業だけ、`.trk`ファイルとして保存できます。

通常の開発環境におけるプロジェクトに近い位置づけですが、目的はアプリケーション開発ではなく、特定の作業をアプリ上でまとめて扱うことです。

## context

contextは、workから参照できる外部情報のまとまりです。

workのコードは、contextに登録された値や入力を`$env`、`$resource`、`$dataset`などの形で参照します。登録内容はエディタ補完にも反映されます。

```ts
$env.OUTPUT_DIR
$resource.users
$dataset.sourceFiles
```

## env

envは、パス、URL、固定値などの環境値を定義する要素です。

たとえば、出力先ディレクトリを`OUTPUT_DIR`として登録しておくと、work内で`$env.OUTPUT_DIR`として参照できます。

```ts
const dest = `${$env.OUTPUT_DIR}\\result.txt`;
```

## resource

resourceは、作業中で再利用する入力データを登録する要素です。

CSV、JSON、ログ、テキストなどを登録し、必要に応じてパースした状態でworkから参照します。

```ts
for (const user of $resource.users) {
  $println(user.name);
}
```

## dataset

datasetは、処理対象にするファイル群を定義する要素です。

ルートディレクトリや条件を指定し、workから対象ファイルを走査します。ファイル内容は必要なタイミングで読み込めます。

```ts
for (const file of $dataset.workspace) {
  const text = await file.content();
  $println(file.relativePath);
}
```

## work / program

workは、実際に実行するTypeScriptプログラムです。

登録済みのcontextと、Trace Kernelが提供する独自APIを使って処理を書きます。

```ts
const progress = $state.useProgress({ max: $dataset.workspace.length });

for (const file of $dataset.workspace) {
  const text = await file.content();
  $println(`${file.relativePath}: ${text.length}`);
  progress.increment();
}
```

## API

APIは、Trace Kernelがworkへ提供する機能群です。

出力、進捗表示、パース、ネットワークアクセス、実行制御などを扱います。

| API | 役割 |
| --- | --- |
| `$print` / `$println` | テキストを出力する |
| `$channel` | 複数の出力ストリームを扱う |
| `$state` | 進捗やモニター表示を更新する |
| `$parser` | Excel、XML、HTMLなどをパースする |
| `$runtime` | 実行制御やランタイム情報を扱う |
