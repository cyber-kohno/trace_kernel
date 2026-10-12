# HTTP応答とプロセス出力の資源上限

2026-10-13。第4段階の継続。10の実装についてユーザーから動作確認済み・問題なしとの報告を受け、次の資源上限の工程へ進んだ。
本工程はHTTP本文と子プロセス出力の保持量を対象とする。Excel・走査の資源上限、並行数、停止待機上限、Workspace分離は別の工程として残る。
開始時の作業ツリーには10の変更があり、それを維持して追加した。10・11の変更は未コミット。

## 上限と共通境界

`apps/desktop/src-tauri/src/resource_limits.rs` に、Tauriへ依存しない定数とLimitedBufferを置いた。

| 対象 | 上限 | 計測するもの |
| --- | --- | --- |
| HTTP/HTML本文 | 2MiB | reqwestのResponse.chunk()から渡される本文バイト数 |
| 子プロセス出力 | 1要求あたり合計16MiB | stdoutとstderrから読み取るバイト数の合算 |

HTTPの値は既存契約を維持した。processの16MiBは今回設定した初期固定値であり、既存に上限はなかった。実際のWorkの要求に応じた値の見直しは今後可能だが、今回UI設定やAPI引数は増やしていない。
上限値は共通の一か所へ集約し、GUI/将来のCLIに別々の制限を実装する構成を避ける。

LimitedBufferは追加前に上限を確認し、超過chunkを取り込まずエラーにする。余分なバイトを切り捨てて成功させない。上限ちょうどの本文/出力は、正常な終端が確認できれば成功する。
容量は幾何的に増やしつつ、上限を超える容量を要求しない。try_reserve_exactの失敗もエラーへ変換する。

## HTTP

`apps/desktop/src-tauri/src/scraper/api.rs` に本文読込の共通関数read_bodyを追加し、fetch_http/fetch_htmlの両方が利用する。
従来はResponse.bytes()で全本文を保持した後に2MiBを判定していた。現在はchunkごとに追加前に判定するため、本文終端が来ない超過応答でもResponseTooLargeを返す。

Content-Lengthだけを信頼しない。chunked・長さ不明の本文でも実際の受信量で制限する。HEADのContent-Lengthは仮想のGET本文を示し得るので、広告された長さだけを理由に空のHEAD応答を拒否しない。
UTF-8のデコードは全本文の読込後に行う。chunk境界で分割された文字を個別に復号して壊さない。既存の損失変換、status/ok/header/contentType/fetchedAtの契約は維持する。

確保失敗用にLoadError::ResourceExhaustedを追加した。上限超過は従来のResponseTooLargeを使う。
既存run_owned内で読込を行うため、本文受信の停止・deadline・Operation解放の契約は維持する。途中本文は成功値へ変えない。

## 子プロセス

`apps/desktop/src-tauri/src/process.rs` のread_outputをread_to_endから8KiB単位の読込へ変更した。
stdout/stderrが同じOutputBudgetを共有する。一方ずつ16MiBを許す構成ではなく、両方の合計が16MiB以内となる。カウンターの加算はオーバーフローを防ぐ。

stdin書込、stdout読込、stderr読込、Child.waitは引き続き並行して進める。上限超過/確保失敗は既存のエラー経路へ渡し、直接起動したChildのkillとwaitを終えてからOperationを解放する。
kill失敗はcleanup_failedへ残し、処理を安全に解放できたという成功へ変えない。

上限超過時は `Process output exceeded combined stdout/stderr limit (16777216 bytes)` のエラーを返し、切り詰めたstdout/stderrやexitCodeを成功値として返さない。
正常時の文字コード変換、非ゼロ終了コードの返却、バイナリーstdoutの拒否、既存deadlineは維持する。Work/API引数、DTOの成功形、`.trk`の保存形式は変更していない。

Workがこれらのエラーをcatchしなければ、既存のWorkerエラー境界でそれ以前のprintを保存してruntime-errorとし、done/VFSを公開しない。明示的なcatchで継続する規則は維持する。

## 検証

- `cargo test --offline --locked`: 85件成功、子プロセス補助fixture6件ignored。10からRust試験を12件とfixture1件追加した。ignored fixtureは親試験から実際に起動する。
- LimitedBufferの境界ちょうど、超過時の不変性、容量の増加、ゼロ上限を確認した。
- HTTPは実loopback TCPを使用。HTTP/HTMLの境界ちょうど、終端を送らないContent-Length/chunked/長さ不明の超過本文、HEADの大きな広告長、分割UTF-8を確認した。既存の本文キャンセル・deadline・正常応答試験も成功した。
- processは合計境界、各出力が個別には小さい場合の合算超過、整数オーバーフロー、実Childのstdout/stderr/両方の超過後の終了待ちとOperation解放を確認した。小さい試験用上限に加え、実際のrun_owned入口で既定16MiBの超過を確認する試験も追加した。
- ライフサイクルは90件成功（4件追加）。実際のDclNet、ContextDataUtilのprocess APIとWorkerを使い、上限超過/確保失敗のエラーが途中結果やdone/VFSの成功へ変わらず、先行出力を残すことを確認した。native IPC自体は試験境界で置き換えている。確保失敗のUI伝播はエラー注入で確認し、実OOMは起こしていない。
- check相当の全スクリプトをNodeで実行し、Svelte 0 errors / 0 warnings、API宣言/振る舞い、MCP/GUI整合性、Transaction 37件が成功した。本環境にはnpmコマンドがないので10と同じ実行方法を使った。
- `cargo clippy --offline --locked --tests -- -D warnings` は警告なしで成功した。変更したRust/JSの限定整形チェックと `git diff --check` も成功した。

依存は追加していない。Frontendの製品TSは本工程では変更しておらず、Vite buildとQuickJS実験は今回再実行していない。
今回のHTTP/process上限について、GUI/WebView経由の手動確認、Linux/macOS、kill失敗の実OS再現は未確認。10についてのユーザーの動作確認報告を、11の確認結果として流用しない。

## 保証の限界と次の工程

この制限は要求ごとの保持本文/出力バイト量であり、アプリ全体のRSSやすべての割当量を制限するものではない。文字列変換、IPCのJSON/number配列、HTTPの内部バッファ、Vecの余裕容量、同時要求、print/channelの蓄積は別にメモリーを使う。
HTTP送信本文・process stdin/引数には新しい上限を追加していない。子プロセス自身のメモリー/CPUや子孫プロセス、サーバー側の副作用もこの制限の対象外。
Child終了待ちとblocking処理停止待ちに新しいタイムアウトは追加していない。待機上限だけを設け、未解放処理を成功として消す設計にはしない。

次はExcelの読込/展開/Range構築と走査の件数・深度・条件量を個別に設計し、続いて実行ごとの同時native要求数と停止待機/通常終了方針を整理する。
Excelは圧縮されたファイル容量の制限だけではcalamine内部の展開・Range確保まで守れない。先に採用中ライブラリーの境界を確認してから実装する。
その後に他native処理の所有・snapshot/UI所有・第5段階のWorkspace/検証/実行準備を分離し、共通packages/cratesへの移動と製品CLIへ進む。
