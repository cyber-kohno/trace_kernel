# Trace Kernel CLI

GUIで保存した`.trk`のWorkを、独立したV8ホストで実行する。Desktopの起動、WebView、Node.jsは実行時に不要。共通TypeScript/Rustサービスを使用し、実験用ホストには依存しない。

## ビルドと検証

以下はリポジトリ直下から実行する。ビルドにはNode.js/npm、Rust、WindowsのC++リンク環境が必要。通常の開発ビルドではCargoがV8のビルド済みライブラリを取得する。配布用には後述のsource buildを使う。

```powershell
npm ci --prefix code/packages/runtime-core
npm --prefix code/packages/runtime-core run check
npm --prefix code/packages/runtime-core run build:assets
cargo build --locked --release --manifest-path code/apps/cli/Cargo.toml
cargo test --locked --release --manifest-path code/apps/cli/Cargo.toml
cargo clippy --locked --release --manifest-path code/apps/cli/Cargo.toml -- -D warnings
node code/apps/cli/scripts/verify-cli.mjs
# Windows Ctrl+Cの追加検証（PowerShell 7）
& ./code/apps/cli/scripts/verify-cancel.ps1
```

出力先は`code/apps/cli/target/release/trace-kernel-cli.exe`。共通JS/compiler/TypeScript標準ライブラリとICUデータは埋め込まれる。build.rsでassetのSHA-256とbyte数を確認する。実行時の外部processは、Workの設定に応じて別途必要。

検証scriptは`--binary <実行ファイルの絶対パス>`でも実行できる。短いtimeoutを使うため、重いビルドと同時に実行しない。fixtureはGit対象外の`generated/`に作成される。

## 実行

```powershell
& 'C:\app\git\trace_kernel\code\apps\cli\target\release\trace-kernel-cli.exe' --help
& 'C:\app\git\trace_kernel\code\apps\cli\target\release\trace-kernel-cli.exe' --list 'C:\work\sample.trk'
& 'C:\app\git\trace_kernel\code\apps\cli\target\release\trace-kernel-cli.exe' --check 'C:\work\sample.trk' 'Work名'
& 'C:\app\git\trace_kernel\code\apps\cli\target\release\trace-kernel-cli.exe' 'C:\work\sample.trk' 'Work名' --timeout 60
$LASTEXITCODE
```

引数不足はエラー。Work名は大文字・空白・日本語を含め完全一致。重複名は拒否する。`--`以降はoptionとして解釈しない。

| Option | 内容 |
|---|---|
| `--list` | Work名とmethodのJSON配列をstdoutへ出す |
| `--check` | Workspace・ライセンス・Workと到達可能Logicの型/APIを検証。Work/Logic/native I/Oを実行しない |
| `--commit` | Work成功、出力完了、未完了native処理がないことを確認してVFSを適用。通常実行だけで使用可 |
| `--timeout <SECONDS>` | 全体の時間上限。整数。初期値0は無制限 |
| `--memory-limit <MIB>` | V8 used heap + external memoryの検出上限。整数64〜512、初期値256 |
| `--cwd <DIRECTORY>` | Workの実行directory。初期値はtrkの親。既存directoryが必要 |
| `--license-file <FILE>` | 署名付きライセンスJSONを明示指定 |
| `--help` / `-h` | 使用方法 |
| `--version` / `-V` | CLI版とWorkspace/API世代 |

Workspace/ライセンス/`--cwd`の相対パスは呼出元directoryから解決してからdirectoryを切り替える。共通`$fs`の絶対パス必須の契約はGUIと同じ。外部processの個別cwd設定はCLIのcwdより優先する。

`--commit`が制御するのはVFSの適用のみ。直接`$fs`、process、HTTPの処理はWork実行中に行われる。適用済み変更の自動rollbackは行わない。適用中の中断は、確認済みの完了件数と実行中操作が変更を残した可能性をstderrに報告する。

## ライセンス

優先順位は、明示`--license-file`、同じOSユーザーのDesktop保存済みライセンス、Free。Windows保存先は`%APPDATA%\jp.hkdev.tk\license.json`で、形式は`{"key":"v1.…"}`。CLIでも共通の署名・製品検証を行う。

Desktopは未インストール・未起動でも実行可能。明示ファイルでProfessionalを利用できる。自動探索でファイルがない/未登録の空storeならFree。見つかった不正ファイルや明示ファイルの不備はcode 4とし、別ライセンスへ切り替えない。保存ファイルを変更・削除しない。

タスクスケジューラ等で別ユーザーとして実行する場合は、そのユーザーが読めるライセンスファイルを明示指定する。Freeでは共通サービスが許可するAPI/contextだけを提供する。

## 出力と対応Work

plainはUTF-8 textをstdoutへ出す。channelは定義をデータより先にJSON Linesで出力する。

```json
{"type":"channel","channelId":"LOG","view":"text","detail":{}}
{"type":"text","channelId":"LOG","text":"開始\n"}
{"type":"channel","channelId":"ROWS","view":"table","detail":[{"name":"count","type":"number"}]}
{"type":"record","channelId":"ROWS","record":{"count":2}}
```

空channel、複数channel、text/table混在に対応。同じchannel内の順序を保持する。列幅等はmetadataに残し、表の描画は行わない。`$state`通知はstderrへJSON Lines、診断はstderrへtextを出す。stdoutとstate通知はそれぞれ8MiBのwire byte上限。既存native資源上限も維持する。write/上限エラーは成功扱いにせずVFS適用を止める。

CLI向けのES2020＋検証済みURL/encoding/base64/clone/timer/DOMException/queueMicrotask宣言を使う。Blob、Worker、crypto、fetch、browser画面操作等の未提供APIと外部module importを事前診断する。未使用の非互換Logicだけを理由に対応Workを除外しない。呼出先が動的ならLogic候補全体を検証する。

`--check`はファイルの存在やprocess/通信の成功、any/Declare/動的生成コードの全動作を保証しない。実行はセキュリティsandboxではない。Workspace/API世代が違う場合はGUIで移行・保存してから使う。

## 終了コード

| Code | 内容 |
|---|---|
| 0 | 成功 |
| 1 | Work/native/メモリ/出力/VFS適用/終了処理の失敗 |
| 2 | 引数・option不備 |
| 3 | Workspace・世代・Work選択・型・未対応APIのエラー |
| 4 | ライセンスエラー |
| 5 | 未適用VFS計画あり。`--commit`が必要 |
| 124 | 全体timeout |
| 130 | Ctrl+C中断 |

失敗前に出力された途中結果は残る。終了コードで成否を判断する。Ctrl+C/timeout時は新規native受付を止め、所有する直接子processの終了・回収を待つ。同期OS I/Oの待機やcleanupが期限を超える場合がある。メモリ上限は厳密なprocess RSS上限ではなく、超過検出時には終了用の一時的heap余裕を使う。

## Windows配布用V8と内部ZIP

初期ZIP・PATH自動変更なし・公式VCランタイム別導入は承認済み。V8は固定150.4.0から、glibc数学実装を無効にして再ビルドする。ES2020 profileにないTemporalもbuild対象から外す。詳細は [42_ZIP生成と公開前のV8ライセンス判断](../../../ai_context/develop/task/2_runtime_foundation/42_ZIP生成と公開前のV8ライセンス判断.md) を参照する。

PowerShell 7、Python 3、Windows C++ toolchainが必要。ビルド用GN/Ninja/Chromium toolchainと省略された固定ICUデータの初回取得にはネットワークが必要。生成物は`generated/`内に保存する。

```powershell
# 開発ビルドの元archiveを検査用に保存してから、source-built V8でCLIを再linkする。
# 通常の開発cargo buildを一度行った状態で実行する。
& ./code/apps/cli/scripts/build-cli-no-libm.ps1 -Python 'C:\path\to\python.exe'
# V8 source build済みの場合
& ./code/apps/cli/scripts/build-cli-no-libm.ps1 -UseExistingV8Build
node code/apps/cli/scripts/verify-cli.mjs
& ./code/apps/cli/scripts/verify-cancel.ps1
node code/apps/cli/scripts/collect-release-notices.mjs
& ./code/apps/cli/scripts/package-windows.ps1 -InternalPreview
& ./code/apps/cli/scripts/verify-package.ps1
```

通常の`cargo build`へ戻すと事前ビルドV8へ戻るため、配布前は専用scriptで再linkする。archive member、GN設定、旧glibc定数表の不在、exe SHA-256を`generated/cli-no-libm-receipt.json`へ記録し、同じexeの配布noticeへ同梱する。既存ZIPがある場合は名前を変えて保存してから再生成する。

現在のZIPは内部確認用。本体利用条件、未解決の上流notice、開発環境のないWindowsでの確認が公開前の残作業。

2026-10-14にsource build・CLI再linkが完了した。数学・Intlを含む39件、Windows Ctrl+C、更新ZIPの591 manifest entryと展開後のPATH空での実行検証に成功。次は展開ZIPでsample・実Workを利用者確認する。

2026-10-15にユーザーからZIPの動作確認に問題なしとの報告を受けた。利用者確認は完了し、次はクリーンWindows・OSS表記・本体利用条件を含む公開準備。[43_CLI確認完了と公開準備](../../../ai_context/develop/task/2_runtime_foundation/43_CLI確認完了と公開準備.md)に確認事項を記載した。

その後PartitionAllocの元tree/本文を照合し、未解決OSS表記は3件になった。[44_公開準備](../../../ai_context/develop/task/2_runtime_foundation/44_公開準備_OSS表記とクリーンWindows検証.md)に証拠・candidate ZIPと残作業を記録した。

- 開発環境のないWindowsでの確認：[CLEAN-WINDOWS-CHECK.md](distribution/CLEAN-WINDOWS-CHECK.md)。Windows標準PowerShell 5.1を使用する。開発PCでのscript検証済み、別Windowsでの実行は未確認。
- 製品方針の確認用：[TERMS-DRAFT.md](distribution/TERMS-DRAFT.md)。Professionalの利用単位とZIP再配布範囲は決定済み。正式な利用許諾文ではなく、配布ZIPへは同梱しない。
- 上流への未送信文案：[UPSTREAM-NOTICE-QUESTIONS.md](distribution/UPSTREAM-NOTICE-QUESTIONS.md)。

既存ZIPを保持して別folderへ梱包する場合は、`package-windows.ps1 -InternalPreview -OutputDirectory <新しいdirectory>`を使用できる。`verify-package.ps1 -Archive <生成したZIP>`で検証する。製品CLIの引数とは別の開発用scriptのoption。

依存調査を再生成する場合：

```powershell
node code/apps/cli/scripts/inspect-release.mjs
```

`generated/release-audit/report.json`と`report.md`を生成する。Cargo metadataとlocal packageを読み取り、PE import、固定version、license本文候補のhashを記録する。ZIP生成やruntime導入は行わない。このinventoryだけでlicense確認完了とは扱わない。
