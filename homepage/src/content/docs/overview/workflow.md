---
title: 基本ワークフロー
description: Trace Kernelでワークスペースを開き、contextを登録し、workを実行して結果を確認するまでの流れ。
---

Trace Kernelの基本ワークフローは、ワークスペースに入力や設定を登録し、workにTypeScriptを書いて、その場で実行結果を確認する流れです。

```text
1. ワークスペースを開く
2. contextを登録する
3. workを追加する
4. プログラムを書く
5. 実行して結果を確認する
```

![Trace Kernelの基本ワークフロー](/images/workflow-overview-v2.svg)

## 1. ワークスペースを開く

ワークスペースは、Trace Kernelで扱う作業状態です。開始時は、空白のワークスペースから始めるか、保存済みの`.trk`ファイルを開いて再開します。

ワークスペースには、プログラムだけでなく、そのプログラムが使う入力、固定値、対象ファイル群も含まれます。一度きりの解析やリネーム前の確認のような作業では、保存せずに閉じても構いません。

```text
workspace
├── context
└── work
```

![スタート画面](/screen_shot/スタート.JPG)

ワークスペースを開くと、ワークスペース管理画面に移動します。ここで、プログラムから使う情報を`context`として登録し、実行するTypeScriptを`work`として作成します。

![ワークスペース管理画面](/screen_shot/ワークスペース管理.JPG)

ワークスペースの考え方や保存の扱いは、[ワークスペース](/core/workspace/)で詳しく説明しています。

## 2. contextを登録する

contextは、workから参照できる入力や設定です。Trace Kernelでは、CSV、ログ、テキスト、対象ファイル群、固定値などをGUI上で登録します。

| context | 例 |
| --- | --- |
| `env` | 出力先ディレクトリ、API URL、固定値 |
| `resource` | CSV、JSON、ログ、テキスト |
| `dataset` | 指定ディレクトリ配下のファイル群 |

登録したcontextは、workの中で`$env`、`$resource`、`$dataset`のように参照できます。GUIで登録した名前やCSVの列名は、Monacoエディタの補完候補にも反映されます。

![resourceを登録する画面](/screen_shot/コンテキスト定義.JPG)

## 3. workを追加する

workは、実際に実行するTypeScriptプログラムです。ワークスペース上にworkを追加し、登録済みのcontextを使って処理を書きます。

ひとつのワークスペースには複数のworkを持たせることができます。作業を段階ごとに分けたい場合や、同じ入力に対して別の処理を試したい場合は、workを分けて管理します。

![workを追加する画面](/screen_shot/work追加時.JPG)

workの設定や出力方式は、[work](/core/work/)で詳しく扱います。

## 4. プログラムを書く

ワークスペース管理画面でworkを選択し、右側のパネルに表示される`Open Editor`ボタンを押すことでエディタを開くことができます。ショートカットとして、workのエントリを右クリックして起動することもできます。

ここにTypeScriptを記述できます。workのエディタでは、ワークスペースに登録したcontextと、Trace Kernelが提供するAPIを参照できます。

![プログラムエディタ表示時](/screen_shot/プログラムエディタ表示時.JPG)

たとえば、resourceとして登録したCSVは`$resource.userData`のように補完されます。入力ファイルを読み込むためのコードを書く前に、処理そのものを書き始められます。

![補完参照](/screen_shot/補完参照.JPG)

```ts
for (const user of $resource.userData) {
  $println(`${user.user_id}: ${user.name}`);
}
```

## 5. 実行して結果を確認する

エディタの`Run`ボタンを押すことで、現在のworkを実行できます。ショートカットとして、`F5`キーまたは`Alt + Enter`キーでも実行できます。

workを実行すると、結果はTrace Kernel内の出力領域に表示されます。

単純なテキストで確認したい場合は`$print`や`$println`を使います。複数の出力を切り替えたい場合は`$channel`、表形式で確認したい場合はテーブル出力、進捗を表示したい場合は`$state`を使います。

![プログラム実行時の出力結果](/screen_shot/プログラム実行時（出力結果）.JPG)

表示した結果は、必要に応じてコピーして外部のドキュメント、チャット、表計算ソフトなどに貼り付けられます。ただし、基本フローとしては「実行して結果を確認する」までで完結します。

実行結果を次の入力として登録し、別のworkにつなげる考え方は、[work](/core/work/)で説明しています。

## 次に読むページ

workの概念や出力方式を確認する場合は、[work](/core/work/)を読んでください。contextの種類を確認する場合は、[Context概要](/context/)から読み進めてください。プログラムから使えるAPIを確認する場合は、[API概要](/reference/api-overview/)が入口になります。
