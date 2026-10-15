# 予約APIと共通実行入口

2026-10-13。第5段階の継続。ユーザーから、動作確認または設計判断が必要になるまでは続けて実装する指示を受けた。

## 変更

- `service/execution/create-reserved-api.ts`に予約API生成の境界を追加した。plain出力の改行処理、channelの列名検証・出力整形、progress/monitorの状態と通知は共通処理。ファイル・network・runtime・parserのAPIオブジェクトとchannel登録・出力書込はホストから渡す。
- `DeclareUtil.createUtilObject`はWorkerの出力キューと各APIのアダプターを渡す。`DclChannel`はnative登録・所有・重複IDの管理を担当し、API生成は共通処理に委譲する。`DclState`も共通処理にWorkerへの通知関数を渡す。
- `service/execution/run-work.ts`はコンパイル済み実行プランとホストを受け、初期化、予約API生成、dataset準備、準備通知、出力先準備、context生成、Work実行、登録・出力完了待ちを接続する。Workerはこの入口にnative要求と通知を渡す。
- プラン選択とコンパイルは呼出元で済ませる。実行入口はライセンス検証済みかどうかを独自に判断しない。共通コードのpackagesへの移動と製品CLIの追加は未実施。

## 確認

- `npm run check`通過。型エラー・警告0件、MCPのAPI網羅性・挙動・GUI整合性も通過。
- transaction 37件、runtime 134件、Workspace 5件、Work実行プラン2件、context/ホスト接続7件、Work実行3件が成功した。
- 新規の接続試験では、実行プランから予約API、走査、resource/logicを含むcontext、Workの出力とstate通知、完了待ちまでをGUIなしで実行した。channelの重複列を登録前に拒否し、既存形式のbatchを生成することも確認した。
- 実GUIでの今回の変更の確認はまだ行っていない。

Rustの独立ホストから同じ実行入口を使う比較と、製品化前の判断は [27_共通実行入口のRustホスト比較](27_共通実行入口のRustホスト比較.md) を参照。
