# Workerの実行ライフサイクル

2026-10-12。第4段階のうち、Desktop Worker・出力保存・通信・画面破棄の境界を整理した。製品CLIやpackages/cratesへの移動は行っていない。外部I/Oの実処理停止は未実装であり、第4段階全体の完了とは扱わない。

追記: その後、直接の子プロセス・HTTPの停止を実装した。現時点の範囲と残課題は `06_非同期I_Oの停止と子プロセス所有.md` を参照。本書はWorker基盤を整理した時点の記録として残す。

## 変更

- `runtime/stream-flush.ts`: `finish()` と `dispose()` を追加。保存中のバッチと後続バッチを待ち、保存に成功した後だけ表示側へ通知する。バックグラウンドの失敗を保持して終了時に返し、暗黙の再送はしない。
- `runtime/worker.ts`: API生成、遅延Dataset検索、Rust初期化、チャネル作成、Context生成、構文評価、ユーザー実行をエラー境界へ含めた。通常終了・return・runtime.exitとも出力完了を待つ。失敗時もそれまでの出力保存を試みるが、doneやVFSは渡さない。
- `runtime/worker-session.ts`: Worker生成、ID生成、native invoke、表示イベントを注入する実行所有者を追加。Svelte/DOM/Tauriの実行時importはない。これはブラウザWorkerの管理層であり、将来の共通Work実行サービスそのものではない。
- `runtime/worker-protocol.ts` / `worker-post.ts`: Workerイベント型とWorker側送信をDesktop UI adapterから分離。WorkerInvokeとDclChannelからUI adapterへの参照を除いた。DeclareUtilのLicenseState依存などは残っている。
- `ui/worker-adapter.ts`: WorkerSessionへ実際のWeb WorkerとTauri invokeを渡す薄い接続層にした。
- `util/channel/dcl-channel.ts`: チャネル登録Promiseを保持し、初回保存と終了時に観測する。出力が空でも登録失敗は正常終了にならない。ID重複は登録状態を上書きする前に拒否する。
- Rustの `stream/channel.rs`: add_channelとappend_linesが、実行なし・チャネルなし・重複などをResultとして返す。以前のエラー握りつぶしを廃止した。
- `ProgramDialog.svelte`: onDestroyでdisposeを呼ぶ。キャンセル後・破棄後の古い非同期処理から状態を更新したりWorkerを再生成しない。準備失敗・復旧情報の後片付け失敗を画面へ表示する。キャンセル時は保留中の復旧情報保存が終わってから削除する。
- `RuntimeErrorFrame.svelte`: source mapがない準備失敗やWorker障害でもエラーメッセージを表示できるようにした。
- `WorkerInvoke`: 応答のIDだけでなく種別も照合し、成功・失敗・タイムアウト・送信失敗でリスナーとタイマーを解放する。

## 契約

1. 1つのWorkerは1回の実行専用。再実行には新しいWorkerとexecutionIdを使う。
2. ユーザー関数が終了した後、作成したチャネルの登録と出力バッチの保存が成功して初めてdoneを出す。保存完了はRustのメモリ内LineBufferへの反映を指す。永続ファイル保存や全行の画面描画完了は意味しない。
3. 保存失敗時にバッチを再送しない。応答が失敗しただけで保存済みかもしれないため、自動再送による重複を避ける。失敗はruntime-errorとし、トランザクション画面へのVFS引き渡しをしない。
4. done/runtime-errorを受け取ったらWorkerを停止し、その後のイベント・native応答は受け付けない。完了までに受信済みの表示イベントは順にawaitしてから終端イベントを渡す。
5. 表示イベント処理の例外、Workerのerror/messageerrorも失敗へ変換する。表示障害で後続doneを通さない。失敗表示自体が失敗した場合はconsoleへ報告する。
6. 正常終了・失敗後のRust contextは結果閲覧のため保持する。Cancelか画面破棄でworker_disposeする。
7. terminate/disposeは同じ実行に対して冪等。同じ後片付けPromiseを返す。dispose後はinitできない。後片付けが失敗した場合は呼び出し元へrejectし、成功扱いにしない。
8. native応答は呼び出した元の実行に束縛する。旧実行の遅延応答を新Workerへ送信しない。停止時に保留中のworker_initがある場合、それが完了または失敗してからworker_disposeする。初期化が遅れて実行contextを再作成する競合を防ぐ。
9. Cancelは出力の保存完了を待つ正常終了ではない。Workerを即時停止し、未保存出力は破棄し得る。Rust contextの後片付けは非同期で完了する。

## 未解決の範囲

- Worker停止やWorkerInvokeの10秒タイムアウトは、既に開始したRust I/O・通信・子プロセスを停止しない。直接更新APIの副作用を取り消すものでもない。これらを実行単位で所有し、停止要求・待機・解放を結び付ける必要がある。
- awaitしないユーザー非同期タスク全般の完了保証はない。Worker停止以前にnative処理を開始したタスクは継続し得る。出力バリアを、全副作用の完了保証とみなしてはならない。
- Worker初期化や表示処理に無期限の待機がある場合の上限・キャンセル通知は、まだ統一していない。native初期化が応答しなければcontext解放待ちも続く。
- 画面破棄時には復旧snapshotを無条件には削除していない。native実処理が残り得ること、snapshotがアプリ全体で1つの共有状態であることから、実行IDに対応する保存・削除の所有権を別途整理する。
- StreamReceiverの表示用fetch、チャネル切替、source-map処理まで含むUI全体の非同期寿命は未整理。今回のバリアは出力保存とイベント配送の順序を保証するもの。
- Work入力やContext/API注入はまだUI側が作る。成功・失敗・cancelを値として返すGUI/CLI共通のExecutionResultは、次の実行サービス抽出で定義する。
- トランザクションの原子的更新・ロールバック・native側TOCTOUは既存の残課題のまま。

## 検証

- `npm run check`: Svelte/TypeScript 0 errors / 0 warnings、既存MCP API・振る舞い・GUI整合性、TransactionService 37件、今回のライフサイクル35件が成功。
- `npm run build`: 成功。既存のsource-mapによるurl外部化警告と大きいchunkの警告は残る。
- `cargo test -- --nocapture` (apps/desktop/src-tauri): 7件成功。うち3件は今回追加したチャネル重複・存在しないチャネルへの保存・バッチ順序の試験。
- `node experiments/js-host-quickjs/compare.mjs --release`: 従来の21項目が成功。子プロセス起動制限のため、許可された制限外実行で再確認した。

35件には、保存中の追加出力、複数チャネル、保存失敗、dispose中の保存、旧応答、遅延worker_initの成功/失敗、重複停止、非同期表示の順序、Worker障害、表示障害、準備各段階の失敗、return/exit、空チャネルの失敗、実際のテキスト/テーブル出力API、通信リスナーの解放を含む。

テストは本番のWorker・FlushScheduler・WorkerSession・出力APIを読み込み、Web Worker/Tauri/一部API境界をモックする。新テストでは実際のWebViewやTauri GUIは起動していない。Escape、画面閉鎖、チャネル切替の実機回帰確認は残る。

## 次

第4段階の残りとして、native I/Oと子プロセスの所有権、タイムアウト、cancel/disposeを優先する。そこまで確認してから、第5段階のWorkspace読込・検証・実行準備とAPI注入の分離へ進む。
