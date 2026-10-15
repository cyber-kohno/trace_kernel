# CLI初期実装とライセンス対応

**利用者確認追記:** 実Workspaceで通常実行の出力成功をユーザー確認済み。`--check`付きで無表示だった点は仕様どおりの検証のみで、通常実行の不具合ではなかった。次の配布案は [41_Windows_CLI配布案と依存調査](41_Windows_CLI配布案と依存調査.md)。

2026-10-14。ユーザーはCLI仕様36、互換性整理39と、ライセンス取得の「明示ファイル→同じOSユーザーのDesktop保存済み→Free」を承認し、実装を指示した。CLI着手前の確認条件は満たしている。

## 1. 実装した構成

- `code/apps/cli`にRust package/binary `trace-kernel-cli`を追加。Windows実行名は`trace-kernel-cli.exe`。Desktop実行名`trace-kernel.exe`とは競合しない。
- deno_core 0.412.0 / deno_web 0.290.0 / deno_webidl 0.259.0、V8 150.4.0、ICU埋込。共通runtime/compiler/TypeScript librariesを実行ファイルへ埋め込む。
- `build.rs`は共通asset manifestのhash/byte数と世代metadataを読み、欠損・不一致をビルド時に拒否する。
- 共通native-coreを直接利用。実験ホストの模擬native実装を製品へ取り込まない。Work/Logic/Workspace/API/context/VFS/ライセンスの規則は共通TSを利用する。
- 実行時にDesktop、WebView、Node.js、リポジトリ配置は不要。Workが指定する外部processのプログラムは別途必要。
- ビルド/使い方/終了コードの詳細は`code/apps/cli/README.md`。

## 2. 引数・ライセンス

承認済み36の構文、list/check/commit/timeout/memory-limit/cwd/license-file/help/versionを実装。引数不足はcode 2。Work名は完全一致、重複はcode 3。入力・ライセンス・cwdの相対pathは元の呼出元directoryから解決する。

ライセンス取得は読み取り専用で以下の順。

1. `--license-file`を指定した場合、そのファイルのみを使用。
2. 未指定なら同じOSユーザーのDesktop保存先を探索。Windowsは **Roaming** `%APPDATA%\jp.hkdev.tk\license.json`。LocalAppDataではない。
3. 自動探索でファイルなし/未登録の空storeならFree。

`{"key":"v1.…"}`を共通署名検証し製品`tk`を確認する。現行Desktopと同じProfessional判定を用い、新しいfeature制限を導入しない。見つかった不正ファイルや明示ファイルの不備はcode 4。無効keyを消したり、別のkeyへ切り替えたりしない。Desktop未導入・未起動でも明示ファイルで使用可能。別ユーザーのスケジューラ実行では、そのユーザーが読める明示ファイルを使う。

## 3. Workの事前検証

- `validateWorkTypes`の既存Worker profileは維持し、CLI profileを追加。ES2020と実際に公開したWeb APIの宣言だけを読み込む。
- URL/URLSearchParams、TextEncoder/TextDecoder、DOMException、atob/btoa、structuredClone、関数callback timer、queueMicrotaskを提供。Blob/Worker/crypto/fetch等と外部module importは事前診断する。
- Workから到達可能なLogicを構文・symbolで選別し、その実装も同じprofileで検証。固定名/定数computed参照は絞り、alias/shorthand/動的参照は候補を広げる。未使用の非互換Logicは対応Workを妨げない。
- Logicのexport defaultをWork相当の検査用sourceへ変換する。export付きtype/interfaceも許可された本来のLogic形式として処理する。
- `--check`は通常実行と同じ事前検証を行い、Work・Logic・scan・native処理は実行しない。any/Declare/動的生成コードや外部処理の全動作を保証しない。
- Workspace/API世代不一致はGUIで移行・保存するようエラーを返す。CLIが元ファイルを書き換えない。

実通信の確認で、共通`DclNet.getDeclare`がtype aliasをobject型内部へ出していた不備が判明。type宣言を`getTypeDeclare`へ分け、`ApiDeclarations`から共通利用するよう修正。Worker/CLI両profileでgetJson/getText/getHtml/requestと誤用拒否を検証した。

## 4. 出力・native・VFS・停止

- plainはUTF-8 stdout。channelは定義・text・recordをchannelId付きJSON Linesでstdoutへ出す。空channelと複数text/tableを扱う。width等のmetadataを保持する。
- stateはstderr JSON Lines、診断はstderr text。stdoutとstateは各8MiBのwire byte上限。nativeの既存上限も維持。
- stdout/stderr write・出力上限エラーは失敗として保持し、Workがstateの例外をcatchしてもVFS適用を許可しない。
- FS/scan/Excel/DOM/channel/process/HTTPを共通typed dispatchとExecutionIo所有へ接続。未完了native処理やcleanup失敗がある場合は成功/VFS適用を止める。
- timerを終了時に解除し、channel登録とflushを待ってからVFS計画を処理。`--commit`なしで計画があればcode 5。指定時は共通TransactionServiceでverify/applyする。
- TransactionServiceのobserverから状態・確認済み完了件数をRustへ渡す。適用中の中断は完了件数と、実行中操作が変更を残した可能性を診断する。rollbackは行わない。
- 全体timeoutは0無制限。V8 CPU/pending Promiseをwatchdogで止める。メモリはused heap + external検出、Ctrl+Cは別signal threadで受ける。停止後にnative所有処理・直接子processの終了/回収を待つ。
- 同期OS I/O待機やcleanupでは期限を超える場合がある。V8メモリ上限は厳密なprocess RSS上限ではなく、終了処理用の一時的余裕を使う。
- `$fs`の絶対path必須という共通契約は維持。cwdは外部process等のOS実行directoryに作用し、process個別cwd設定があればそちらを優先する。

## 5. 検証とビルド記録

- 共通TS: 型check、61 module境界、CLI/Worker profile 30件成功。
- Desktop: Svelte 0 errors/0 warnings、既存のMCP/API/context/transaction/lifecycle/Workspace/execution検証成功。
- CLI Rust: 引数2件＋ライセンス取得2件成功。clippy release/all-targets `-D warnings`成功。
- 製品releaseビルド成功。`verify-cli.mjs`の38件成功。引数・日本語/空白Work名・check/list・plain/table/multi-channel/state・到達Logic・非互換API拒否・署名エラー・VFS未適用/適用/競合・直接FS・DOM・dataset・process・HTTP・未完了native・cwd・CPU/pending Promise deadline・メモリ停止・無制限で11秒sleep・NodeのPATHなし/リポジトリ外での単独exeを確認。
- loopback HTTP接続は制限環境ではNetworkErrorになったため、同じ38件を通常環境で実行して成功。外部サイトには接続していない。
- `--license-file`なしの実際のDesktop保存済みライセンス探索で、Professional専用`$fs`を含むWorkの`--check`成功。ライセンス内容は出力していない。
- `verify-cancel.ps1`でCLI専用の非表示Windowsコンソールを作り、CPUループ中のCtrl+C、code 130、未適用VFS維持を確認。ツールの親PTYにCtrl+Cを送る方法では親shellごと停止しchild codeを読めなかったため、独立consoleで確認した。fixtureは`generated/`に保存。
- 通常exe配置：`code/apps/cli/target/release/trace-kernel-cli.exe`。SHA-256 `CFBD220996A0B9A61FA19FFD309D2566ECC1D7527D635006E082B0E1C32397B2`。

V8の移動済みtargetキャッシュは旧絶対pathを持っていた。今回のビルドは`RUSTY_V8_MIRROR=https://github.com/denoland/rusty_v8/releases/download`を設定してbuild scriptを再実行し、既存archiveを再利用してlink-searchを修正した。ビルドのtarget-dirだけ`code/experiments/js-host-v8/target`を再利用し、最終exeを通常の`code/apps/cli/target/release`へコピーする。ソース依存は実験ホストにない。通常の新規ビルド手順はCLI READMEの通り。

## 6. 次のステップ

実WorkspaceのWorkを`--check`・通常実行し、GUIと同じ結果になるかを利用者環境で確認する。その後Windows配布・ランタイム依存・同梱ライセンス・ZIP/インストーラ仕様へ進む。実exeのPE importに`VCRUNTIME140.dll`/`VCRUNTIME140_1.dll`を確認したため、クリーンPCで「exeのみで無条件に実行可」とはまだ扱わない。現時点でPATH登録や配布用インストーラは作成していない。

既存の大量の未commit変更とユーザー変更を保護する。stage/commit/push/resetは実施していない。FileUtil.VERSIONのユーザー値`v0.2.0`を維持する。
