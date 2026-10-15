# Codex引継ぎ: 通常終了対応後の実行基盤と次の実装

**2026-10-15公開準備追記:** 最新は [44_公開準備_OSS表記とクリーンWindows検証](44_公開準備_OSS表記とクリーンWindows検証.md)。PartitionAllocの元tree/LICENSEを照合し、未解決OSS表記は3件。利用者確認済みexeを保った更新noticeのcandidate ZIPを検証し、別Windows用のPowerShell 5.1 scriptと利用条件案を追加した。利用単位・再配布の質問は回答待ち、別クリーンWindowsと上流の本文確認は未実施。

**2026-10-15 ZIP利用者確認完了:** 更新ZIPの動作確認に問題なしとの報告を受けた。最新の状態と公開前の確認事項は [43_CLI確認完了と公開準備](43_CLI確認完了と公開準備.md)。次はクリーンWindows、残るOSS表記、本体利用条件の確定。Pro利用単位・再配布等の未決の製品方針を、キー探索などの実装仕様から推定しない。

**2026-10-14 ZIPとV8再ビルド完了:** 最新は [42_ZIP生成と公開前のV8ライセンス判断](42_ZIP生成と公開前のV8ライセンス判断.md)。ZIP配布とglibc数学実装を無効化したV8のsource buildは承認済み。新CLIの39件・Ctrl+C・更新ZIPの全hash/展開実行検証に成功した。次は展開ZIPから実Workを利用者確認し、クリーンWindowsと本体規約・残る上流noticeを確認する。本文の過去段階より42を優先し、次回も次のステップを必ず提示する。

**2026-10-14利用者確認・配布調査:** ユーザーがCLIの通常実行成功を確認した。次の具体案と調査は [41_Windows_CLI配布案と依存調査](41_Windows_CLI配布案と依存調査.md)。初期ZIPを推奨。PEのVCランタイム依存とCargo/npmライセンス候補を調査済みで、配布方式の選択後にnotice/source収集とZIP生成へ進む。

**2026-10-14 CLI実装追記:** 36の引数・39の互換性・ライセンス方針が承認され、`code/apps/cli`に独立した製品CLIを追加した。plain/channel/state出力、CLI APIプロファイルによるWorkとLogicの事前検証、共通native接続、VFS適用、timeout/memory/Ctrl+Cと終了処理を実装。最新は [40_CLI初期実装とライセンス対応](40_CLI初期実装とライセンス対応.md)。本文の過去段階よりこの追記と40を優先する。

**2026-10-14配置追記:** [38_code配下へのプログラム集約](38_code配下へのプログラム集約.md)でプログラム群を`code/`へ移動。現在の起動・検証コマンドはリポジトリ直下の`code/README.md`を参照する。本文のリポジトリ基準の`apps/`・`crates/`・`packages/`・`experiments/`には現在は先頭に`code/`が付く。CLI追加先と引数仕様は承認済み。

**2026-10-14命名追記:** [37_アプリ命名統一とプログラム配置案](37_アプリ命名統一とプログラム配置案.md)でGUIのCargo package／実行名を`trace-kernel`へ変更。CLIの`apps/cli`・`trace-kernel-cli`は承認済み。本文の古い実行名例は当時の案。CLI引数仕様と親フォルダ`code/`への集約は確認待ちであり、CLIアプリの作成・フォルダ移動は未実施。

**2026-10-13追記:** 最新は [35_型宣言assetとchannel_MCPの共通化](35_型宣言assetとchannel_MCPの共通化.md)（2026-10-14）。33のGUI確認は問題なし。CLIアプリを作り始める前には、フォルダ名とコマンドライン引数の仕様を必ずユーザーへ確認する。その後の状態は [32_V8実I_Oとnative所有](32_V8実I_Oとnative所有.md)、[31_共通TypeScriptへの初期移行](31_共通TypeScriptへの初期移行.md)、[30_native_coreへの初期移行](30_native_coreへの初期移行.md)、[29_V8採用とホスト基盤の整備](29_V8採用とホスト基盤の整備.md)、[28_V8ホスト比較とエンジン選定](28_V8ホスト比較とエンジン選定.md)、[27_共通実行入口のRustホスト比較](27_共通実行入口のRustホスト比較.md)、[26_予約APIと共通実行入口](26_予約APIと共通実行入口.md)、[25_Work実行と完了判定の共通化](25_Work実行と完了判定の共通化.md)、[24_dataset走査準備のポート分離](24_dataset走査準備のポート分離.md)、[23_Work context生成の共通化](23_Work_context生成の共通化.md)、[22_contextのI/Oポート分離](22_contextのI_Oポート分離.md)、[21_Work実行プランとAPI権限選択](21_Work実行プランとAPI権限選択.md)、[20_Workspace読込と検証の分離](20_Workspace読込と検証の分離.md)、[19_MCP接続の所有と停止待ち](19_MCP接続の所有と停止待ち.md)、[18_DOMとchannelの資源上限](18_DOMとchannelの資源上限.md)、[17_DOMとchannelの実行所有](17_DOMとchannelの実行所有.md)、[16_snapshot所有とRestart終了調停](16_snapshot所有とRestart終了調停.md) を順に参照する。本資料の「relaunch未保証」は16より前の状態を指す。

作成日: 2026-10-13。別環境のCodexが、この会話なしで続行するための最新時点の引継ぎ。
本資料作成では製品コードを変更せず、全試験の再実行、commit/push、ファイルの外部送信は行っていない。
資料内のファイルパスは、移動先でも使えるようリポジトリルート基準で記載する。

## 1. 最初に確認すること

- 作成元: `C:\app\git\trace_kernel`、Windows / PowerShell。
- ブランチ: `main`。HEAD: `1ce3d49c2c07da6d790124ab62d82da960216a2e` (`save`)。
- **10〜14の実装・試験・資料と本資料は未コミット。HEADをclone/pullするだけでは今回の続きにならない。**
- `git diff`だけではuntrackedファイルが含まれない。第7節の新規ファイルも含め、FrontendとRustを同じ状態で移す。
- 09は2026-10-12の引継ぎに追記した歴史資料。本文には19コマンド、Excel未対応、旧試験件数等の古い記述が残る。現在の状態は本資料、14〜10、実コードを優先する。
- 読む順序: 本資料 → [構成方針](01_共通化の構成方針.md) → [通常終了](14_通常終了時の停止と解放待ち.md) → [同時受付](13_native要求の同時受付上限.md) → [Excel/走査の上限](12_Excelと走査の資源上限.md) → [HTTP/processの上限](11_HTTP応答とプロセス出力の資源上限.md) → [Excelの寿命](10_Excel読込の分離と終了待ち.md)。それ以前の背景・契約は [09](09_Codex引継ぎ.md) と02〜08を参照する。

移動先で最初に実行する読み取り確認:

```powershell
git branch --show-current
git rev-parse HEAD
git -c core.quotepath=false status --short --untracked-files=all
git diff --stat
git diff --name-status
```

移動のためユーザーがcommitした場合、HEAD/statusは当然変わる。その場合は本資料のHEADに戻すのでなく、移動した内容と履歴を確認する。
既存変更はユーザーの作業を含むものとして保護し、reset/revertや古い版の上書きで消さない。

## 2. 到達先と現在地

目的は、GUIで作ったWorkをタスクスケジューラやバッチから、概ね `tracekernel <trkファイル> <work名>` で実行すること。
長期保守性を優先し、独立したRust製CLIとDesktopが共通TS/Rustサービスを利用する構成を目指す。
Tauri実行ファイルへのCLIモード追加、CLIからDesktop内部コードを直接参照する構成にはしない。

現在は移行順序の第4段階（出力完了、実行終了、cancel/dispose、native処理の寿命）の途中。
第1〜2段階のTransactionService抽出、初期修正と回帰テスト、第3段階のJSホスト小規模実験は先行して実施した。
第5段階のWorkspace読込・検証・実行準備・API注入のサービス分離と、第6段階の共通packages/crates移動・製品CLIは未実施。
`apps/cli`、`packages/runtime-core`、`crates/native-core`はまだ追加していない。フォルダを先に一括移動しない。
QuickJSは `experiments/js-host-quickjs/` の小規模検証だけで、採用未確定。実験バイナリーは製品CLIではない。

GUI/CLIでWork実行、API権限、ライセンス、型宣言、Workspace検証の規則を二重実装しない。
共通TSはSvelte/DOM/store/Tauriを直接参照せず、共通RustはTauri State/AppHandleに依存しない境界を目指す。

## 3. 今回までの実装

### 10: Excel読込の境界と寿命

`parser/excel.rs` の実処理をTauri非依存にし、`parser/excel_commands.rs` で任意executionIdの受付、Operation所有、blocking taskの終了待ちを行う。
読込/シート失敗を部分Bookの成功へ変えず、停止前/途中/返却前に協調停止を確認する。
SheetのシリアライズをcamelCaseにして、TSのmaxRow/maxColとの不一致を修正した。公開Book/Sheet/Row/Cell APIは維持する。
ユーザーから問題なしと報告された動作確認は、このExcel分離工程の後。11〜14について同じ手動確認済みと推測しない。

### 11〜12: 処理量の上限

上限の正本は `apps/desktop/src-tauri/src/resource_limits.rs`。
HTTP本文2MiBは受信途中で判定し、processはstdout/stderrの合計16MiBを共有予算で制限する。超過時に部分結果を成功として返さず、通常のprocess経路ではkill/waitまで待つ。
Excelは入力32MiB、ZIP展開合計128MiB/entry16MiB/4096 entries、128 sheets、100,000 cells、Range面積1,000,000 cells、source/output textそれぞれ16MiB等を検査する。
XLSXはcalamineのsparse cell readerを使い、dense Range確保前に実セルの範囲を検査する。XLS/XLSB/ODS等の内部確保まで事前制限できるという保証ではない。
走査は100,000 entries、ディレクトリ深度64、列挙名8MiB、条件128、pattern4096 bytes。除外/深度スキップされた列挙対象も予算へ算入する。
既存の走査条件やlimitDepthの意味は維持する。これらはアプリ全体のRSS/CPUの上限やセキュリティsandboxではない。

### 13: native要求の同時受付

ExecutionIo::registerは停止判定、容量判定、Operation作成を同じMutexで行い、各executionIdの未解放native要求を32に制限する。
枠待ちqueueを追加せず、超過は実処理開始前に拒否する。blocking pool/domain待機中も枠を持つ。解放後の枠は再利用できる。
FS15、scan、Excel、HTTP/HTML、processの計20コマンドが共通枠を使う。TS側の正本は `runtime/native-io-policy.ts`。
RegisterErrorを型付けし、不明ID/停止済み/容量超過を区別する。HTTPではConcurrencyLimitExceededとTooManyRequests（domain制限）を区別する。
stop/disposeは枠を必要とせず、満杯でもcancelと終了待ちを行える。caller abortでblocking taskの枠を早期返却しない。

### 14: 通常メインウィンドウ終了

`runtime.rs` のAppState::shutdown_native_ioは、worker_init/native受付と同じMutexの下で終了ゲートを閉じる。
編集用I/Oと全実行へ先にcancelを通知し、Mutexを離して全Operationの解放を待つ。途中の失敗でも他scopeの待機を飛ばさない。
FS/scan/ExcelのexecutionIdなしの編集・Workspace・Transaction用I/Oも追跡するが、この編集用scopeへ32枠制限は新設しない。
終了開始後の新規Work/I/OはApplicationShuttingDownとして拒否する。worker_initが競合しても停止snapshotの外に新規実行が抜けない。

`service/lifecycle/application-shutdown.ts` はUI/Tauri非依存の終了調停。Entryが未保存確認、native/Worker/MCP停止、Window.closeを接続する。
closeイベントは同期的にpreventDefaultし、確認・待機中の重複closeは同じPromiseを共有する。
未保存確認のキャンセルは何も停止しない。承認後は全参加者を開始してallSettledで待ち、すべて成功した後だけ再入closeを許可する。
失敗時は閉じずにエラーとRetry closeを表示する。停止開始後の受付再開や一定秒数後の強制exitは追加しない。
記録済みcleanup failureは再試行で消さないため、Retryしても閉じられない失敗はあり得る。

`worker-lifecycle.ts` のregistryがWorkerAdapterのdisposeを所有し、新規register/init/startを閉じる。
全WebWorkerを同期的に停止するが、late worker_initを待ってからnative disposeするWorkerSessionの既存契約を維持する。
UIが先にdisposeを始めた場合も成功完了まで登録を保持し、失敗したdisposeは終了待ちから漏らさない。
shutdown自体はoutput/context/recoveryを消さないが、並行する成功したWorker disposeはcontextを削除する。失敗時に全出力が必ず残る保証ではない。

## 4. 変更時に維持する契約

- nativeの実処理終了を待つ。IPC Futureの破棄やタイムアウトだけで「解放済み」にしない。Operationは実処理側が所有する。
- 不明/停止済みexecutionIdをIDなしI/Oへフォールバックしない。
- 未awaitの所有native要求を残したdoneは成功/VFS公開にしない。既存printを残し、cleanup failureを隠さない。
- 停止失敗や処理量超過を成功値/部分DTOに偽装しない。ユーザーWorkの明示catchは従来どおり可能。
- 始まったOS操作/書込やcalamine呼出を強制中断できるとは主張しない。停止はロールバックではない。
- TransactionServiceはerrorだけでなくwarningも適用を阻止する。適用中は最初の失敗で止め、部分適用を記録する。
- トランザクションの複数ファイル原子性、rollback、永続journal、TOCTOU完全解消は未実装。直接FS/HTTP/processの副作用は取り消せない。
- 大きな一括移動・無関係な整形を避け、境界ごとに小さく実装し回帰試験で守る。

## 5. 続行する順序と読むコード

1. 移動したtracked/untrackedとlockfileを確認し、第6節のbaselineを移動先で再実行する。環境起因の実行失敗を製品回帰と区別する。
2. 実GUIで14の通常終了を確認する。Workspace未設定/変更なし、未保存確認のキャンセル後の継続、HTTP/process/Excel/scan実行中のclose、close連打、停止表示と既存画面の高さを確認する。Cancel/再実行/画面破棄も回帰確認する。
3. 残るsnapshot/UI非同期処理の所有を調査し、小さく改善する。`ProgramDialog.svelte` のsnapshotSave、run/cancel/onDestroy、`workspace-recovery-util.ts`、`SystemMenu.svelte` のclear/relaunch、`Entry.svelte` の起動処理を追う。調査候補であり、これらすべてに不具合が確定したという意味ではない。
4. 他native処理の受付/所有、relaunch等の別終了経路を整理する。`parser/dom.rs`、`stream/channel.rs`、`mcp.rs`、`lib.rs` を確認する。DOM/channelは現在Operation未登録で、同期commandがexecutionsのMutex内で処理している。既存の32枠や通常終了の保証を自動的に当てはめない。
5. 必要な寿命境界を整理・確認後、第5段階のWorkspace読込/構造・世代・意味・型検証/実行準備/API権限注入の分離へ進む。FileUtil、Monaco、MCP検証、Vite仮想module/型ライブラリー依存を確認する。
6. 共通サービスをGUIなしで同じ入力/権限/結果として試験できてから、共通packages/cratesと製品CLIへ進む。

14の完了保証はEntryのハンドラー登録後の通常closeだけ。起動途中のclose、直接Window.destroy、plugin-process relaunch、OS強制終了、プロセスkill、WebView crashは未保証。
子孫プロセス制御、Rust process Futureの外部abort時にもkill/waitを完了する独立supervisor、停止待機時間上限は未実装。
MCPは既存stopコマンドの結果を待つが、内部join/descriptor削除失敗の可視化や全request threadの所有は未整理。
recovery snapshotの新たな永続化は行っていない。shutdownはsnapshotを保存/削除する役割を持たず、強制終了後の復旧を保証しない。
全体RSS/CPU、受付前IPC queue、返却DTO、frontend Promise/message量の制限も未実装。
既存の編集用scanのAbortSignalは進捗監視を解除するだけでnative走査の停止命令ではない。ただし14のアプリ通常終了では編集用scopeもcancel対象になる。

## 6. 検証結果と移動先での実行

以下は直前の14実装工程で実行済みの結果。本資料作成時に再実行した結果ではなく、移動先の成功を保証するものでもない。

- Rust: `cargo test --offline --locked` 126件成功、子プロセス補助fixture6件ignored。fixtureは親試験から実際に起動される。
- Rust: `cargo clippy --offline --locked --tests -- -D warnings` 成功。
- TSライフサイクル117件、Transaction37件成功。
- Svelte: 0 errors / 0 warnings。API宣言/振る舞い、MCP/GUI整合性チェック成功。
- Vite製品build成功。source-mapのurl外部化、大きなchunkの既存警告は残る。
- 変更ファイル限定のPrettier/rustfmt、git diff --check成功。
- 14の実GUI/WebView・Linux/macOS確認は未実施。QuickJS実験も10〜14では再実行していない。従前のQuickJS比較21項目成功は04/09の履歴として扱う。

本資料作成時に確認した環境はNode v24.19.0、rustc/cargo 1.97.1。正式な対応下限ではない。
この環境ではnpmを利用できず、既存node_modulesとCargo cacheを使いNodeでcheck相当を個別実行した。
移動先で依存を用意する場合はREADME/Tauriのビルド前提を確認し、lockfileを維持する。新規環境の依存取得には適切なネットワーク権限が必要。

通常のNode/npm環境では `apps/desktop` で:

```powershell
npm ci
npm run check
npm run build
```

npmが使えず、依存とNodeが既に利用可能な場合の同等確認（`apps/desktop` で各コマンドの成否を確認する）:

```powershell
node node_modules/@sveltejs/kit/svelte-kit.js sync
node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
node scripts/check-mcp-api-coverage.mjs
node scripts/test-mcp-api-behavior.mjs
node scripts/test-mcp-context-consistency.mjs
node scripts/test-transaction.mjs
node scripts/test-runtime-lifecycle.mjs
node node_modules/vite/bin/vite.js build
```

`apps/desktop/src-tauri` で:

```powershell
cargo test --offline --locked
cargo clippy --offline --locked --tests -- -D warnings
```

offlineで依存が足りなければ、許可された方法で取得しlockedを維持する。Rust試験には実ファイル、実子プロセス、loopback TCPがある。
全体formatは使わず変更箇所へ限定する。lib.rsをrustfmtする際は `--config skip_children=true` で無関係なmoduleの連鎖整形を避ける。
最後にリポジトリルートで `git diff --check`。行末LF→CRLFのGit警告と、実際の空白差分エラーを区別する。

## 7. 未コミット変更の移動チェックリスト

本資料作成開始時に確認したtracked変更は以下。移動対象の完全一覧は実際のstatusを正本とする。

```text
ai_context/develop/task/2_runtime_foundation/01_共通化の構成方針.md
ai_context/develop/task/2_runtime_foundation/09_Codex引継ぎ.md
apps/desktop/scripts/test-runtime-lifecycle.mjs
apps/desktop/src-tauri/Cargo.toml
apps/desktop/src-tauri/Cargo.lock
apps/desktop/src-tauri/src/blocking_io.rs
apps/desktop/src-tauri/src/execution_io.rs
apps/desktop/src-tauri/src/file_system_commands.rs
apps/desktop/src-tauri/src/lib.rs
apps/desktop/src-tauri/src/parser/excel.rs
apps/desktop/src-tauri/src/parser/mod.rs
apps/desktop/src-tauri/src/process.rs
apps/desktop/src-tauri/src/runtime.rs
apps/desktop/src-tauri/src/scan.rs
apps/desktop/src-tauri/src/scan_commands.rs
apps/desktop/src-tauri/src/scraper/api.rs
apps/desktop/src-tauri/src/scraper/types.rs
apps/desktop/src/app/Entry.svelte
apps/desktop/src/app/contents/detail/program/runtime/native-io-policy.ts
apps/desktop/src/app/contents/detail/program/ui/worker-adapter.ts
```

untrackedの新規ファイル（本資料を含む）。**通常のgit diffのpatchだけでは移らない。**

```text
ai_context/develop/task/2_runtime_foundation/10_Excel読込の分離と終了待ち.md
ai_context/develop/task/2_runtime_foundation/11_HTTP応答とプロセス出力の資源上限.md
ai_context/develop/task/2_runtime_foundation/12_Excelと走査の資源上限.md
ai_context/develop/task/2_runtime_foundation/13_native要求の同時受付上限.md
ai_context/develop/task/2_runtime_foundation/14_通常終了時の停止と解放待ち.md
ai_context/develop/task/2_runtime_foundation/15_Codex引継ぎ_通常終了対応後.md
apps/desktop/src-tauri/src/parser/excel/limits.rs
apps/desktop/src-tauri/src/parser/excel/test_support.rs
apps/desktop/src-tauri/src/parser/excel/tests.rs
apps/desktop/src-tauri/src/parser/excel_commands.rs
apps/desktop/src-tauri/src/resource_limits.rs
apps/desktop/src/app/service/lifecycle/application-shutdown.ts
apps/desktop/src/app/service/lifecycle/worker-lifecycle.ts
```

ユーザーが選ぶ方法で、これらと基礎となるtrackedファイルを一式移す。例えば内容を確認してcommit/pushするか、作業ツリーを完全同期する。本資料作成の依頼をcommit/pushの承認と解釈しない。
通常node_modules、target、build、.svelte-kitは転送せず移動先で再構築できる。秘密鍵、認証情報、個人設定は梱包しない。
Cargoのzip 0.6.6直接依存は12で追加してあるため、Cargo.toml/Cargo.lockも一緒に移す。Frontendの依存追加/更新は10〜14で行っていない。

## 8. 新しいCodexへの開始メッセージ

実装・新規ファイルを移動した後、以下を渡す:

```text
Trace KernelのCLI対応に向けた実行基盤の堅ろう化を、この環境で継続してください。
まず ai_context/develop/task/2_runtime_foundation/15_Codex引継ぎ_通常終了対応後.md を全文読み、
01_共通化の構成方針.md、14_通常終了時の停止と解放待ち.md、13〜10の記録と実コードを確認してください。
09_Codex引継ぎ.mdの本文は一部古いので、現在の状態は15と14〜10を優先してください。

最初にgit statusとtracked/untracked、lockfileの移動を確認し、移動先でbaselineの検証を行ってください。
作成元では10〜14は未コミットでした。既存変更を勝手にreset/revertせず保護してください。
独立Rust CLIとDesktopが共通サービスを利用する方針ですが、まだ製品CLIや共通packages/cratesは追加していません。
QuickJSは実験のみで採用未確定。トランザクションの原子性/rollbackも未実装です。

Excel分離、HTTP/process/Excel/走査の上限、実行ごとのnative受付32枠、通常closeの全停止/解放待ちは実装済みです。
通常終了の実GUI確認とsnapshot/UI・他native処理の所有、別終了経路を優先して調べ、
現在のExecutionIo/blocking_io/WorkerSessionの契約を維持して、小さく実装と回帰試験を進めてください。
手動確認できない範囲は確認済みとせず、利用者への確認依頼を残して独立して進められる調査・実装を進めてください。
未完了処理を消して終了成功にするタイムアウト、フォルダの一括移動、TauriへのCLIモード追加は行わないでください。
```
