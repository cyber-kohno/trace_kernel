# contextのI/Oポート分離

2026-10-13。Work実行プランのGUI動作確認後、Worker側にあったdatasetとprocessのcontext生成を実行ホストから分離した。

## 変更

- `service/execution/create-io-context.ts` は、選択済みcontext、準備済みdataset一覧、ファイル読込・プロセス実行のポートを受け取る。datasetのパス・遅延読込関数とprocessの引数検証・出力デコードを生成する。Tauri、Worker、Svelteの実行時依存は持たない。
- `ContextDataUtil.createObjects` は、従来の`WorkerInvoke.call('read_file')`と`WorkerInvoke.call('run_process')`をポートに接続し、生成結果を`$dataset`と`$process`へ配置する。実行IDとnative側が所有するタイムアウトの扱いを維持する。
- `test-io-context.mjs`で準備済みdatasetのファイル名・パス・遅延読込、およびprocessの引数検証・実行要求・出力デコードを確認する。既存のMCP整合性とruntime試験のローダーも新モジュールを読めるようにした。

## 確認と残る範囲

- 前段のWork実行プランについてユーザーがGUI動作を確認し、問題なしと報告した。
- `npm run check`は通過した。型検査は0件のエラー・警告、transaction 37件、runtime 134件、Workspace 5件、Work実行プラン2件、I/O context 2件が成功した。MCP整合性も通過した。
- `$env`、`$resource`、`$logic`の具体化とlogicのコンパイル・parser注入は、まだ`ContextDataUtil`にある。dataset走査・nativeの準備処理もDesktop/Worker側にある。
- 残るcontext生成の共通化は [23_Work_context生成の共通化](23_Work_context生成の共通化.md) を参照。
