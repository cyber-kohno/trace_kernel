---
title: work
description: ワークスペースに登録する実行単位としてのworkと、出力方式、作業のつなげ方。
---

`work`は、Trace Kernelで実際に実行するTypeScriptプログラムです。

ワークスペースには、入力や設定を表す`context`と、処理本体を表す`work`を登録します。`work`はコンテキストではありませんが、ワークスペースに生える実行単位として、contextと並んで管理されます。

```text
workspace
├── context
│   ├── env
│   ├── resource
│   └── dataset
└── work
```

1つのworkは、1つのプログラムとして扱います。通常のTypeScriptプロジェクトのようなファイル分割、import/export、ビルド設定はありません。複数のworkを作る場合も、それぞれは独立しており、必要に応じて手動で順に実行します。

workのプログラムでは、`$`で始まるAPIと、ワークスペースに登録したcontextを参照できます。たとえば、`$print`や`$println`はTrace KernelのGUI上の出力パネルへ文字列を出力するAPIです。これは、通常の開発環境でターミナルへ出力する`console.log`とは役割が異なります。

利用できるAPIやcontextは、そのworkの設定とワークスペースの状態によって決まります。

## workの設定

![work追加時](/screen_shot/work追加時.JPG)

| 項目 | 説明 |
| --- | --- |
| `name` | ワーク名。識別用の名前で、他のworkから自動参照されるものではありません。 |
| `output_method` | 出力方式。`Plain`または`Channel`を選びます。 |
| `api_injections` | 利用できる独自APIの一覧です。 |
| `context_injections` | workから参照できるcontextの一覧です。`error`状態のcontextは表示されません。 |

`api_injections`と`context_injections`は、そのworkのプログラムから何を参照できるかを表します。GUIで登録したcontextや、Trace Kernelが提供するAPIは、エディタ上の補完候補にも反映されます。

## output_method

`output_method`は、そのworkでどの出力方式を使うかを決める設定です。

| output_method | 使えるAPI | 用途 |
| --- | --- | --- |
| `Plain` | `$print` / `$println` | シンプルなテキスト出力 |
| `Channel` | `$channel` | 複数ストリーム、テーブル出力 |

最初は`Plain`で十分です。文字列を出力して結果を確認するだけなら、`$print`や`$println`で扱えます。

複数の出力を切り替えたい場合や、表形式で結果を確認したい場合は`Channel`を使います。`Channel`を選ぶと、チャンネルごとに出力を分けたり、テーブル形式で結果を表示したりできます。

`Channel`で使うAPIの詳細は、[$channel](/reference/channel/)を参照してください。

## 実行結果を次の作業につなげる

workは、単独で完結する処理として使うだけではありません。実行結果を確認し、その結果を次の入力として登録し直すことで、作業を段階的につなげられます。

```text
work Aを実行する
↓
結果を確認する
↓
必要な結果をresourceとして登録する
↓
work Bでそのresourceを参照して処理する
↓
さらに結果を確認する
```

たとえば、大量のログから必要な行だけを抽出し、その結果をresourceとして登録して、別のworkで集計や整形を行うことができます。

作業をフェーズごとに分ける場合は、次のように複数のworkを使います。

```text
work 1: データを収集し、出力結果を中間データとしてresourceに登録する
work 2: 中間データを解析・整形し、必要な結果を確認する
work 3: 最終的な成果物を作る
```

この流れを使うと、ひとつの大きな処理を無理に書き切るのではなく、確認しながら小さな処理に分けて進められます。Trace Kernelにおけるworkは、単なるスクリプト置き場ではなく、入力、確認、次の入力定義を循環させるための作業単位です。

> **画像メモ:** work Aの出力をコピーし、resourceとして再登録し、work Bの補完候補に出てくるところまでを見せるGIFがあるとよい。Trace Kernelでは「結果確認」と「次の入力定義」を循環させられることを伝える。

## 次に読むページ

workにプログラムを書く操作は、[プログラムを書く](/core/program/)で扱います。workから参照できる入力や設定は、[Context概要](/context/)から確認してください。
