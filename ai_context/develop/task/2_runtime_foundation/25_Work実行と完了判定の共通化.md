# Work実行と完了判定の共通化

2026-10-13。第5段階の継続。コンパイル済みWorkの実行と、実行後の登録・出力完了待ちをWorkerから共通処理へ移した。

## 変更

- `service/execution/execute-work.ts`は、コンパイル済みコードと名前付きcontextを受け取り、非同期関数として実行する。ユーザーコード内の`return`は正常終了、ホストから渡した終了判定に合う`$runtime.exit()`も正常終了として扱う。それ以外の例外は再送出する。
- 同モジュールの`runWorkLifecycle`は、実行、出力先の登録完了待ち、出力書込完了待ちをこの順で行う。前の段階が失敗しても後の完了待ちを実行し、最初の失敗を結果として返す。
- Workerはnative実行所有の開始、予約API・context生成、dataset走査、出力先登録を担当し、共通処理の結果に応じて`done`または`runtime-error`を通知する。source mapとVFSの通知形式は維持する。
- `test-execute-work.mjs`で`return`・終了シグナル・通常例外と、失敗時の完了待ち・最初の失敗の保持を確認する。既存のWorker回帰試験でも出力と終了通知の順序を確認する。

## 確認と残る範囲

- `npm run check`は通過した。型検査は0件のエラー・警告、transaction 37件、runtime 134件、Workspace 5件、Work実行プラン2件、context 5件、Work実行3件が成功し、MCP整合性も通過した。
- 今回のWork実行変更のGUI確認は未実施。
- 予約APIの生成、native所有、Worker通知とVFSはDesktop側にある。CLIホストとそのアダプターは未実装。
- 予約API生成と共通実行入口は [26_予約APIと共通実行入口](26_予約APIと共通実行入口.md)、Rustホストとの比較と次の設計判断は [27_共通実行入口のRustホスト比較](27_共通実行入口のRustホスト比較.md) を参照。
