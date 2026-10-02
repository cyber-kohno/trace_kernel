---
title: process
description: 外部プログラムをworkから呼び出すcontext。
---

`process`は、外部プログラムをTrace Kernelのworkから関数として呼び出すためのcontextです。

ワークスペースで登録したprocessは、work内で`$process.name()`の形で参照できます。

contextの基本的な考え方は、[Context概要](/context/)を参照してください。

processは、Trace Kernelのプログラムと外部プログラムの間を橋渡しします。関数名と実行するプログラムのパスを設定しておくことで、workからは`$process.test()`のような関数呼び出しとして扱えます。

実行対象は、exeやCLIツール、Node.jsやJavaなどのランタイムです。workからprocessを呼び出すと、実際にそのプログラムを直接実行したときと同じように処理が開始されます。戻り値として、`stdout`、`stderr`、`exitCode`を取得できます。

```ts
const { stdout, stderr, exitCode } = await $process.hello('taro');

if (stderr) {
  $println(stderr);
}

$println(`${exitCode}: ${stdout}`);
```

processの実行は非同期です。呼び出し時は`await`を付けてください。

![process追加時](/screen_shot/process追加時.JPG)

## 設定項目

| 項目 | 説明 |
| --- | --- |
| `function_name` | workから呼び出す関数名です。 |
| `program_path` | 実行する外部プログラムのフルパスです。 |
| `script_argument_defs` | work側から渡す引数の定義です。 |
| `command_argument_values` | 外部プログラムに渡すコマンドライン引数です。 |
| `working_directory` | 外部プログラムを実行するときのカレントディレクトリです。 |
| `standard_input` | 外部プログラムへ渡す標準入力です。 |
| `timeout_millisecond` | タイムアウト時間です。超過するとランタイムエラーになります。 |
| `response_encoding` | stdin / stdout / stderrのエンコードです。`utf8`、`sjis`などを指定します。 |

## 引数リスト

引数はUI上で追加・削除できます。

- 見出し横の`+`ボタンで引数を追加します。
- 各行の左端にある`-`ボタンで削除します。
- スクリプト引数では、NumberトグルをONにするとTypeScript側で`number`として扱われます。
- NumberトグルがOFFの場合は`string`として扱われます。

`script_argument_defs`で定義した引数は、workからprocessを関数として呼び出すときの引数になります。たとえば`name`というスクリプト引数を定義すると、work側では`$process.hello(name)`のように引数が求められます。

NumberトグルをONにした引数は、TypeScript上では`number`として扱われます。数値以外を渡した場合はエラーになります。

## スクリプト引数とコマンドライン引数

スクリプト引数は、`__変数名__`形式でコマンドライン引数、作業ディレクトリ、標準入力へ埋め込めます。

スクリプト引数を定義しただけでは、外部プログラムの実行には反映されません。`command_argument_values`、`working_directory`、`standard_input`のいずれかで参照して初めて、実行時のリクエストへ渡されます。

`command_argument_values`は、実行する外部プログラムへ渡す実際のコマンドライン引数です。UIの`+`ボタンで引数を追加し、左端の`-`ボタンで削除できます。

たとえば、スクリプト引数`name`を定義し、コマンドライン引数に`__name__`を設定すると、workから渡した値が外部プログラムの引数として注入されます。

```text
script_argument_defs
└── name

command_argument_values
├── path/to/hello.js
└── __name__
```

この場合、workで`$process.hello('taro')`を呼び出すと、外部プログラムには`taro`がコマンドライン引数として渡されます。

script引数のラベルは`__name__`の形式で表示されます。UI上のラベルを右クリックすると、プレースホルダ文字列をクリップボードへコピーできます。また、定義したscript引数が利用されている場合は、ラベルの表示色で利用状態を確認できます。

## 作業ディレクトリと標準入力

`working_directory`には、外部プログラムを実行するときのカレントディレクトリを指定できます。未指定の場合は、作業ディレクトリを指定せずに実行します。

`standard_input`には、外部プログラムへ渡す標準入力を指定できます。未指定の場合は、標準入力を渡しません。

どちらの項目にも、envの値とscript引数を展開できます。

```text
working_directory
└── %WORKSPACE%\tools

standard_input
└── target=__name__
```

`%WORKSPACE%`のようなenv参照は、実行時にenvの値へ展開されます。`__name__`のようなscript引数は、workからprocessを呼び出したときの引数値へ置き換えられます。

## 実行時チェック

process呼び出し時には、script引数とプレースホルダに対して次のチェックが行われます。

- `型チェック`: Number指定の引数には`number`、通常の引数には`string`を渡す必要があります。
- `空文字チェック`: script引数の値に空文字は指定できません。
- `未解決チェック`: `__name__`のような未解決プレースホルダが残っている場合はエラーになります。
- `未使用チェック`: 定義したscript引数が`command_argument_values`、`working_directory`、`standard_input`のどこにも使われていない場合はエラーになります。

## タイムアウトとエンコード

`timeout_millisecond`で指定した時間を超えても外部プログラムが終了しない場合、processの呼び出しはランタイムエラーになります。

`timeout_millisecond`の初期値は`3000`です。UIでは`500`から`10000`の範囲で指定できます。

`response_encoding`では、`stdin`、`stdout`、`stderr`のエンコードをそれぞれ指定します。初期値はいずれも`utf8`です。

| 対象 | 説明 |
| --- | --- |
| `stdin` | `standard_input`を外部プログラムへ渡すときのエンコードです。 |
| `stdout` | 外部プログラムの標準出力を文字列として読むときのエンコードです。 |
| `stderr` | 外部プログラムの標準エラーを文字列として読むときのエンコードです。 |

外部ツールがShift_JISで入出力する場合などは、ここで適切なエンコードを指定します。

## 戻り値

processの戻り値は、外部プログラムの実行結果です。

```ts
const result = await $process.hello('taro');
```

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `stdout` | `string` | 標準出力です。 |
| `stderr` | `string` | 標準エラーです。 |
| `exitCode` | `number` | 外部プログラムの終了コードです。 |

## Node.jsを使った設定例

![プロセス設定例](/screen_shot/プロセス設定例.JPG)

次の例は、Node.jsでJavaScriptファイルを実行し、コマンドライン引数として渡した名前を使って文字列を出力するprocessです。

この場合、実行するプログラムはJavaScriptファイルではなく、Node.jsのランタイムである`node.exe`です。Node.jsで実行するJavaScriptファイルは、コマンドライン引数の1つ目として渡します。JavaScriptファイルに渡したい値は、その次の引数として指定します。

実行されるJavaScriptファイルは、たとえば次のような小さなプログラムです。

```js
const name = process.argv[2];
console.log(`${name}さんこんにちは`);
```

## workからの呼び出し例

```ts
const { stdout, stderr, exitCode } = await $process.hello('taro');

if (stderr) {
  $println(stderr);
}

$println(stdout);
$println(`exitCode: ${exitCode}`);
```

外部プログラムが`taroさんこんにちは`を標準出力した場合、`stdout`にその文字列が入ります。

## 実用例

- 複数のjarファイルを解凍する外部ツールを呼び出す
- classファイルを逆コンパイルし、脆弱性ライブラリを検索する
- nodeで実行するJSスクリプトに動的な引数を渡す
- 既存の社内CLIをTrace Kernelの作業フローに組み込む

たとえば、本番環境で稼働しているJavaプログラムモジュールに、脆弱性のあるライブラリが含まれていないか確認したい場合があります。対象モジュールが数十個のjarで構成され、その中にclassファイルが含まれている場合、jarの解凍、classファイルの逆コンパイル、文字列検索を組み合わせる必要があります。

このような作業では、`dataset`で対象jarをまとめて扱い、processで外部の解凍ツールを呼び出します。解凍後のclassファイル群を別の`dataset`として登録し、逆コンパイル用の外部プログラムをprocess経由で実行し、検索結果をworkで集計できます。

processを使うことで、Trace Kernelのワークスペース上にあるcontextと、既存の外部ツールや社内CLIを同じ作業フローに組み込めます。
