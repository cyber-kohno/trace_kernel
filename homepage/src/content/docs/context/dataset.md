---
title: dataset
description: 処理対象にするファイル群を定義する。
---

`dataset`は、PC内のファイルを相対パスの集合として管理し、workから遅延ロードするためのcontextです。

大量のログ解析、プロジェクト内のファイル調査、対象ファイルの抽出などに使います。

![dataset追加時](/screen_shot/dataset追加時.JPG)

## 設定項目

| 項目 | 説明 |
| --- | --- |
| `variable_name` | workから参照する変数名です。 |
| `root_path` | ファイル群のルートパスです。 |
| `encoding` | ファイルを開く際のエンコードです。`utf8`または`sjis`を指定します。 |
| `scan_phase` | ファイルをスキャンするタイミングです。 |

## scan_phase

| 選択肢 | 説明 |
| --- | --- |
| `Runtime auto` | プログラム実行時に自動でルート配下をスキャンします。フォルダの最新状態が毎回反映されます。 |
| `Direct choose` | GUI上で事前にファイルを手動選択します。実行時の前処理を減らせます。 |

## フィルター条件

スキャン対象をフィルタリングする条件を設定できます。

![抽出対象パネル](/screen_shot/抽出対象パネル.JPG)

| 条件項目 | 説明 |
| --- | --- |
| `limit_depth` | スキャンする最大階層数です。未指定も可能です。 |
| `directory_filter_conditions` | ディレクトリの抽出条件です。階層指定とワイルドカードに対応します。 |
| `file_filter_conditions` | ファイルの抽出条件です。全階層を対象にワイルドカードで指定します。 |

![ディレクトリ条件追加時](/screen_shot/ディレクトリ条件追加時.JPG)
![ファイル条件追加時](/screen_shot/ファイル条件追加時.JPG)

フィルター条件では、包含/除外の切り替え、階層指定、ワイルドカード指定を組み合わせられます。

```text
ディレクトリ条件
  1階層目: .gitを除外
  1階層目: entity*を除外
  2階層目: srcのみ対象

ファイル条件
  *Impl.javaを対象
  *Abstract*を除外
```

## Direct chooseの操作フロー

Direct chooseでは、GUI上で対象ファイルを選んで確定します。

1. Scanボタンでルート配下を走査します。

![Scanボタン表示](/screen_shot/Scanボタン表示.JPG)
![スキャン実行時](/screen_shot/スキャン実行時.JPG)
![ファイル選択（ツリー表示）](/screen_shot/ファイル選択（ツリー表示）.JPG)

2. FILEをクリックすると個別ファイルを選択できます。
3. DIRをクリックすると、そのディレクトリ配下の全ファイルを選択できます。

![ファイル選択（フォルダを展開）](/screen_shot/ファイル選択（フォルダを展開）.JPG)
![ファイル選択（選択状態の色分け）](/screen_shot/ファイル選択（選択状態の色分け）.JPG)

4. Flatボタンで、選択中のファイルを一覧表示できます。

![ファイル選択（フラット表示）](/screen_shot/ファイル選択（フラット表示）.JPG)

5. Transferボタンで選択したファイルを確定します。

![Transfer押下後（リストアップ）](/screen_shot/Transfer押下後（リストアップ）.JPG)

## コード例

```ts
for (const file of $dataset.workspace) {
  file.fileName;
  file.absolutePath;
  file.relativePath;

  const content = await file.content();
  $println(`${file.relativePath}: ${content.length}`);
}
```

## scan_phaseの使い分け

| ユースケース | 推奨 |
| --- | --- |
| フォルダにファイルを入れる都度、最新状態を反映したい | `Runtime auto` |
| 解析対象が固定で、実行速度を重視したい | `Direct choose` |
