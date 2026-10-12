# Excel読込の分離と終了待ち

2026-10-13。第4段階の継続。対象は `excel_parse_file` と `$parser.excel(filePath)` の実行所有・エラー・停止/終了待ち。
移動先 `C:\app\git\trace_kernel` の `main` / `1ce3d49` で開始し、開始時の作業ツリーはcleanだった。本工程の変更は未コミット。
独立Rust CLIと共通サービスへの構成方針は維持する。第4段階は引き続き継続中。

## 責務と寿命

- `apps/desktop/src-tauri/src/parser/excel.rs`: DTO・OSファイル読込・calamine解析・Bookへの変換。Tauri command/Stateへ依存せず、停止確認を関数として受け取る。
- `apps/desktop/src-tauri/src/parser/excel_commands.rs`: Tauri受付。任意の実行IDを照合してOperationを登録し、既存の `blocking_io::run_checked` へ解析処理を渡す。
- `native-io-policy.ts`: `excel_parse_file` を追加した。所有対象はprocess/HTTP 3、FS 15、scan 1、Excel 1の計20コマンド。
- WorkerSessionが現在実行のexecutionIdを束縛する。Excelにも切り離し型の既定10秒RPCタイマーを適用しない。未完了要求を残したdoneは既存契約に従って失敗となり、VFSを成功として公開しない。

存在しない/停止済み実行IDをIDなし処理へフォールバックさせない。IDなし呼出はWorkerとは別の寿命を持ち、停止済みWorkerがあっても実行できる。
StateのロックはOperationの登録時に短く保持し、OS読込・解析・await中には保持しない。
Operationをblocking closureが所有するため、呼出元Futureの破棄でも実処理が解放されるまで所有を保つ。worker_stop/disposeはこの解放を待つ。

停止はOS読込前、読込後/解析前、workbook初期化後、各シート解析の前後、各行・セル、結果返却前に確認する。
停止時は途中のBookを成功値へ変えない。キュー待機中/開始前の停止と、blocking task終了後の停止確認は既存 `blocking_io` の契約を使う。

## エラーと互換性

- ファイル読込、workbook初期化、worksheet_range失敗をエラーとして返す。シート失敗をcontinueして、それ以前のシートだけを成功にする処理を廃止した。シート解析エラーにはシート名を含める。
- エラーをcatchしないWorkは、それ以前のprintを残してruntime-errorとなる。VFSをdoneで返さない。ユーザーコードが明示的にcatchして継続することは可能。
- `$parser.excel(filePath)`、Book/Sheet/Row/Cellのユーザー向けAPI、ゼロ始まりの座標、空セル・空行・空シートの省略は維持した。
- Rustが `max_row` / `max_col` を返し、TSが `maxRow` / `maxCol` を読む既存の不一致を修正した。SheetのSerializeをcamelCaseにし、公開APIの境界情報がundefinedになる問題を解消した。

commandの任意executionIdとSheetのフィールド名は内部IPCの変更なので、FrontendとRustは同じ版で更新する。
`.trk` の保存形式やAPI権限、トランザクション検証/適用の規則は変更していない。

## 保証の限界

協調停止であり、開始済みOS読込やcalamineのworkbook/worksheet解析そのものを強制中断できない。これらが返るまで停止待ちは続き得る。
ファイル全読込、形式自動判定時のバッファ複製、calamineのRange構築とDTOへの変換には依然として資源上限がない。ファイルサイズ・展開量・シート/行/セル数・同時要求数・全体deadlineや停止待機上限は未追加。
停止のロールバックやファイルの原子的snapshotを保証するものではない。IDなし処理とアプリ通常終了の寿命も引き続き別課題。

他パーサーをExcelと同じ所有関係とみなさない。DOMは既存の実行context内DomStoreを使い、同期commandがexecutionsのロック内で解析/操作している。今回、DOMの受付・ロック・停止方式は変更していない。

## 検証

移動先はWindows、Node 24.19.0、Rust/Cargo 1.97.1。依存は既に利用可能で、インストールは行っていない。
開始時にcheckの全工程を実行し、Svelte 0 errors / 0 warnings、API検査とMCP/GUI整合性、Transaction 37件、ライフサイクル82件、Rust 60件成功/5件ignoredを確認した。

本環境にはnpmコマンドがないため、`package.json` のcheck/buildと同じスクリプトをローカルnode_modulesからNodeで順に実行した。

```powershell
# apps/desktop
node node_modules/@sveltejs/kit/svelte-kit.js sync
node node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
node scripts/check-mcp-api-coverage.mjs
node scripts/test-mcp-api-behavior.mjs
node scripts/test-mcp-context-consistency.mjs
node scripts/test-transaction.mjs
node scripts/test-runtime-lifecycle.mjs
node node_modules/vite/bin/vite.js build

# apps/desktop/src-tauri
cargo test --offline --locked
cargo clippy --offline --locked --tests -- -D warnings
```

- 変更後のcheck相当はSvelte 0 errors / 0 warnings、API検査とMCP/GUI整合性、Transaction 37件、ライフサイクル86件で成功した。TSは4件追加。
- 実際のWorker/DclParser/ExcelParserを使い、解析完了待ち、APIの座標/範囲/表変換、失敗時の出力保持とVFS非公開、明示catchによる継続を確認した。native IPCはテスト境界で置き換えている。
- Excelにも共通の所有試験を適用し、実行ID束縛、10秒RPCタイマー無効、未完了done拒否を確認した。
- `cargo test --offline --locked`: 73件成功、子プロセス補助fixture5件ignored。Rustは13件追加。
- 小さなXLSXを試験内で生成し、実ファイル読込、座標がA1から始まらないシート、空sheet/book、壊れたbook/後続sheet、不存在、読込前/後・workbook初期化後・行/セル変換途中の停止を確認した。
- 受付試験では無効/停止済みID、IDなし/ありの結果一致、エラー後のOperation解放を確認した。OS読込とcalamine初期化後の停止確認を制御ゲートで待機させ、呼出元が生存/abortのいずれでも、ゲート解放と実処理終了までstopが完了しないことを確認した。OSやcalamineそのものの中断を再現した試験ではない。
- XLSX生成用に、calamineが既に使っているzip 0.6.6をdev-dependencyとして追加した。新しいcrate/versionは増やしていない。Cargo.lockはtrace_kernelの直接依存一覧へのzip追加だけを変更した。

本環境のstrict Clippyは、Excelと無関係に既存process.rsの `is_err` 後の `unwrap_err` を警告した。エラーへの参照を `if let Err` で取り出す最小修正を行い、既存の停止/kill/cleanup失敗の意味を維持した。
この修正後、process試験9件成功/補助fixture5件ignored、`cargo clippy --offline --locked --tests -- -D warnings` の警告なし成功を確認した。
Vite buildも終了コード0で成功した。従来のurl外部化・大きいchunkの警告は残る。
変更したRust/TS/JSの限定整形チェックと `git diff --check` も成功した。

本工程の実装後、ユーザーからGUIの動作確認を行い問題なしとの報告を受けた。個別の操作手順・入力ファイル・形式は記録されていないため、全ケースを試験済みとは扱わない。
実際のOS待機やACL拒否、XLS/XLSB/ODS固有の回帰、Linux/macOSは未確認。QuickJS実験は今回再実行していない。

## 次の優先項目

1. 資源上限と停止方針。Excelの全読込/展開/変換、process出力、HTTP応答、走査、同時native要求数、停止待機の扱いを個別に設計する。
2. 他native処理の所有・ロック・エラー契約。DOM等の既存context所有と、同期commandでの重い解析を個別に調べる。
3. 実GUIでの終了/Cancel/再実行/画面破棄、snapshot/UIの非同期所有、アプリ通常終了、子孫プロセス。
4. 第5段階のWorkspace読込・検証・実行準備・API注入の分離。その後、共通packages/cratesへの移動と製品CLIへ進む。
