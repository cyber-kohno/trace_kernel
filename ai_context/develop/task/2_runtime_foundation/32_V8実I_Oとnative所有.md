# V8実I/Oとnative所有

**その後の進捗:** 31/32のGUI確認はユーザーから問題なしと報告された。実process/HTTP/DOM/Excelの接続と共通化は [33_nativeサービスと個別APIの共通化](33_nativeサービスと個別APIの共通化.md) を参照。本資料の未接続項目と試験件数はこの工程時点の記録。

2026-10-13。31の共通TypeScript移行に続き、既存の`experiments/js-host-v8`へ実ファイル・走査とnative要求の所有を接続した。製品CLIアプリはまだ作成していない。CLIのフォルダ名と引数仕様は着手前にユーザーへ確認する。

## 共通Rustの追加

- native-coreに`file_io_dispatch::FileIoRequest`を追加。ファイル15コマンドとscan_directoryを型付きenumへdecodeし、既存のfile_system/scan実装へ接続する。
- executeの呼出元からOperationを受け取り、blocking_io経由で実行する。JavaScriptが送ったexecutionIdからownerを探さない。
- ExecutionIoに現在のOperationの有無を取得するメソッドを追加。既存の同時受付32件・停止/解放待ちの契約を引き継ぐ。
- serde_jsonをnative-coreのruntime依存へ移した。DesktopのCargo.lockにも追加を反映した。

## V8ホスト

- 通常の比較はメモリモデルを維持。`nativeFiles: true`の検証入力では実ファイルと走査を共通Rustへ接続する。
- ファイル/走査/模擬process要求はasync opの最初のawait前にOperationを取得する。deno_coreがeagerにpollすることを32成功/1拒否の検証で確認する。
- Cancel・期限超過・メモリ超過時はnative受付を先に閉じ、停止を要求してからV8を停止する。
- Workのユーザーtimer解除と出力完了の後、transactionへ進む前にnative要求が残っていないか検査する。残っていれば停止し、transactionを適用しない。
- native要求が未完了のままV8 Promiseがsettleしない場合も、停止理由をRustから直接観測して戻す。未完了I/Oの停止を単なる期限超過にしない。
- watchdogからの停止にはNotifyでTokioの待機も起こす。V8のterminate_executionだけではnative opを待つRust taskが起きない場合があるため。
- 最後にV8をdropして未処理futureを解放し、blocking task自身が保持するOperationが解放されるまでExecutionIo.stopをawaitする。callerのfuture破棄でblocking所有を消さない。
- nativeIoのreportに実I/O mode、終了時のactive有無、未完了検知、scan開始、cleanup失敗、cleanup所要時間を追加。

`nativeCallDelayMs`と`scanProgressDelayMs`は検証用の遅延注入。実scanのprogress callbackで遅延させ、Cancelを受けた後もblocking taskが残る期間を作って解放待ちを検査する。デフォルトのscan callbackにこの遅延はない。

## 検証

```powershell
cargo test --locked --manifest-path crates/native-core/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo build --release --locked --manifest-path experiments/js-host-v8/Cargo.toml
node experiments/js-host-v8/compare.mjs --release
node experiments/js-host-v8/verify-host.mjs
node experiments/js-host-v8/verify-native-io.mjs
cargo clippy --locked --manifest-path crates/native-core/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path experiments/js-host-v8/Cargo.toml --all-targets -- -D warnings
```

実I/O試験はWindowsの既存path規則を対象にする。generated/native-io内の一意なfixtureで、7種類のtransactionと出力順、Shift-JIS、直接FS API、dataset、read失敗、外部変更conflict、未await、受付上限、未完了blocking scan、Cancel/期限/メモリ超過時の解放待ち、次の実行を確認する。削除前に絶対pathがfixture base内に収まることを確認する。

最終結果: native-core 48件成功、Desktop Rust 90件成功（既存補助fixture 6件ignored）、両エンジン比較30件ずつ成功、V8追加12件成功、実native I/O 13件成功。native-coreとV8のClippy全target（警告をエラー扱い）、V8 releaseビルドも成功。実I/O検証では全reportのactiveAfterCleanup=false/cleanupError=nullを検査した。

重いClippyビルドと同時実行したWeb API試験で一度期限超過を観測し、ビルド完了後の単独実行では12件が成功した。短い期限で起動も測る検証は、重いビルドと並行させずに再現する。

## 未実装・保証限界

- 実process、HTTP、DOM、Excel、channelの永続化、MCP接続はV8へ未接続。real modeのprocess要求は明示的に未接続エラーとし、模擬結果を実process成功と扱わない。
- Workspaceの圧縮・migration、ライセンス検証、型宣言/コンパイラasset、全個別APIはまだ共通packageへ移し終わっていない。
- I/O停止は協調停止。OSの単一待機やread自体を強制中断できるわけではなく、解放待ちを任意timeoutで成功扱いにしない。実行期限を超えてnative解放を待つことがある。
- メモリ検査は29と同じく超過の検知であり、RSSやRustの全確保の厳密な上限ではない。security sandboxやクリーンPC配布も未検証。

## 次のステップ

今回の共通TypeScript切替後のGUI確認を受け、残る個別APIとprocess/HTTP/parser等のnative機能を共通化する。CLIアプリを作り始める前には、フォルダ名・実行入口名・コマンドライン引数の仕様を具体案で確認する。それまではCLIアプリのフォルダや入口を作らない。
