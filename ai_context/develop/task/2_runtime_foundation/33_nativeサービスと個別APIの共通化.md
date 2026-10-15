# nativeサービスと個別APIの共通化

**その後の進捗:** 本工程のGUI確認はユーザーから問題なしと報告された。FS/VFS、計画正規化、Workspace/ライセンス/コンパイラの共通化は [34_FS_VFSとWorkspace基盤の共通化](34_FS_VFSとWorkspace基盤の共通化.md) を参照。本資料の残作業・試験件数は本工程時点の記録。

2026-10-13。31/32のGUI確認について、ユーザーから「問題ありません」と報告を受けて続行した。process・HTTP・DOM・ExcelのRust実装と、runtime・network・parserのTypeScript実装を共通ライブラリへ移し、既存V8検証ホストへ実サービスを接続した。

**製品CLIは未作成。** CLIアプリのフォルダ名とコマンドライン引数の仕様は、作り始める前にユーザーへ必ず確認する。既存実験ホストのJSON入力と検証スクリプトは、製品CLIの仕様ではない。

## 共通RustとDesktop

- `crates/native-core/src/process.rs`へ外部プロセスの実処理と回帰試験を移した。既存のstdin encoding、stdout/stderr、終了コード、期限、16MiB合計出力上限、直接起動した子のkill/waitを維持する。
- `http/`へHTTP/HTML実処理、型、domain limiterを移した。本文2MiB、domain待機を含む期限、受信途中の停止、既存client設定を維持する。
- `parser/`へDOM、Excel、型、Excel資源上限と試験を移した。Desktopのparser/process/scraperはTauri受付とAppState所有のadapterへ切り替えた。
- process/HTTPの公開入口はOperationを保持するTokio taskをspawnしてJoinHandleをawaitする。caller futureが破棄されても実taskが継続して停止を監視し、処理・子の回収を終えるまで所有を保持する。
- Operationがpanicの巻き戻しで解放される際は、activeを減らす前に同じlockでcleanup失敗を記録する。activeが0になった後も失敗は消えない。`has_cleanup_failures()`でtransaction前に判定できる。
- Desktopに残すのはcommand登録、executionIdの受付、application終了調停、DOM storeの実行所有、通知。Excel commandの試験用fixtureはDesktopにも残すが、本番parser/limitsの実装は共通Rustだけにある。
- `FileIoRequest`へExcel読込を追加。12種類のDOM要求は`DomRequest`で型付きdecodeし、渡された実行のDomStoreへ接続する。

## 共通TypeScript

`packages/runtime-core`は20から29モジュールになった。今回移したもの:

- runtime cache/VFSの型・token factory・定数、`DclRuntime`
- `DclNet`
- `DclParser`、`DomParser`、`ExcelParser`
- table/JSON inspector
- native呼出の`NativeCall` port

network/parserのfactoryはhostからNativeCallを受け取る。DesktopはWorkerInvokeを渡す薄いbridgeとし、既存のpublic signatureと型宣言を維持した。V8/QuickJS共通fixtureも同じfactoryを利用する。API coverageとbehavior/lifecycle試験は、移動した正本とbridgeを検査するよう読込先を更新した。

FS個別API、VFS操作helper、UI側TxPlanNormalizeはまだDesktopにある。全APIの独立化が終わったとは扱わない。

## V8の実サービス接続

- 既存`nativeFiles: true`に実process・HTTP/HTML・DOM・Excelを追加。flag名は既存検証入力の互換性のため維持した。
- async opの最初のawait前に共通枠を取得し、実process/HTTPのowned taskとExcel blocking taskへ渡す。
- DOMは実行ごとのstoreへ接続し、最後にV8をdropしnative解放を待った後でclearする。reportに`domDocumentsAfterCleanup`を追加した。
- 出力drain後・transaction前に未完了native要求と記録済みcleanup失敗を検査する。失敗があればnative受付を閉じてV8を停止する。JSでnativeのpanicエラーをcatchしてもstaged transactionを適用しない。
- `scanProgressPanic`は実scan callbackへpanicを注入する検証用入力。既存delay注入と同様、通常は無効。

## 検証

```powershell
npm --prefix apps/desktop run check
npm --prefix apps/desktop run build
cargo test --locked --manifest-path crates/native-core/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo build --release --locked --manifest-path experiments/js-host-v8/Cargo.toml
cargo clippy --locked --manifest-path crates/native-core/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path experiments/js-host-v8/Cargo.toml --all-targets -- -D warnings
node experiments/js-host-common/compare-engines.mjs
node experiments/js-host-v8/verify-host.mjs
node experiments/js-host-v8/verify-native-io.mjs
node experiments/js-host-v8/verify-native-services.mjs
```

Frontend check、29モジュールの型/import境界検査、Desktop本番bundle、V8 release build、両Rust crateのClippyは成功。Desktop buildの既存source-map URL外部化とchunkサイズの警告は残る。

Rustはnative-core 98件成功（子process試験用の6関数はignored）、Desktop 42件成功。processのcaller破棄後の所有・子回収と、panic後のsticky cleanup失敗を追加検証した。移動した試験は共通側で実行しており、Desktopの試験数減少をcoverage削除と扱わない。

両エンジン比較は30件ずつ、V8 Web API/停止/メモリ検証12件、実native I/O14件、実nativeサービス19件が成功。実I/O14件目はpanicをcatchした後のtransaction拒否を検査する。通常ケースはactiveAfterCleanup=false/cleanupError=null、故意のpanicだけcleanup失敗を要求する。

新規`verify-native-services.mjs`は実stdin/stdout/stderr/非zero exit、Shift-JIS、Cancel/期限/未await/メモリ停止時の直接子の消滅、process出力超過、HTTP method/query/header/body/JSON、domain待機期限、応答本文超過・停止、HTML/XMLのDOM操作/dispose/古いhandle、実XLSXのBook/Sheet/Cell/table shapeと欠損ファイルを検査する。全reportでDOM残数0を要求する。Nodeはこの試験の子processとlocalhost serverとして使用する。

Windows制限sandboxではlocalhost HTTPがNetworkErrorになり、sandbox外の試験では19件が成功した。製品HTTPのproxy/client設定を変更して回避していない。短い期限のengine試験は重いRust build完了後に実行する。

## 保証限界と残作業

- channel永続化とMCPの実接続はV8へ未接続。
- `.trk`圧縮・migration、ライセンス検証、型宣言/コンパイラasset、FS/VFS helper、実Workspaceを入口とする実行は未完了。
- process停止は直接起動した子を対象とし、子孫treeの強制終了保証ではない。blocking I/O/calamine/DOMの単一処理を任意時点で強制中断する保証もない。nativeの実解放待ちがWork期限を超える場合がある。
- メモリ検査はV8 heap/external超過の検知であり、Rust全確保やRSSの厳密上限ではない。security sandbox・クリーンPC配布は未検証。

## ユーザー確認と次のステップ

今回切り替えたDesktopの実装について、再ビルドしたGUIで既存Workのprocess・HTTP・XML/HTML・Excelの結果を確認する。長時間process/HTTPはCancel、開発ダイアログ×、またはmain frame×で停止・終了を確認する。Work中の再起動ボタンはmodalに隠れて押せないため試験項目にしない。

問題がなければ、残るFS個別API/VFS操作とtransaction計画正規化の共通化を進め、続いてWorkspace圧縮・migration・ライセンス・コンパイラassetを整理する。CLIアプリ作成の直前にフォルダ名・実行入口名・引数仕様の具体案をユーザーへ確認する。
