# Work context生成の共通化

2026-10-13。第5段階の継続。Workerに残っていた`$env`、`$resource`、`$logic`の生成と5種類のcontext組立を共通処理へ移した。

## 変更

- `service/execution/create-work-context.ts`は、選択済みcontext、準備済みdataset一覧、ホストから渡すポートを受け取って、`$env`、`$resource`、`$dataset`、`$process`、`$logic`を生成する。CSV/TSVリソースの変換、logicの相互参照、実行時の遅延コンパイルとdefault関数の確認もここにある。
- `ContextDataUtil.createObjects`はWorkerのファイル読込・プロセス実行、parserオブジェクト生成、TypeScript変換をポートとして渡す薄い接続になった。予約APIとWorkerの実行寿命は従来のまま。
- `test-io-context.mjs`に、リソース変換、logic相互参照、parser注入、遅延コンパイル、default関数がない場合のエラーを追加した。既存のMCP整合性とruntime試験ローダーも新モジュールを読み込む。

## 確認と残る範囲

- `npm run check`は通過した。型検査は0件のエラー・警告、transaction 37件、runtime 134件、Workspace 5件、Work実行プラン2件、context 4件が成功し、MCP整合性も通過した。
- GUIでの今回のcontext変更の動作確認は未実施。
- datasetの走査、予約APIオブジェクト、Work本体の実行・完了通知はまだDesktopのWorkerにある。CLIホストが使うI/O・parser・compilerアダプターも未実装。
- dataset走査のポート分離は [24_dataset走査準備のポート分離](24_dataset走査準備のポート分離.md) を参照。
