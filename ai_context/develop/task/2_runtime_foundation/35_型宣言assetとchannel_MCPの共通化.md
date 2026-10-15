# 型宣言assetとchannel/MCPの共通化

2026-10-14。34に続き、ユーザーの進行指示を受けて型宣言・意味解析・標準ライブラリassetとchannel/MCPのnative境界を共通化した。

**製品CLIは未作成。** CLIアプリのフォルダ名とコマンドライン引数の仕様は作り始める前に必ずユーザーへ確認する。共通ライブラリのasset入口、生成物、既存実験ホストの入力は製品CLIの入口・引数仕様ではない。

## 型宣言と意味解析

- 共通TypeScriptへreserved API宣言、context宣言、Logic source解析/signature cache、Work semantic validator、restricted globalsとcompiler optionsを移した。
- DesktopのDeclareUtil/ContextDataUtilはライセンス状態の参照とWorker adapterを維持し、宣言生成は共通側へ委譲する。意味解析は標準libのtext mapを受け取る。共通側からfetch、Node FS、Svelte、Tauriを選択しない。
- channel登録はNativeCallと通知callback、state APIは通知callbackをhostから受け取る。Desktopの既存signature・通知payload・登録の重複判定・空channelの登録待ちは維持した。
- generation metadataを共通JS moduleへ移し、Desktopのgen-version.jsは再exportにした。schema export等のNode利用側もTS transpilationなしで読める。
- 共通packageは47から60のsource module（型定義を含む）になった。境界検査はJS metadataも対象にする。
- GUIのMonaco language worker自体を置換したわけではない。追加restricted診断、Logic解析、MCPのWork意味解析、型宣言を共通化した。既存の診断規則・位置・API権限選択を維持する。

## 標準libと生成asset

- `packages/runtime-core/build/standard-libs.mjs`が共通packageの固定TypeScript 5.6.3からes2020/webworkerと参照先libのclosureを収集する。Desktop Viteも同じcollectorを使用する。
- esbuild 0.25.12を共通packageの固定dev依存へ追加した。既存Desktop lockと同じ版を照合し、offline npm ciで導入した。
- `npm --prefix packages/runtime-core run build:assets`で以下を生成する。生成物は`generated/runtime-assets/`に置きGit ignore対象。新しいcheckoutでは共通packageのnpm ciと再生成が必要。

| asset | 用途 | 今回のサイズ |
|---|---|---:|
| runtime.js | hostからI/O・通知を受け取る実行/Workspace/API exports | 683,468 bytes |
| compiler.js | TS変換、宣言、Logic/Work意味解析 exports | 10,661,636 bytes |
| typescript-libs.json | 固定compilerと同じ標準lib | 891,278 bytes |
| manifest.json | format/version、各assetのサイズ・SHA-256 | — |

bundleの全入力がruntime-core内にあることをbuildで検査する。Node/esbuildはbuild toolであり、Rust V8がNodeを起動する構成ではない。assetを製品binaryへembedする配送経路はまだ追加していない。

新規`verify-shared-assets.mjs`は生成manifestのサイズ/hashとlib参照closureを検査し、そのassetで宣言・型の誤用・restricted global・local shadowing・Promise/URL/Intl・free plan・table column・Declare/linked Logic・context注入からWork実行までをNode/V8で比較する。11件成功。Node referenceのcompiler初期化にだけrequire/filenameを渡し、V8へNode機能を注入していない。

## 共通Rustのchannel

- ChannelStore/LineBuffer、byte/line/channel数/ID上限と既存試験をnative-coreのstreamへ移した。Desktopに残すのは実行受付とTauri command。
- range_lines/line_lenは従来のGUI読出し規則（末尾の空行を表示行数から除く等）を維持する。GUIは停止後の保持結果も読める。
- V8向けの型付きChannelRequestを追加し、add/append/range/lenを共通storeへ接続した。変更要求はnative受付枠を保持し、停止を確認する。
- V8は終了時にnative解放を待って結果をsnapshotし、storeをclearする。reportのchannelsで保持結果、channelsAfterCleanup=0で解放を検査する。
- 共通fixtureの登録もDclChannelを直接使用する。検証option `nativeChannels`でappend_linesを実storeへ渡す。通常のparity出力は従来のmemory modelを維持する。
- tableの内部保持はDesktopと同じJSON record行とmetadata。CLIの出力ファイル形式・出力directoryを決めたわけではなく、ディスク永続化も追加していない。

新規`verify-channels.mjs`は12件成功。text/tableの分離、print/println結合、range/表示行数、JS/native双方の重複拒否、UTF-8 ID・128 channels・8MiB/100,000 lines上限、append全体の拒否と既存結果保持、Cancel/期限/メモリ停止後の保持と解放、staged file未適用を確認する。fixture削除前に絶対pathが専用base内にあることを検査する。

## 共通RustのMCP

- GUI編集用MCP bridgeのlistener、request thread/pending response、認証/HTTP処理、期限・同時接続上限、stop/join、descriptor作成/削除をnative-coreへ移した。
- 共通側はdescriptor directoryとEventSinkを受け取る。Desktopはapp local dataの既存`mcp/sessions`選択とTauri emitを担当する。command名・イベント名・payloadと停止契約を維持した。
- EventSinkはhostイベントをqueueへ渡すport。停止とpublishの順序を守るためpending lock中に呼ぶので、同期的にrespond/stopへ再入しない。DesktopのTauriイベント通知は従来と同じ形で利用する。
- 停止は新規処理を閉じ、pending要求へcancelを返してからlistener/request threadsのjoinを待つ。descriptor削除に失敗したsessionはretry可能な状態で保持する。
- 実TCP試験を3件追加。認証/health/host応答/late response拒否、600秒のproposal待機中の即時cancelとjoin、hostへのpublish失敗時のpending解放を検査した。既存の停止/descriptor失敗試験も共通側へ移した。

これはGUI編集用MCP transportの共通化。V8内でGUI編集用serverを起動したり、Workに新しいMCP APIを注入したりする変更ではない。

## 検証結果

```powershell
npm ci --prefix packages/runtime-core
npm --prefix packages/runtime-core run build:assets
npm --prefix apps/desktop run check
npm --prefix apps/desktop run test:shared-runtime-dev
npm --prefix apps/desktop run build
cargo test --locked --manifest-path crates/native-core/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cargo clippy --locked --manifest-path crates/native-core/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path experiments/js-host-v8/Cargo.toml --all-targets -- -D warnings
cargo build --release --locked --manifest-path experiments/js-host-v8/Cargo.toml
node experiments/js-host-common/compare-engines.mjs
node experiments/js-host-v8/verify-host.mjs
node experiments/js-host-v8/verify-native-io.mjs
node experiments/js-host-v8/verify-native-services.mjs
node experiments/js-host-v8/verify-workspace.mjs
node experiments/js-host-v8/verify-shared-assets.mjs
node experiments/js-host-v8/verify-channels.mjs
```

- Frontend: 0 errors/0 warnings、API coverage/behavior/context整合、191件の回帰試験、共通60 moduleの型/import境界が成功。移動した依存のmock境界を追従させ、実adapter/共通処理を検査した。
- native-core: 109件成功、子process補助fixture 6件ignored。Desktop Rust: 35件成功。既存channel 5件/MCP 2件は共通へ移しており、coverage削除ではない。今回のRust追加4件を合わせて計144件成功。
- 両Rust crateのClippy全target（warningをerror）、V8 release、Desktop本番bundle、共通asset生成が成功。Desktop buildの既存url外部化とchunkサイズ警告は残る。
- dev serverは標準lib endpointが共通collectorと同一であること、共通module/dependencies/bridgesの配信と終了を確認して成功。
- engine比較各30件、V8 Web等13件、実I/O14件、実nativeサービス19件、Workspace/license21件、生成asset11件、実channel12件が成功。

## 残作業と次のステップ

- 製品CLIの入口・引数処理・Work選択・stdout/stderr/終了codeの規約、license読込場所、asset embed、実際のtrk fileからの一連の実行と配布検証は未実装。
- SDK asset試験でWorkspace準備・宣言・意味解析・変換・context・実行を検査したが、製品CLIの端から端までの試験ではない。
- 型APIの選択はsecurity sandboxの保証ではない。既存のメモリ検査はRSS/Rust全確保の厳密上限ではなく、圧縮復元量全体の上限、未来世代のschema migration、クリーンPC配布も未検証。
- 既存表示版v0.2.0と全未commit変更を維持した。commit/pushはしていない。

GUIでは、Work/Logic/Declareの型診断・補完、plain/text/table出力、channelを使うWorkのCancel/開発dialog×/main frame×、MCP接続の開始・要求/応答・停止とアプリ終了を確認する。実行中のRestart buttonはmodalに隠れて押せないため試験項目にしない。

確認後の次工程はCLIのフォルダ名・実行入口名・コマンドライン引数の具体案をユーザーへ提示し、確認を得てから製品CLIを作り始める。入口・asset embed・trk→Workの配線と終了code等をそこで実装する。
