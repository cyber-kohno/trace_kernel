# DOMとchannelの実行所有

**続き:** DOMとchannelの資源上限は [18_DOMとchannelの資源上限](18_DOMとchannelの資源上限.md) を参照する。

2026-10-13。第4段階の継続。DOMの12 commandとchannel書込の2 commandを、既存のExecutionIoとWorkerSessionが所有するnative要求へ加えた。

## 変更

- `AppState::with_owned_execution` は、実行contextのMutexの下でアプリ終了ゲートとexecutionIdを確認し、ExecutionIoのOperationを登録して同期処理の終了まで保持する。
- DOMのparse/query/node/disposeとchannelのadd/appendがこの境界を使う。停止済み、不明ID、アプリ終了中、実行ごとの32枠超過を実処理前に拒否する。
- `native-io-policy.ts` の所有対象に同じ14 commandを追加した。Worker側の10秒切離しタイマーを使わず、未完了要求を残したdoneは成功やVFS公開へ進めない。
- UIが終了後の出力表示に使う`get_range_lines`と`get_line_len`は所有対象に含めず、既存の読取動作を保つ。

## 確認

- `npm run check`: Svelte 0 errors / 0 warnings、Transaction 37件、ライフサイクル134件成功。
- `cargo test --offline --locked`: 128件成功、fixture6件ignored。同期処理中のshutdown待ち、終了後受付拒否、停止済み・容量超過を追加試験で確認した。
- `cargo clippy --offline --locked --tests -- -D warnings`と`npm run build`、変更ファイルの整形、`git diff --check`を実行。

## 保証の限界

開始済みのDOM解析やXPath処理を強制中断しない。同期commandは実行contextのMutexを保持するため、shutdownは処理の終了まで待つ。入力や返却DTOの容量、DOMノード数、XPath条件量、アプリ全体のCPU/RSSには今回上限を追加していない。IPC側での引数復号や返却値のシリアライズもOperationの所有範囲外。実GUIでの重いDOM処理中のCancel/closeは未確認。

次はDOM/出力の処理量上限とMCP request threadの所有を確認し、第5段階のWorkspaceサービス分離へ進む。
