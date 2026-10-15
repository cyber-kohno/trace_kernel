# dataset走査準備のポート分離

2026-10-13。第5段階の継続。Work開始前のdataset走査要求と結果の変換をWorkerから共通処理へ移した。

## 変更

- `service/execution/prepare-dataset-targets.ts`は、選択済みdatasetとenv、走査ポートを受け取る。動的datasetだけを並行走査し、走査結果から相対ファイルパスを生成する。結果はdatasetの定義順で返し、すべての走査が完了してから利用できる。
- Workerは`scan_directory`の呼出しを走査ポートに接続する。`worker_init`で実行所有を確立した後に走査を開始し、準備が成功してから`prepared`通知とWork実行へ進む。
- 旧Worker専用の`dataset-scan-result.ts`は削除し、rootラベルを除く変換、空ディレクトリ、異常なrootの処理を共通モジュールにまとめた。
- `test-io-context.mjs`に、env展開、明示targetsの走査省略、並行走査、定義順の結果を追加。Worker回帰試験は新モジュールを読み込むよう更新した。

## 確認と残る範囲

- `npm run check`は通過した。型検査は0件のエラー・警告、transaction 37件、runtime 134件、Workspace 5件、Work実行プラン2件、context 5件が成功し、MCP整合性も通過した。
- GUIでの今回のdataset走査変更の動作確認は未実施。
- 走査自体のI/O、予約API、Work本体の実行・完了通知はDesktop/Workerにある。CLIホスト向けのアダプターはまだない。
- Work本体の実行と完了判定の共通化は [25_Work実行と完了判定の共通化](25_Work実行と完了判定の共通化.md) を参照。
