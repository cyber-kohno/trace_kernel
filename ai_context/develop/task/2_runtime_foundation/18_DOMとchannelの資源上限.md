# DOMとchannelの資源上限

2026-10-13。第4段階の継続。17の実行所有に続き、実行context内に蓄積するDOMとchannel出力へ上限を追加した。定数の正本は `apps/desktop/src-tauri/src/resource_limits.rs`。

## channel

- 実行全体で128 channel、IDは256 bytes、保持出力は8MiB・100,000行まで。
- `append_lines` は全バッチの追加バイト数・行数を先に算出し、超過なら既存出力を変えずに失敗する。別channelの使用量も合算する。
- 上限内の出力は従来どおり保持し、UIの`get_range_lines`と`get_line_len`で表示できる。逆順のrangeは空配列を返す。

## DOM

- 入力は2MiB、実行全体で16文書・100,000ノード、構築深度128まで。失敗したparseは文書を登録せず、DOM IDを消費しない。disposeはノード予算を解放する。
- XPathは4096 bytes・128 steps、評価は合計1,000,000 node visits、結果は100,000 node IDsまで。指定した基点node IDも検証する。
- node_textの返却文字列は2MiBまで。超過時に部分文字列を成功として返さない。

## 確認と限界

- `cargo test --offline --locked`: 133件成功、fixture6件ignored。上限超過と部分結果の抑制、予算解放を追加試験で確認。
- `cargo clippy --offline --locked --tests -- -D warnings`、変更ファイルのrustfmt、`git diff --check`を実行。
- 上限はnative側に届いた後の処理・保持量を制限する。IPC引数の復号前、HTMLパーサー内部での一時確保、返却値のシリアライズ、アプリ全体のRSS/CPUは対象外。開始済みの同期DOM処理の強制中断もない。
- この工程の実GUI確認は未実施。大きなDOMやchannel出力を伴うWorkでのユーザー向けエラー表示と、既存出力の維持はUI上の確認が残る。

続きは [19_MCP接続の所有と停止待ち](19_MCP接続の所有と停止待ち.md) を参照。次は第5段階のWorkspace読込・検証・実行準備・API権限注入の分離へ進む。
