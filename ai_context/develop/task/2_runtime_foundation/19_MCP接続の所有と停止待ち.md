# MCP接続の所有と停止待ち

2026-10-13。第4段階の継続。`apps/desktop/src-tauri/src/mcp.rs` のlistenerと接続ごとのrequest threadの寿命を揃えた。

## 変更

- listenerがrequest threadを保持し、停止時に全件joinしてから終了する。完了済みthreadは受付中に回収する。同時処理は32件までとし、超過分は503を返す。
- HTTP要求の読込は全体で10秒を期限とし、200msごとに停止フラグを確認する。宣言されたContent-Lengthとheaderの合計も4MiB上限内か検証する。
- 停止時は先に停止フラグを立て、pending requestを取り出してcancel通知・待機解除を行い、その後listenerをjoinする。要求の登録とUIへの通知をpending lock内で連続して行い、cancel通知より後に新しい要求通知が届く競合を防ぐ。これにより`proposeWorkUpdate`の最大10分待機中でも停止を進められる。
- listener/request threadの失敗とdescriptor削除失敗を停止結果に伝える。descriptor削除失敗時はセッションを保持し、再度停止を呼べる。開始時のdescriptor準備をthread起動前に移し、thread起動失敗時はdescriptorを削除する。

## 確認と限界

- 停止でpending requestがjoin前に解放されること、descriptor削除失敗後に再試行できることをRustテストで確認。`cargo test --offline --locked`: 135件成功、fixture 6件ignored。`cargo clippy --offline --locked --tests -- -D warnings`と`git diff --check`も通過。
- 停止はthreadの終了を待つ。接続の読込は停止フラグを最大200ms周期で確認し、応答書込は2秒のtimeoutを設定している。OSレベルのソケット操作がtimeoutを守らない場合の強制中断は行わない。
- 実GUIと外部MCPクライアントを接続した動作確認は未実施。

第5段階のWorkspace読込と検証は [20_Workspace読込と検証の分離](20_Workspace読込と検証の分離.md) を参照。続いて実行準備とAPI権限注入の境界を整理する。
