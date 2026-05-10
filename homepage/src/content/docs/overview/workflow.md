---
title: 基本ワークフロー
description: Trace Kernelでワークスペースを作成し、contextを登録し、workを実行するまでの流れ。
---

Trace Kernelの基本ワークフローは、ワークスペースを開き、contextを登録し、workを書いて実行し、結果を確認する流れです。

```text
1. 空白のワークスペースを開く、または保存済みの.trkファイルを開く
2. contextを登録する
3. workにTypeScriptを書く
4. 実行して結果を見る
5. 必要な結果をコピーして使う
```

> **画像メモ:** このページの先頭には、上記5ステップを1本で見せる短いGIFがあるとよい。画面の詳細説明ではなく、Trace Kernelの作業導線を俯瞰できるもの。

## 1. ワークスペースを作る

ワークスペースは、Trace Kernelで扱う作業状態です。開始時は、空白のワークスペースから始めるか、保存済みの`.trk`ファイルを開いて再開します。

ワークスペースには、実行するプログラムだけでなく、そのプログラムが使う入力、値、対象ファイルも含まれます。一度きりの解析のような作業では、保存せずに閉じても構いません。

```text
workspace
├── context
└── work
```

同じ作業を後で再利用したい場合は、ワークスペースを`.trk`ファイルとして保存できます。

![スタート画面](/screen_shot/スタート.JPG)

## 2. contextを登録する

contextは、workから参照できる外部情報です。

たとえば、処理対象のディレクトリ、読み込ませたいCSV、対象ファイル群、外部コマンド、再利用する処理などを、ワークスペース上で登録します。

| context | 例 |
| --- | --- |
| `env` | 出力先ディレクトリ、API URL、固定値 |
| `resource` | CSV、JSON、ログ、テキスト |
| `dataset` | 指定ディレクトリ配下のファイル群 |

登録したcontextは、workの中で`$env`、`$resource`、`$dataset`のように参照します。たとえばGUIで登録したCSVの名前や列は、プログラムを書くときの補完候補としても使われます。

```ts
const outputDir = $env.OUTPUT_DIR;

for (const row of $resource.users) {
  $println(`${row.id}: ${row.name}`);
}
```

> **画像メモ:** resourceにCSVを登録し、その名前と列名がエディタ補完に出るところまでを見せるGIFがあるとよい。Trace Kernelでは「GUIで登録したリソースが、そのままコード補完に現れる」という点が最重要。

## 3. workを書く

workは、実際に実行するTypeScriptプログラムです。

Trace Kernelのエディタでは、ワークスペースに登録したcontextと、Trace Kernelが提供する独自APIを参照できます。

```ts
for (const file of $dataset.workspace) {
  const content = await file.content();

  if (content.includes('TODO')) {
    $println(file.relativePath);
  }
}
```

このコードでは、`$dataset.workspace`として登録されたファイル群を走査し、`TODO`を含むファイルを出力しています。

![プログラムエディタ](/screen_shot/プログラムエディタ表示時.JPG)

## 4. 実行して結果を見る

workを実行すると、結果はTrace Kernel内の出力領域に表示されます。

単純なテキストで確認したい場合は`$print`や`$println`を使います。複数の出力を切り替えたい場合は`$channel`、表形式で確認したい場合はテーブル出力、進捗を表示したい場合は`$state`を使います。

```ts
const progress = $state.useProgress({ max: $dataset.workspace.length });

for (const file of $dataset.workspace) {
  const content = await file.content();
  $println(`${file.relativePath}: ${content.length}`);
  progress.increment();
}
```

> **画像メモ:** 実行中にプログレスバーが進み、完了後に出力パネルへ結果が表示されるGIFがあるとよい。処理の開始、途中経過、結果確認が同じアプリ内で完結することを見せる。

## 5. 結果をコピーして使う

標準機能では、実行結果をTrace Kernel内で確認し、必要なテキストや表をコピーして利用します。

ログ解析、CSV集計、HTMLからの抽出、Excelの内容確認のような作業では、画面に出した結果をそのままメモ、チャット、表計算ソフト、別のドキュメントへ貼り付けるだけで成果物になります。

```ts
$println('id,name,count');

for (const row of $resource.summary) {
  $println(`${row.id},${row.name},${row.count}`);
}
```

> **画像メモ:** CSVを登録し、集計結果をテーブルまたはテキストで表示し、出力結果を選択してコピーするGIFがあるとよい。無料版だけで業務上の成果物を作れることを伝える。

## 次に読むページ

各context要素の詳細は、今後のFeaturesセクションで扱います。APIの使い方を確認する場合は、[API概要](/reference/api-overview/)から読み進めてください。
