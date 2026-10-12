# Codex引継ぎ: CLIに向けた実行基盤の堅ろう化

作成日: 2026-10-12。別環境でこの会話を知らないCodexが作業を継続するための資料。
この文書のパスは、移動先でも利用できるようリポジトリルートからの相対パスで記載する。
作成元は `D:\app\git\trace_kernel`、ブランチは `main`、HEADは `3a9fd63` (`save`)。
**以下の実装と本資料を含む関連資料は、作成時点では未コミット。HEADだけを取得しても再現できない。**

## 1. 最初に読む要点

- 利用者は、GUIで作ったWorkをタスクスケジューラやバッチから実行したい。
- 合意した到達先は、独立したRust製CLIとDesktopが共通サービスを利用する構成。Tauri実行ファイルへCLIモードを追加する方針ではない。
- ユーザーは実装速度より長期保守性を重視している。CLIを急いで追加せず、既存不具合修正、境界の抽象化、テストを順に進める。
- 現在はDesktop内で共通化可能な境界を作っている。製品CLI、`packages/runtime-core`、`crates/native-core` はまだ追加していない。
- 次の実装候補は、Excelファイル読込等のnative処理の実行所有・エラー伝播・終了待ち。第4段階の途中であり、Workspace全体の分離へ進む前に寿命の問題を整理する。
- QuickJSは小規模検証に使っただけで、採用確定ではない。実験用実行ファイルを製品CLIと混同しない。
- 「トランザクション」の名称から、複数ファイルの原子性やロールバックが実装済みと推測しない。

読む順序は、本資料、[構成方針](01_共通化の構成方針.md)、[最新の実装記録](08_ディレクトリ走査の分離と停止.md)。その後、担当箇所の記録と実コードを読む。
移動先では、まず作業ツリーと検証結果を確認する。本資料の件数を移動先で実行済みの結果として報告しない。

## 2. 製品の概要と相談の背景

Trace Kernelは、Workspace (`.trk`) 内にWork、Logic、リソース、dataset等を持ち、GUIでプログラムを編集・実行する製品。
datasetには選択したファイルを使うものと、実行時にディレクトリを検索するものがある。
TypeScript/Monacoの型宣言・検証と、Worker上のJavaScript実行、Rustのファイル・HTTP・外部プロセス・パーサー等が連携している。
出力にはprintとchannelがあり、ファイル変更をVFSへ蓄積して検証・適用する仕組みもある。
APIの利用権限・ライセンス、世代の互換性、Workspaceの検証はGUI/CLIで同じ規則にする必要がある。

- `apps/desktop`: 本製品のTauriアプリ。以前の会話では `app` フォルダと呼んでいた。
- `apps/homepage`: 公式サイト。以前の会話では `homepage` フォルダと呼んでいた。
- その他のアプリは後述の構成方針を参照。今回、公式サイトの改修は対象にしていない。

利用者からの要求は、概ね次の実行入口である。

```text
tracekernel <trkファイルのパス> <workの名前>
```

Workを実行し、print結果を標準出力へ出す。トランザクション更新は検証エラー0の場合だけ適用し、失敗時は理由を出力して停止する。定期実行・バッチ化が用途。
これを別の言語・別の編集環境へ拡張するのではなく、既存Workのもう一つの実行入口と捉える。
ユーザーの懸念は、UIとサービスの密結合のままCLIを追加すると製品の筋や保守性が崩れること。

**現行の安全側の契約では、検証のerrorだけでなくwarningもコミットを阻止する。** 利用者の「エラー0」を理由に、警告を無視して適用する実装へ変更しない。
CLIの厳密な引数仕様、名前の衝突、標準出力/標準エラー、channelの表現、終了コード、警告の扱いは製品CLIを作る前の設計事項として残っている。

## 3. 合意した構成と進め方

到達先の構成。以下は完成済みのフォルダ一覧ではない。

```text
apps/
  desktop/                  Tauri: 編集・対話実行・結果表示
  cli/                      将来の独立Rust実行ファイル
  homepage/                 公式サイト
  mcp/
  license-server/
  generate-license-keypair/
packages/
  runtime-core/             共通TypeScript: Workspace・実行・VFS・API
crates/
  native-core/              共通Rust: I/O・パーサー・外部プロセス等
```

Desktopの起動引数はWorkspaceを開く用途やドラッグアンドドロップのために維持する。
CLIは引数、標準出力/標準エラー、終了コード、JS実行ホストを担当する。
共通TSはSvelteストア、DOM、Tauri invokeに直接依存せず、共通RustはTauri State/AppHandleに依存しない。
CLIがDesktop内部のコードを直接参照するのではなく、両アプリが共通コードの利用側になる。
TSをRustホストへ載せる実際の配布方法やエンジン固有の接続方式は未確定。

| 段階 | 内容 | 現在の状態 |
| --- | --- | --- |
| 1 | トランザクションの回帰テストと不具合修正 | 初期対応済み |
| 2 | UIから独立したTransactionServiceとI/O境界 | Desktop内で抽出済み |
| 3 | RustのJSホストの早期・小規模検証 | QuickJS実験済み。採用未確定 |
| 4 | 出力完了・終了・cancel/dispose・native処理の寿命 | 継続中。Excel等が残る |
| 5 | Workspace読込・検証・実行準備・API注入の分離 | 未実施 |
| 6 | 共通部分をpackages/cratesへ移し、製品CLI追加 | 未実施 |

フォルダを先に一括移動しない。現在の場所で境界を揃え、テストで守ってから移す。
GUI/CLIで型宣言、API権限、検証、Work実行の規則を二重実装しない。

## 4. ここまでの実装

### トランザクション

主な場所は `apps/desktop/src/app/contents/detail/program/runtime/transaction/`。
`transaction-model.ts`、`transaction-io.ts`、`transaction-verify.ts`、`transaction-service.ts` がモデル・I/Oポート・検証・実行セッションを担当する。
Desktop用I/Oの接続は `apps/desktop/src/app/infra/tauri/transaction-io.ts`。
TxDialogはセッションを使って状態と進捗を表示する側になった。

- deleteDirの意図を正規化で保持し、空ディレクトリの非再帰削除を使う。delete_fileの呼出名とrename先の検証パスも修正した。
- error/warningがある場合は書込を始めない。適用中は最初の失敗で停止し、applied/failed/skipped等で部分適用を報告する。
- modifyはmetadataと元の復号済みテキストを検証時・保存直前に確認する。
- plan/snapshotの不変性、並行実行・再入の拒否、適用を試みたセッションの再実行禁止を追加した。検証で止まった場合の再検証は可能。
- 表示用observerの例外で適用処理を壊さない。適用中のダイアログ終了を制御し、部分失敗を表示に残す。

**未保証:** ロールバック、複数ファイルの原子性、永続journal、単一ファイルの原子的置換、TOCTOUの完全解消。
nativeの保存は依然として直接書込。直接の `$fs` 更新、外部プロセス、通信の副作用はVFSトランザクションで取り消せない。

### Workerと出力の寿命

`runtime/worker.ts`、`stream-flush.ts`、`worker-post.ts`、`worker-protocol.ts`、`worker-session.ts` を中心に整理した。
`ui/worker-adapter.ts` は実WorkerとTauriを接続するアダプター。

- 準備・初期化・API生成・ユーザー実行をエラー境界へ含め、worker_initを遅延dataset検索より前にした。
- channel登録と出力appendの完了を待ってから終端通知する。append失敗を正常終了へ変えない。
- 通常returnとruntime.exitは正常終了。文字列/null等のthrowも失敗として扱い、それまでの出力を残す。
- 非同期UIイベントを直列化し、旧実行の応答や失敗が再実行を汚染しないようにした。
- 終端でWorker自体を停止してタイマーを残さない。同時にnative停止を要求し、実処理の終了待ちを終えてからUIの終端を確定する。
- 未完了の所有native要求を残したdoneはエラーとし、VFSを成功として返さない。
- cleanup失敗を区別し、安全に破棄できないnative contextや回復用snapshotを成功扱いで消さない。
- ProgramDialogは破棄時dispose、再実行/Cancel時の終了待ち、遅れた結果の抑制を行う。

実際のTauri GUI操作での回帰確認は未実施。モデル・TS試験の成功をGUI全体の確認済みとしない。

### Rustの実行所有とI/O境界

Rustの基点は `apps/desktop/src-tauri/src/`。

| ファイル | 役割 |
| --- | --- |
| `execution_io.rs` | ExecutionIoとOperation。新規受付の停止、停止通知、実処理の解放待ち、cleanup失敗保持 |
| `blocking_io.rs` | spawn_blocking内へOperationを所有させ、実処理終了まで所有を保つ。協調的な停止確認も提供 |
| `runtime.rs` | 実行context、worker_init/stop/dispose。出力の保持と安全な解放 |
| `process.rs` | 直接起動した子プロセスの所有、deadline、killとwait、並行pipe処理 |
| `scraper/api.rs`・`scraper/types.rs` | HTTPの停止・deadline・エラー契約 |
| `file_system.rs`・`file_system_commands.rs` | Tauri非依存のFS実処理と受付アダプターの分離 |
| `scan.rs`・`scan_commands.rs` | Tauri非依存の走査と受付・進捗アダプターの分離 |

重要な原則は、呼出側Futureの破棄ではなく、実際の処理終了を待つこと。
Operationはblocking closureが持つ。IPC Futureが消えても「native処理は終わった」と判定しない。
存在しない/停止済みexecutionIdをIDなし実行へフォールバックさせない。

現在の所有対象は19コマンド。TSの `runtime/native-io-policy.ts` を正本として確認する。
process/HTTPの3コマンド、ファイル操作15コマンド、scan_directoryが対象。
WorkerSessionが現在のexecutionIdを束縛し、これらにはWorkerInvokeの従来の切り離し型10秒タイマーを適用しない。
process/HTTPはnative側のdeadlineを持つ。その他のコマンドまで全て所有・停止対象になったわけではない。

FSは不存在とエラーを区別し、read/metadata/glob等の失敗を成功値へ偽装しない。
実行IDなしの編集画面・トランザクション用呼出は維持しており、Worker停止の対象外。
これは互換性のための寿命の区別であり、セキュリティsandboxではない。

**停止の限界:** 始まったOS操作や書込は強制中断できず、終了まで待つ場合がある。停止によるロールバックはない。
子プロセスは直接起動したChildが対象であり、子孫プロセス全体やWindows Job Objectsへの対応ではない。
HTTPキャンセルは相手サーバーの副作用を取り消さない。出力/応答/走査の資源上限、アプリ全体の終了方針、停止待機の上限は残課題。

### 直近のディレクトリ走査

- 深度0をルートとし、深度制限では下降だけを止め、現在のディレクトリとファイルを残す。以前の親全体欠落を修正。
- 除外ルートは空ディレクトリとして返し、偽のファイルにしない。列挙・metadata・条件コンパイルの失敗を伝播する。
- 既存のdirectory包含AND、file包含OR、除外優先等の規則は維持した。
- Worker走査は実行所有と協調停止・終了待ちの対象。`dataset-scan-result.ts` がUI非依存でtargetsへ変換する。
- 編集用DatasetScanUtilはscanIdで進捗を識別し、IPC応答を完了の正本にする。finallyで監視を解除し、旧datasetの結果反映を抑制する。
- **編集画面のAbortSignalは監視解除だけで、native走査の停止命令ではない。** WorkerのCancelとは異なる。

走査は原子的snapshotではない。リンク差し替え防御、件数/容量/再帰深度/条件量/並行数の上限も未実装。
scanId追加とprogress_done削除は内部IPC変更のため、FrontendとRustは同じ版で移動・更新する。

### Rust JSホストの小規模検証

`experiments/js-host-quickjs/` は独立Cargo workspace。Desktop本体の依存には追加していない。
rquickjs/QuickJS-NGで、productionのTSコンパイル設定、FS/VFS、正規化、TransactionService、runtime、JSON/CSV等の一部を使った。
Rustホストは実行時にNodeを起動しない。開発用bundleと比較基準にはNodeを使う。

21項目で非同期host呼出、結果比較、停止、資源エラー、host内TypeScriptコンパイルを検証した。
比較先はNode/V8のVMであって、実際のブラウザーWorkerではない。
メモリー上のFSを使い、`.trk`読込、実OSファイル更新、完全なAPI・ライセンス・意味的型検証は実装していない。
実験の実行ファイルサイズは製品CLIの配布サイズではない。TypeScript compiler bundleやWeb API互換性、他エンジンとの比較も検討が残る。

## 5. 次に進める箇所

優先順の提案。新しいコードを読み、前提を確認してから小さく実装する。

1. **Excel等のnative処理の実行寿命。** `src-tauri/src/parser/excel.rs`、`src/app/contents/detail/program/util/parser/excel-parser.ts`、`dcl-parser.ts`、`worker-invoke.ts`、`native-io-policy.ts`、Rustのcommand登録を追う。
2. 資源上限と停止方針。process出力、HTTP応答、走査、並行native要求、子孫プロセス、アプリ通常終了、停止待機の扱い。
3. snapshotとUIの非同期所有、実GUIの終了/Cancel/再実行/画面破棄の確認。
4. 第5段階のWorkspace読込・構造/世代/意味/型検証・実行準備・API権限注入のサービス分離。
5. テストで守られた範囲を共通packages/cratesへ移し、実行エンジンとCLI配布・契約を確定して製品CLIへ進む。

上記1のパスは `apps/desktop/` 配下。
現行excel_parse_fileは同期Tauri commandでファイルを全読込し、calamineで解析する。実行IDの受付・Operation所有はまだない。
worksheet_rangeの失敗をcontinueしているため、部分的な解析結果を成功にしてよいかも検討対象。
既存のBook/Sheet/Row/Cellとユーザー向けAPIの形を不用意に変えない。
既存ExecutionIo/blocking_ioの契約に沿って、純粋処理とcommand受付を分け、失敗・停止前/途中・実処理終了待ちの試験を追加する。
calamineやOS読込自体を強制中断できると主張しない。Stateのロックを重い処理やawait中に保持しない。
DOM等、他パーサーが全て同じ寿命を持つと決めつけず、個別に所有関係を確認する。

第5段階では、FileUtil等に混在するcodec/I/O/dialog/title/Toast/store/世代チェックを調べる。
TypeScriptの型注釈だけをJSONの実行時検証として扱わない。MonacoのhasError確認だけでCLIの意味・型検証を代替しない。
MCP側の既存検証の再利用余地はあるが、Vite仮想moduleや型ライブラリー取得等の依存を確認する。
GUIなしでも同じ実行要求・Capabilities・検証結果を作れることが、製品CLIへ進む前提となる。

## 6. 検証手順と直近の結果

以下は**前回の実装工程で確認した結果**。本資料を作る工程では製品コードを変更せず、全試験を再実行していない。
移動先では依存を用意して再確認する。作成元はWindows、Node 22.18.0、Rust 1.90.0。これは確認環境であり、対応バージョンの正式な下限ではない。
Tauriのビルド前提、lockfile、各アプリのREADMEを確認する。新環境の依存インストールでlockfileを不用意に更新しない。

`apps/desktop` で実行:

```powershell
npm ci
npm run check
npm run build
npm run test:transaction
npm run test:runtime-lifecycle
```

`check`にも両testが含まれる。最後の2行は対象の個別確認用。
直近ではSvelte 0 errors / 0 warnings、既存API検査・MCP/GUI整合性検査、TransactionService 37件、ライフサイクル82件が成功。
buildも終了コード0。従来のurl外部化・大きいchunkの警告は残っている。

`apps/desktop/src-tauri` で実行:

```powershell
cargo test --offline
cargo clippy --offline --tests -- -D warnings
```

直近は60件成功、子プロセス試験用helper fixture 5件ignored。helperは親試験から実際に起動される。
strict Clippyは警告なしで成功。依存キャッシュがない移動先ではofflineのまま実行できないので、環境の許可された方法で依存を取得する。
Rust試験には実ファイル、実子プロセス、loopback TCPを使うものが含まれる。

リポジトリルートで実験を確認:

```powershell
cargo build --release --locked --manifest-path experiments/js-host-quickjs/Cargo.toml
node experiments/js-host-quickjs/compare.mjs --release
cargo clippy --locked --manifest-path experiments/js-host-quickjs/Cargo.toml --all-targets -- -D warnings
git diff --check
```

直近の比較は21項目成功。初回セットアップは `experiments/js-host-quickjs/README.md` を参照。
作成元の制限環境ではesbuild等の子プロセス起動がEPERMになり、許可された実行で検証した。移動先にも同じ制限があるとは限らない。
環境による起動失敗と製品の回帰を区別して報告する。
全体formatで無関係なファイルを変更せず、変更したTS/Svelte/Rustへ整形確認を限定する。

**未確認:** 実Tauri GUI/WebView経由の操作とIPC、Linux/macOS、Windows junction実物、アクセス拒否ACL、ネットワーク共有でのOS待機。
Unixリンク試験は追加したが、Windowsでは対象外。`.trk`からCLIで実行するend-to-end試験もまだ存在しない。

## 7. 資料の位置付け

同じフォルダの記録は累積であり、古い件数・警告・指摘は各段階の状態。
特に00の棚卸しを現在の未修正一覧として扱わず、最新版とコードを照合する。

| 資料 | 内容 |
| --- | --- |
| [00](00_堅ろう化に向けた棚卸し.md) | 最初の調査。既に修正/削除した箇所や古い行番号を含む |
| [01](01_共通化の構成方針.md) | 合意した到達先と進捗 |
| [02](02_トランザクション初期修正.md) | 不具合と初期の回帰試験 |
| [03](03_トランザクションサービス分離.md) | TransactionServiceの契約と保証限界 |
| [04](04_JSホストの小規模検証.md) | エンジン実験の結果・配布コスト・残課題 |
| [05](05_Workerの実行ライフサイクル.md) | Worker/出力/終端の整理 |
| [06](06_非同期I_Oの停止と子プロセス所有.md) | 実行所有、process、HTTP |
| [07](07_ファイルI_Oの境界と終了待ち.md) | FS境界、blocking task所有 |
| [08](08_ディレクトリ走査の分離と停止.md) | 最新工程。走査と編集画面の監視、残課題 |

`ai_context/develop/task/0_refactor/` 等の既存資料は別の経緯として維持する。新たな一括再設計の指示と解釈しない。

## 8. 別環境へ移すときの注意

作成時点では実装・テスト・文書が作業ツリーにある。**clone/pullだけ、あるいはgit diffだけの転送では不足する。**
git diffの通常のpatchにはuntrackedの新規ソース・文書が含まれない。
ユーザーが選ぶ方法で、変更・新規ファイル・意図した削除を一式引き継ぐ。例えば確認した内容をcommit/pushする方法か、作業ツリーを完全に同期する方法。
本資料作成時にはcommit/pushや外部送信を行っていない。

移動前後で、リポジトリルートから次を比較する:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --stat
git diff --name-status
```

commitして移動する場合はHEADやstatusが変わるので、ユーザーの移動方法に合わせて記録を更新する。
特に、新規ファイルとして以下が存在することを確認する:

- `ai_context/develop/task/2_runtime_foundation/` の00から09の資料。
- `apps/desktop/scripts/test-transaction.mjs` と `test-runtime-lifecycle.mjs`。
- Rustの `execution_io.rs`、`blocking_io.rs`、`file_system_commands.rs`、`scan_commands.rs`。
- TSの `runtime/transaction/`、`worker-session.ts`、`worker-protocol.ts`、`worker-post.ts`、`native-io-policy.ts`、`dataset-scan-result.ts`。
- Desktop用 `src/app/infra/tauri/transaction-io.ts` とtx行表示の `DirectoryRow.svelte`。
- `experiments/js-host-quickjs/` のソース、README、スクリプト、独立Cargo.toml/Cargo.lock。

上記は移し忘れやすい新規ファイルの目安であり、転送対象の完全一覧ではない。既存Worker/UI/native/package.json/Cargo.toml等の変更も必要。
tx UI配下の `MakeDirRow.svelte`、`tx-commit-runner.ts`、`tx-verify-util.ts` は意図した削除。コピー方式で古いファイルを復活させない。
Frontendだけ、Rustだけの移動は内部IPCと契約がずれるため避ける。
既存のtracked lockfileと実験のCargo.lockを含め、依存・生成物は移動先で再構築できるようにする。
通常はnode_modules、target、build、.svelte-kit、実験generatedを移す必要はない。秘密鍵・認証情報・個人設定を一括梱包へ混ぜない。
既存のユーザー変更をこの作業以外のものと判定しても、勝手にrevert/resetしない。

## 9. 新しいCodexへ渡す開始メッセージ

以下のメッセージは、実装・新規ファイル・削除を移動先へ引き継いだ後に渡す。

```text
Trace KernelのCLI化に向けた堅ろう化を、この環境で継続してください。
まず ai_context/develop/task/2_runtime_foundation/09_Codex引継ぎ.md を読み、
01_共通化の構成方針.md、08_ディレクトリ走査の分離と停止.md と実コードを確認してください。

独立Rust CLIとDesktopが共通サービスを使う方針ですが、まだCLIを追加する段階ではありません。
長期保守を重視し、現在のDesktop内で境界を整理し、テストを追加してから共通化します。
QuickJSは実験だけで採用未確定です。トランザクションの原子性やrollbackも未実装です。

最初にgit statusと必要な新規ファイル・削除の引継ぎを確認し、移動先でbaselineの検証を行ってください。
既存変更は勝手に戻さず、資料の古い指摘・テスト件数を現在の状態と混同しないでください。
その後、第4段階の残りであるExcel読込等のnative処理の実行所有・エラー・停止/終了待ちを
優先して、小さく実装と検証を進めてください。現行ExecutionIo/blocking_ioの契約を踏襲し、
フォルダの一括移動、TauriへのCLIモード追加、製品CLIの先行実装は行わないでください。
```
