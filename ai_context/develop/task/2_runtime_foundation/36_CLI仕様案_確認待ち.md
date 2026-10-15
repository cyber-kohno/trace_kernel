# CLI仕様（引数承認済み・実行互換性整理中）

2026-10-14。**フォルダ名・Cargoパッケージ名・実行名・code配下への集約と、以下の引数仕様はユーザー承認済み。初期版の引数不足はエラーとし、対話で補完しない。CLIアプリはまだ作成していない。** 表形式/複数channelを含むWorkの実行互換性と事前チェックの整理は [39_CLI実行対象と出力互換性の整理](39_CLI実行対象と出力互換性の整理.md) を参照。共通実行基盤は35、命名変更は37、現在の配置と操作手順は38とcode/README.mdを参照する。

## 1. 名前と配置

| 項目 | 提案 |
|---|---|
| アプリのフォルダ | `code/apps/cli` |
| Cargo package | `trace-kernel-cli` |
| コマンド／Cargo binary | `trace-kernel-cli` |
| Windows実行ファイル | `trace-kernel-cli.exe` |

独立したRust/V8アプリとして、共通runtime-core/native-coreと生成assetを利用する。配布binaryにはJS/compiler/標準lib/ICUを含め、利用時にNodeやGUIの起動を必要としない構成にする。

ユーザー承認により、Tauri側もCargo package／実行名を`trace-kernel`、Windows実行ファイルを`trace-kernel.exe`に揃える。Rust内部の識別子はsnake_caseを維持する。プログラム群の親階層は承認済みの`code/`とし、Tauri側は`code/apps/desktop`に配置する。

実行ファイルの絶対pathを指定して引数を渡す使い方に対応し、PATH登録を必須にしない。初期配布はZIP展開・PATH自動変更なしを提案中。インストーラ同梱やPATH追加optionは未確定。

```powershell
& "C:\tools\TraceKernelCLI\trace-kernel-cli.exe" "C:\jobs\daily.trk" "日次集計" --commit
```

## 2. 基本構文

```text
trace-kernel-cli [OPTIONS] <WORKSPACE_FILE> <WORK_NAME>
trace-kernel-cli --check [OPTIONS] <WORKSPACE_FILE> <WORK_NAME>
trace-kernel-cli --list <WORKSPACE_FILE>
trace-kernel-cli --help
trace-kernel-cli --version
```

- 1回の起動で1つのWorkを実行する。
- 必須引数不足はusageをstderrに出して終了code 2。対話的なファイル選択・Work選択・引数補完をしない。help/version/listの必要引数はそれぞれのmodeに従う。
- Work名は保存されたnameと完全一致。大文字小文字、空白、日本語を保持し、trimや部分一致をしない。同名Workが複数ある場合は曖昧として拒否する。
- Workspaceは既存のgzip/Base64 `.trk`形式。ファイルの拡張子だけで内容を判定せず、共通の読込・世代判定・検証を行う。
- 相対Workspace pathは呼出元のcurrent directoryから解決する。空白を含むpath/Work名はshell側で引用符で囲む。`--`によるoptionの終端も受け付ける。
- GUIと同じcontext検証・API権限選択を利用し、選択Workの型検証を実行前に行う。API不足等の診断がある場合はWorkを開始しない。
- 世代更新が必要なWorkspaceはCLIで自動更新せず、GUIでの移行を案内して終了する。古いAPI世代のwarningも事前エラーとし、GUIでの確認・保存を案内する。新しい世代・世代情報欠損は拒否する。

## 3. オプション

| オプション | 仕様・初期値 |
|---|---|
| `--check` | 指定Workの読込・世代・context/API・型検証まで。Work本体の実行なし。正常時stdoutは空、終了code 0 |
| `--list` | Work名と出力方式をJSON配列でstdoutへ出す。Work名引数なし。Work本体の実行なし |
| `--commit` | Work完了後、VFSのtransaction計画を検証して適用する。未指定で計画があれば未適用・終了code 5 |
| `--timeout <SECONDS>` | 処理の時間上限。0または正の整数。初期値0＝時間制限なし。読込/準備・検証・実行・出力・transactionを対象とする |
| `--memory-limit <MIB>` | V8 used heap + external memoryの超過検知基準。整数64〜512MiB、初期値256MiB |
| `--cwd <DIRECTORY>` | Workの実行directory。未指定はWorkspaceファイルの親directory |
| `--license-file <FILE>` | GUIと同じ`{"key":"v1.…"}`形式のlicense.jsonを読む。共通署名検証でProfessionalを判定。未指定は同じOSユーザーのDesktop保存済みライセンスを探索し、未登録ならFree |
| `--help` / `-h` | 使用方法をstdoutへ表示し終了code 0 |
| `--version` / `-V` | CLI版とWorkspace/API世代をstdoutへ表示し終了code 0 |

`--list`と`--check`は互いに排他的。`--commit`は実行modeだけで受け付ける。不要なpositional引数、未知のoption、数値の範囲違反は終了code 2。

Workspace/--cwd/--license-fileの相対pathは、実行directoryを切り替える前に呼出元directoryから絶対化する。`--cwd`は存在するdirectoryを指定する。

`--commit`が制御するのはVFSから生成されるtransactionの適用。Work本体の直接ファイル操作、外部process、HTTPは通常通り実行する。`--check`はWorkを呼び出さない。

時間超過/Ctrl+C/メモリ超過は新規native受付を閉じ、V8と所有するI/Oの停止を要求し、実解放を待つ。協調停止できないOS待機がある場合、終了までの時間が--timeoutを超えることがある。メモリ値はプロセス全体/RSSの厳密上限ではない。HTTP/process/Excel/channel等は共通coreの既存資源上限を維持する。

## 4. 出力

- `plain` Work: `$print/$println`のtextをUTF-8でstdoutへ出す。
- `channel` Work: channelを識別できるJSON LinesをUTF-8でstdoutへ出す。初期版は出力directoryやchannel別ファイル名を新設しない。
- エラー・診断・transaction未適用の案内はstderrへ出す。通常実行の成功は終了codeで示す。
- `--list`は`[{"name":"日次集計","method":"plain"},…]`の形。名前に改行等が含まれてもJSONで識別できる。

channel出力の案:

```json
{"type":"channel","channelId":"LOG","view":"text","detail":{}}
{"type":"text","channelId":"LOG","text":"開始\n"}
{"type":"channel","channelId":"ROWS","view":"table","detail":[{"name":"count","type":"number"}]}
{"type":"record","channelId":"ROWS","record":{"count":2}}
```

textはflushされた断片、tableはrecord単位。同じchannel内の順序を維持する。stdoutへGUI用の進捗や内部ログを混ぜない。

## 5. 終了code

| code | 意味 |
|---:|---|
| 0 | 成功（必要なtransaction適用とnative解放まで完了）、check/list/help/version成功 |
| 1 | 実行・native I/O・メモリ・出力・transaction検証/適用・cleanup等の失敗 |
| 2 | 引数の誤り |
| 3 | Workspace読込/世代/構造/選択Work/型検証の失敗 |
| 4 | 明示指定したライセンスの読込・形式・署名検証失敗 |
| 5 | VFS計画があり、--commit未指定のため未適用 |
| 124 | 時間超過 |
| 130 | Ctrl+Cによる中断 |

Workが呼ぶ外部processの非zero exitCodeはWorkへ返し、Work側のエラー処理に従う。CLIの終了codeへ自動的に転記しない。transaction途中の失敗は終了code 1とし、適用済み件数と失敗位置をstderrへ出す。

## 6. 使用例

```powershell
# Work実行（VFS計画の適用を許可）
trace-kernel-cli "C:\jobs\daily.trk" "日次集計" --commit

# 定期処理の制限とProfessionalライセンスを指定
trace-kernel-cli "C:\jobs\daily.trk" "日次集計" --commit --timeout 600 --memory-limit 256 --license-file "C:\jobs\license.json"

# 実行前の検証
trace-kernel-cli --check "C:\jobs\daily.trk" "日次集計" --license-file "C:\jobs\license.json"

# Work一覧
trace-kernel-cli --list "C:\jobs\daily.trk"
```

## 7. 確認と次のステップ

名前・親階層・引数構文/optionは承認済み。38の配置整理もユーザー確認済み。39でWork実行対象、表形式/複数channel、state表示の扱いとCLIホストの対応APIに基づく事前チェックを整理し、CLIのCargo構成、引数parser、asset embed、実WorkspaceからWork実行への配線、stdout/stderr/終了code、回帰試験へ進む。

引数仕様の事前確認条件は満たした。CLI側の出力writerと対応APIチェックの実装では、39の互換性整理を反映する。
