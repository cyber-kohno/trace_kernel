---
title: process
description: 外部プログラムをworkから呼び出すcontext。
---

`process`は、外部プログラムをTrace Kernelのworkから関数として呼び出すためのcontextです。

ワークスペースで登録したprocessは、work内で`$process.name()`の形で参照できます。

![process追加時](/screen_shot/process追加時.JPG)

## 設定項目

| 項目 | 説明 |
| --- | --- |
| `function_name` | workから呼び出す関数名です。 |
| `program_path` | 実行する外部プログラムのフルパスです。 |
| `script_argument_defs` | work側から渡す引数の定義です。 |
| `command_argument_values` | 外部プログラムに渡すコマンドライン引数です。 |
| `timeout_millisecond` | タイムアウト時間です。超過するとランタイムエラーになります。 |
| `response_encoding` | stdout / stderrのエンコードです。`utf8`、`sjis`などを指定します。 |

## 引数リスト

引数はUI上で追加・削除できます。

- 見出し横の`+`ボタンで引数を追加します。
- 各行の左端にある`-`ボタンで削除します。
- スクリプト引数では、NumberトグルをONにするとTypeScript側で`number`として扱われます。
- NumberトグルがOFFの場合は`string`として扱われます。

## スクリプト引数とコマンドライン引数

スクリプト引数は、`__変数名__`形式でコマンドライン引数へ埋め込めます。

スクリプト引数を定義しただけでは、外部プログラムの実行引数には反映されません。`command_argument_values`側で参照して初めて、実行時のコマンドラインに渡されます。

## コード例

![プロセス設定例](/screen_shot/プロセス設定例.JPG)

```ts
const { stdout, stderr } = await $process.hello('taro');

if (stderr) {
  $println(stderr);
}

$println(stdout);
```

## 実用例

- 複数のjarファイルを解凍する外部ツールを呼び出す
- classファイルを逆コンパイルし、脆弱性ライブラリを検索する
- nodeで実行するJSスクリプトに動的な引数を渡す
- 既存の社内CLIをTrace Kernelの作業フローに組み込む
