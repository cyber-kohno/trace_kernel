# native要求の同時受付上限

2026-10-13。第4段階の継続。12の次の工程として、実行ごとのnative要求の同時受付を制限した。
既存10〜12の変更を維持して追加した。commit/push、CLI追加、共通packages/cratesへの移動は行っていない。

## 受付契約

`resource_limits.rs` のNATIVE_IO_MAX_OPERATIONSを初期固定値32とした。GUI設定や公開API引数は追加していない。
ExecutionIo::registerで、停止判定・容量判定・Operation作成を同じMutex内で行う。並列受付でも上限を超えない。
超過要求は直ちにエラーとし、枠待ちのqueueを新設しない。拒否した要求のOperation、blocking task、子プロセス、HTTP通信は開始しない。
受付前のIPCメッセージや引数の確保までを防ぐ仕組みではない。

上限は各executionIdに属する未解放Operationの合計であり、実行回数の通算でも、コマンド別の32でもない。
File15コマンド、走査、Excel、HTTP/HTML、processの計20コマンドで同じ枠を共有する。
HTTPのdomain待機やblocking poolのqueue待機も、既に受付済みのOperationとして数える。正常終了/エラー/停止後にOperationがdropされた枠は再利用できる。
HTTPの要求本文やprocessの引数等の検証より受付判定が先に行われるため、満杯時には引数エラーより受付上限エラーが優先する。

停止状態を容量超過より優先する。stop後は既存Operationが解放されても新規受付を再開しない。
受付上限エラー自体はcleanup failureに記録しない。明示的にcatchして他の処理を続けることを禁止しない。
既存の「未awaitのnative処理を残したdoneは成功/VFS公開にしない」規則も維持する。

## エラー境界

ExecutionIoとAppStateの受付失敗はRegisterErrorに型付けし、ExecutionNotFound / Stopped / ConcurrencyLimitExceededを区別する。文字列の部分一致でエラー種別を判断しない。

- File/process/走査/ExcelのIPCは既存のStringエラーを維持する。超過は `Execution native I/O concurrency limit exceeded (32)`。
- HTTP/HTMLはLoadError::ConcurrencyLimitExceededを新設した。従来のExecutionUnavailable（実行がない/停止済み）、TooManyRequests（domain rate limit）と区別する。
- 既存の不明ID/停止済みのエラー文面とHTTPのExecutionUnavailableは維持した。

processとHTTP/HTMLのcommandは、試験できる通常関数の受付経路へ委譲する形にした。公開成功DTO/API引数は変更していない。
Workがエラーをcatchしなければ、従来どおり先行printを保存してruntime-errorとし、done/VFSを公開しない。
並列に受付済みの要求を、過負荷を理由に受付層だけで勝手に解放しない。通常のWorker終端処理がstopを要求して終了待ちする。

## 停止・解放待ち

worker_stop/worker_disposeは枠を確保しないので、32要求を受付中でも呼べる。
停止時は新規受付を閉じ、全Operationへcancelを通知し、最後のOperation解放まで待つ。AppStateのexecutions Mutexは待機中に保持しない。
満杯でのdisposeも、解放確認前にExecutionContextを消さない。cleanup failureがあれば既存どおりcontextを維持して失敗を返す。
blocking処理の枠はcallerのFutureでなくblocking taskが所有し、caller破棄後やpool待機中でも早期返却しない。実処理が戻るまでstop/disposeの終了待ち契約を維持する。
HTTPはdomain待機から本文受信まで、processは通常のcancel/deadline/エラー経路のkill/waitまで既存の所有を維持する。
新しい停止タイムアウト、強制終了、未完了処理を消して成功を報告するfallbackは追加していない。

## 検証

- `cargo test --offline --locked`: 116件成功、子プロセス補助fixture6件ignored。12から12件追加（ExecutionIo5、AppState1、File/走査/Excel/process各1、HTTP2）。
- 32件ちょうど、33件目の拒否、拒否でactive数を増やさないこと、解放後の再利用、通算32を超える逐次処理、ゼロの試験用容量、実行間の独立性を確認した。
- 64 OSスレッドで受付を競合させ、同時保持が32を超えないことを確認した。
- 満杯でのstop/dispose、同時stop、最後の1要求の解放まで待つこと、待機中も別実行を初期化できること、停止後の受付拒否を確認した。
- 既存blocking試験を満杯へ拡張。caller abort後の枠保持、pool queue内の要求の保持/停止後スキップを確認した。
- File/Excel/走査の共通command受付で超過時の処理非開始、解放後の再試行、実行IDなしの編集用途を維持することを確認した。
- HTTP/HTMLの共通command受付が超過時にloopback listenerへ接続しないこと、エラーのシリアライズ、domain制限との区別を確認した。実HTTP本文受信と実Child起動中も枠を数えるよう既存停止試験を拡張した。
- processの共通command受付で超過時の起動拒否と、1枠解放後に実Childを起動してstdout/exitCodeを得られることを確認した。
- ライフサイクル101件成功（8件追加）。実Worker/APIとWorkerSessionを使い、File/Excel/HTTP/HTML/process/準備scanの受付エラー伝播、先行print、VFS非公開、明示catch、満杯で受理済み要求の停止確認前に終端を報告しないことを確認した。native IPCは試験境界で置き換えている。
- Transaction37件、Svelte 0 errors / 0 warnings、API宣言/振る舞い、MCP/GUI整合性が成功。npmがないためNodeでcheck相当を個別実行した。
- `cargo clippy --offline --locked --tests -- -D warnings`、変更Rust/JSの限定整形、git diff --checkが成功した。

依存追加/更新はない。Frontend製品TSは変更しておらず、Vite buildとQuickJS実験は今回再実行していない。GUI/WebView、Linux/macOSの手動確認は未実施。

## 保証の限界

32はnative受付済みOperation数の上限であり、アプリ全体のRSS/CPU、frontendのRPC Promise/message量、Tauriの受付前queue、返却DTOのシリアライズ量の上限ではない。
Operation解放後もIPCの応答待ちが残る場合があるので、WorkerSession.ownedRequestsの数と必ず一致するとは限らない。
複数実行の合計、executionIdなしの編集/Workspace/Transaction用File・走査・Excelには新しい上限を設けていない。
DOM、channel/print、MCP等、Operation登録を使わないnative処理もこの32枠の対象外。大量のdatasetをPromise.allで準備する既存処理は、32要求超過でエラーになり得る。
大型Excel等を32個受け付けても安全なRSSになるという保証ではない。必要なら用途別の追加予算とアプリ全体の受付を別途設計する。
OS待機/ライブラリー呼出の強制中断、子孫プロセス、OS資源制限は未実装。Rust async process Futureの外部abort時に直接Childのkill/waitを必ず完了する独立supervisorへ変更したわけでもない。
GUIのworker停止ではIPC Futureを外部abortせず既存stop/disposeを使うが、今後の通常終了や独立CLIのホスト停止では、この所有も再確認する。

## 通常終了の調査と次の工程

`Entry.svelte` のonCloseRequestedは、Workspace未設定/未変更ならMCPを停止し、変更ありなら確認後に閉じる。Workの全実行の停止・解放待ちは現行経路に組み込まれていない。
`lib.rs` のwindow event処理もdrag/dropが中心で、Work受付を閉じて全ExecutionContextの終了を待つshutdown境界はない。
今回これらの終了挙動は変更していない。上記のstop/dispose単体試験をアプリ通常終了の完了保証として扱わない。

次は通常終了の共通サービス境界を作る。閉じることが確定した後の新規Work受付禁止、既存全実行への先行cancel、全解放待ち、失敗時に終了成功としない処理を検討する。
未保存確認・MCP停止・recovery snapshot・UI破棄との順序、重複close/late worker_init、unscoped native処理の扱いを確認してから小さく実装する。
強制終了や停止時間上限は、未解放処理の状態を隠さない別契約として扱う。勝手に一定秒数後にexitする仕様は加えない。
その後、他native処理の所有・snapshot/UI所有を確認し、第5段階のWorkspace/検証/実行準備/API注入の分離へ進む。
