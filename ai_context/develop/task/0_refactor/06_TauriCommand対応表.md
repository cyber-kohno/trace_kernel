# Tauri Command対応表

## 目的

TypeScript 側から Rust 側へ渡している Tauri command について、

- command 名
- request / response の概形
- 主な呼び出し元
- 用途
- 現状の課題

を一覧化する。

この資料は、Phase 5 で `TS -> bridge -> Rust command` の境界を整理するための土台とする。


## 前提

Rust 側の command 公開は [app/src-tauri/src/lib.rs](app/src-tauri/src/lib.rs) に集約されている。

現状の呼び出し経路は大きく3種類ある。

1. フロント UI から `invoke(...)` を直接呼ぶ
2. Worker 内から `WorkerInvoke.call(...)` を通して呼ぶ
3. `WorkerAdapter` が Worker の代理として `invoke(...)` を呼ぶ

改善の観点では、2 と 3 は実行系の bridge として一定の整理がある一方、
1 は画面や util からの直接呼び出しが残っており、統一度が低い。


## command 一覧

## 1. App / Worker lifecycle

### `get_cli_args`

- Rust実装: `lib.rs`
- request: なし
- response: `string[]`
- 主な呼び出し元:
  - [Entry.svelte](app/src/app/Entry.svelte)
- 用途:
  - 起動時に CLI 引数を取得し、ワークスペースファイルの自動読込に使う
- 備考:
  - UI から直接呼んでいる


### `worker_init`

- Rust実装: [runtime.rs](app/src-tauri/src/runtime.rs)
- request: `{ workerId: string }`
- response: `void`
- 主な呼び出し元:
  - [worker.ts](app/src/app/contents/detail/program/runtime/worker.ts)
- 用途:
  - Rust 側に Worker ごとの runtime context を初期化する
- 課題:
  - Worker ID が現状固定値 `'a'` ベースで運用されている


### `worker_dispose`

- Rust実装: [runtime.rs](app/src-tauri/src/runtime.rs)
- request: `{ workerId: string }`
- response: `void`
- 主な呼び出し元:
  - [workerAdapter.ts](app/src/app/contents/detail/program/ui/workerAdapter.ts)
- 用途:
  - Worker 終了時に Rust 側 context を破棄する
- 課題:
  - `invoke` 直接呼び出し
  - Worker ID 固定


## 2. File system commands

### `exists_path`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string }`
- response: `boolean`
- 主な呼び出し元:
  - [dclFileSystem.ts](app/src/app/contents/detail/program/util/fs/dclFileSystem.ts)
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txVerifyUtil.ts](app/src/app/contents/detail/program/ui/tx/util/txVerifyUtil.ts)
- 用途:
  - 実行系 FS API
  - transaction verify
- 課題:
  - 実行系では `WorkerInvoke` 経由、transaction verify では `invoke` 直接で経路が分かれている


### `glob_path`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ pattern: string }`
- response: `string[]`
- 主な呼び出し元:
  - [dclFileSystem.ts](app/src/app/contents/detail/program/util/fs/dclFileSystem.ts)
- 用途:
  - `$fs.glob`
- 備考:
  - Worker 経由利用


### `read_binary`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ filePath: string }`
- response: `number[]`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
- 用途:
  - `$fs.readBinary`
- 備考:
  - Worker 経由利用


### `read_file`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ req: { filePath: string; encoding?: "utf8" | "sjis" } }`
- response: `string`
- 主な呼び出し元:
  - [fileUtil.ts](app/src/app/util/data/fileUtil.ts)
  - [ChooseRecord.svelte](app/src/app/contents/maintenance/dataset/choose/ChooseRecord.svelte)
  - [dclFileSystem.ts](app/src/app/contents/detail/program/util/fs/dclFileSystem.ts)
  - [contextDataUtil.ts](app/src/app/contents/detail/program/util/contextDataUtil.ts)
- 用途:
  - ワークスペース読込
  - dataset プレビュー
  - `$fs.readText`
  - `$dataset.content()`
- 課題:
  - UI 直呼び、util 経由、Worker 経由が混在している
  - `ChooseRecord.svelte` は encoding 指定なしで呼んでいる


### `read_dir`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ dir: string }`
- response: `{ name: string; isDir: boolean }[]`
- 主な呼び出し元:
  - [dclFileSystem.ts](app/src/app/contents/detail/program/util/fs/dclFileSystem.ts)
- 用途:
  - `$fs.readDir`


### `stat`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string }`
- response: `FileStat`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txVerifyUtil.ts](app/src/app/contents/detail/program/ui/tx/util/txVerifyUtil.ts)
  - [PathState.svelte](app/src/app/util/form/validation/PathState.svelte)
- 用途:
  - 実行系 FS
  - transaction verify
  - 入力パス妥当性確認
- 課題:
  - 画面レイヤーが直接 `invoke` している


### `save_text`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string; content: string }`
- response: `void`
- 主な呼び出し元:
  - [fileUtil.ts](app/src/app/util/data/fileUtil.ts)
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
- 用途:
  - ワークスペース保存
  - `$fs.saveText`
- 課題:
  - アプリ保存と実行系 FS が同一 command を共有している


### `save_binary`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string; bytes: number[] }`
- response: `void`
- 主な呼び出し元:
  - [txCommitRunner.ts](app/src/app/contents/detail/program/ui/tx/util/txCommitRunner.ts)
- 用途:
  - transaction commit 時のファイル書き込み
- 備考:
  - 現状 transaction 専用


### `rename`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ from: string; to: string }`
- response: `void`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txCommitRunner.ts](app/src/app/contents/detail/program/ui/tx/util/txCommitRunner.ts)
- 用途:
  - `$fs.renameFile`, `$fs.renameDir`
  - transaction commit
- 課題:
  - rename 専用 bridge がなく、用途横断で使われている


### `copy_file`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ src: string; dest: string }`
- response: `void`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txCommitRunner.ts](app/src/app/contents/detail/program/ui/tx/util/txCommitRunner.ts)
- 用途:
  - `$fs.copyFile`
  - transaction commit


### `make_dir`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ dirPath: string }`
- response: `void`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txCommitRunner.ts](app/src/app/contents/detail/program/ui/tx/util/txCommitRunner.ts)
- 用途:
  - `$fs.makeDir`
  - transaction commit


### `delete_file`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string }`
- response: `void`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
  - [txCommitRunner.ts](app/src/app/contents/detail/program/ui/tx/util/txCommitRunner.ts)
- 用途:
  - `$fs.deleteFile`
  - transaction commit


### `delete_dir`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string }`
- response: `void`
- 主な呼び出し元:
  - [realFSWriter.ts](app/src/app/contents/detail/program/util/fs/realFSWriter.ts)
- 用途:
  - `$fs.deleteDir`


### `delete_dir_all`

- Rust実装: [file_system.rs](app/src-tauri/src/file_system.rs)
- request: `{ path: string }`
- response: `void`
- 主な呼び出し元:
  - 現時点でフロント側からの利用は未確認
- 用途:
  - 未使用候補
- 課題:
  - command 公開されているが、現状のアプリ資産では入口が見当たらない


## 3. Scan / dataset commands

### `scan_directory`

- Rust実装: [scan.rs](app/src-tauri/src/scan.rs)
- request: `{ req: ScanRequest }`
- response: `ScanResponse`
- 主な呼び出し元:
  - [ScanUtil.ts](app/src/app/contents/maintenance/dataset/scan/ScanUtil.ts)
  - [worker.ts](app/src/app/contents/detail/program/runtime/worker.ts)
- 用途:
  - dataset 選択 UI 用スキャン
  - runtime auto スキャン
- 課題:
  - UI 直呼びと Worker 経由の両方がある


## 4. Process command

### `run_process`

- Rust実装: [process.rs](app/src-tauri/src/process.rs)
- request: `{ req: { program: string; args: string[]; timeoutMs: number } }`
- response: `{ stdout: number[]; stderr: number[]; exitCode: number }`
- 主な呼び出し元:
  - [contextDataUtil.ts](app/src/app/contents/detail/program/util/contextDataUtil.ts)
- 用途:
  - `$process.xxx()` の実体
- 備考:
  - Worker 経由利用


## 5. Stream commands

### `add_channel`

- Rust実装: [stream/channel.rs](app/src-tauri/src/stream/channel.rs)
- request: `{ workerId: string; channelId: string }`
- response: `void`
- 主な呼び出し元:
  - [worker.ts](app/src/app/contents/detail/program/runtime/worker.ts)
  - [dclChannel.ts](app/src/app/contents/detail/program/util/channel/dclChannel.ts)
- 用途:
  - plain 出力チャネル初期化
  - channel API の動的ストリーム生成


### `append_lines`

- Rust実装: [stream/channel.rs](app/src-tauri/src/stream/channel.rs)
- request: `{ workerId: string; channelId: string; batches: string[][] }`
- response: `void`
- 主な呼び出し元:
  - [worker.ts](app/src/app/contents/detail/program/runtime/worker.ts)
- 用途:
  - Worker 側に溜めたログバッチを Rust の channel buffer へ転送


### `get_range_lines`

- Rust実装: [stream/channel.rs](app/src-tauri/src/stream/channel.rs)
- request: `{ workerId: string; channelId: string; from: number; to: number }`
- response: `string[]`
- 主な呼び出し元:
  - [TextFixed.svelte](app/src/app/contents/detail/program/output/text/TextFixed.svelte)
  - [TableFixed.svelte](app/src/app/contents/detail/program/output/table/TableFixed.svelte)
  - [StreamReceiver.svelte](app/src/app/contents/detail/program/output/StreamReceiver.svelte)
- 用途:
  - 出力ストリーム表示用のページング取得
- 課題:
  - 出力コンポーネントが `invoke` 直接呼び出し
  - `workerId: "a"` 固定利用の可能性が高い


### `get_line_len`

- Rust実装: [stream/channel.rs](app/src-tauri/src/stream/channel.rs)
- request: `{ workerId: string; channelId: string }`
- response: `number`
- 主な呼び出し元:
  - [StreamReceiver.svelte](app/src/app/contents/detail/program/output/StreamReceiver.svelte)
- 用途:
  - 出力総行数取得
- 課題:
  - 出力 UI からの直接 `invoke`


## 6. Parser commands

### `dom_parse`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; source: string }`
- response: `number` (`domId`)
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - XML DOM 構築


### `dom_parse_html`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; source: string }`
- response: `number` (`domId`)
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - HTML DOM 構築


### `dom_root`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number }`
- response: `number | null`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - DOM root 取得


### `dom_query`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; xpath: string }`
- response: `number[]`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - document query


### `dom_query_from_node`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number; xpath: string }`
- response: `number[]`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - node 基準 query


### `dom_node_name`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number }`
- response: `string | null`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)


### `dom_node_text`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number }`
- response: `string`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)


### `dom_node_attr`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number; name: string }`
- response: `string | null`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)


### `dom_node_children`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number }`
- response: `number[]`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)


### `dom_node_parent`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number; nodeId: number }`
- response: `number | null`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)


### `dom_info`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number }`
- response: `[number, number]`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - debug / 情報取得


### `dom_dispose`

- Rust実装: [parser/dom.rs](app/src-tauri/src/parser/dom.rs)
- request: `{ workerId: string; domId: number }`
- response: `void`
- 主な呼び出し元:
  - [domParser.ts](app/src/app/contents/detail/program/util/parser/domParser.ts)
- 用途:
  - DOM ストア解放


### `excel_parse`

- Rust実装: [parser/excel.rs](app/src-tauri/src/parser/excel.rs)
- request: `{ buffer: number[] }`
- response: `Book`
- 主な呼び出し元:
  - [excelParser.ts](app/src/app/contents/detail/program/util/parser/excelParser.ts)
- 用途:
  - `$parser.excel`


## 7. Network / scraper commands

### `load_html_from_url`

- Rust実装: [scraper/api.rs](app/src-tauri/src/scraper/api.rs)
- request: `{ url: string }`
- response: `{ url: string; html: string; fetchedAt: number }`
- 主な呼び出し元:
  - [dclNet.ts](app/src/app/contents/detail/program/util/dclNet.ts)
- 用途:
  - `$net.getHtml`


### `load_http`

- Rust実装: [scraper/api.rs](app/src-tauri/src/scraper/api.rs)
- request: `{ req: HttpRequest }`
- response: `HttpResponse`
- 主な呼び出し元:
  - [dclNet.ts](app/src/app/contents/detail/program/util/dclNet.ts)
- 用途:
  - `$net.request`
  - `$net.getText`
  - `$net.getJson`


## command 利用状況のまとめ

## UI から直接 `invoke` されているもの

- `get_cli_args`
- `read_file`
- `scan_directory`
- `save_text`
- `worker_dispose`
- `get_range_lines`
- `get_line_len`
- `save_binary`
- `rename`
- `copy_file`
- `make_dir`
- `exists_path`
- `stat`

所感:

- 画面層から直接 Rust を叩く経路がまだ多い
- transaction 系と stream 表示系は bridge 層を作る余地が大きい


## Worker / 実行系 bridge 経由で使われているもの

- `worker_init`
- `add_channel`
- `append_lines`
- `exists_path`
- `glob_path`
- `read_dir`
- `read_binary`
- `read_file`
- `stat`
- `save_text`
- `copy_file`
- `make_dir`
- `delete_file`
- `delete_dir`
- `rename`
- `scan_directory`
- `run_process`
- `dom_*`
- `excel_parse`
- `load_html_from_url`
- `load_http`

所感:

- 実行系は `WorkerInvoke` に一定のまとまりがある
- ただし command 名を string 直指定しており、型安全性は低い


## 現時点で未使用候補

- `delete_dir_all`

補足:

- 現行 `app/src` 内では呼び出し元を確認できなかった
- 将来用途がないなら公開を見直す余地がある


## 主な課題

## 1. 呼び出し経路が統一されていない

同じ command でも、

- UI が直接 `invoke`
- util が直接 `invoke`
- Worker 経由

が混在している。

例:

- `read_file`
- `stat`
- `scan_directory`


## 2. command 名が string 直指定

`invoke("...")` や `WorkerInvoke.call("...")` が散在しているため、

- リネームに弱い
- 利用実態の追跡がしづらい
- 型付けが甘くなる


## 3. Worker ID の扱いが暫定的

stream 系、worker lifecycle 系、parser 系は worker context を前提にしているが、
現状は固定 ID に依存している箇所がある。

影響:

- 並列実行に弱い
- 出力系と parser 系の識別境界が脆い


## 4. UI レイヤーが Rust API の詳細を知りすぎている

特に以下は専用 bridge を介した方がよい。

- stream 表示用 command
- transaction verify / commit 用 command
- path validation 用 command


## 改善方針

## Phase 5 で目指す形

### フロント標準経路

- UI -> application service -> bridge -> invoke

### 実行系標準経路

- runtime API -> Worker bridge -> invoke


## 整理候補

### `appBridge`

アプリ通常操作用

- `get_cli_args`
- workspace file I/O
- path validation


### `runtimeBridge`

実行系用

- worker lifecycle
- stream
- parser
- net
- process
- runtime FS


### `transactionBridge`

transaction verify / commit 用

- `save_binary`
- `rename`
- `copy_file`
- `make_dir`
- `delete_file`
- `stat`
- `exists_path`


## 現時点の結論

Rust 側の command 群自体は、責務ごとのまとまりが比較的良い。

問題は主に TypeScript 側にあり、

- 入口が分散している
- 呼び出し方針が揃っていない
- UI が command 詳細に近すぎる

という構造になっている。

したがって Phase 5 では、

1. command 名と型の集約
2. bridge 層の統一
3. UI からの直接 invoke 削減

を優先するとよい。
