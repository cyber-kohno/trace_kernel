# snapshot所有とRestart終了調停

**続き:** DOMとchannelの実行所有は [17_DOMとchannelの実行所有](17_DOMとchannelの実行所有.md) を参照する。

2026-10-13。第4段階の継続。実GUIで通常終了、実行中の画面破棄、再実行に問題がないことをユーザーが確認した後、残る終了経路を調査した。

## 変更

- ProgramDialogのrecovery snapshot保存と削除を直列化し、実行ごとの所有tokenで古い実行の後処理が新しいsnapshotを消さないようにした。
- 画面破棄時はWorkerのdisposeと開始済みsnapshot保存の終了を待ち、disposeが成功した場合にその実行のsnapshotを削除する。dispose失敗時は従来のcleanup failure契約どおりsnapshotを残す。
- SystemMenuのRestartをEntryのApplicationShutdownへ接続した。未保存確認が承認された後、native I/O、全Worker、MCPの停止・解放を待ち、成功時だけsnapshotを消してreload/relaunchする。
- Restart失敗時は閉じずにエラーとRetry restartを表示する。確認キャンセル時は停止を開始しない。通常closeとRestartが重複した場合は進行中の同じ調停を待つ。

## 確認

- `npm run check`: Svelte 0 errors / 0 warnings、Transaction 37件、ライフサイクル120件成功。追加試験はsnapshotの古い後処理、Restartの解放待ち、確認拒否、relaunch失敗と再試行を対象とする。
- `npm run build`: 製品ビルド成功。
- 前工程でRust `cargo test --offline --locked`: 126件成功。この工程はRust製品コードを変更していない。
- 実GUIのRestart経路は未確認。Work実行中は開発ダイアログがSystemMenuを覆うため、Restartボタンを直接押せない。確認可能なのは、ダイアログを×で閉じた直後のRestartと、未保存確認のキャンセル後の継続である。実行中の終了はメインフレームの×で確認する。relaunch失敗時の表示は故障注入なしでは通常操作で確認できない。

## 次の調査

DOMとchannelの同期commandは`executions` Mutex内で処理される。通常終了はそのロックを待つが、shutdown gate後の遅延command受付や処理量上限、Worker以外の経路からの呼出はまだ整理していない。native全体の寿命境界と、MCP request threadの所有を続けて確認する。
