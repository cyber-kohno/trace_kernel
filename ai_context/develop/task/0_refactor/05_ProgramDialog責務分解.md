# ProgramDialog責務分解

## 目的

`ProgramDialog.svelte` 周辺は、現行アプリの実行系の中心である。

この資料では、

- 現在 `ProgramDialog.svelte` が何を担っているか
- 何が過剰責務になっているか
- どの単位で分割するとよいか

を整理する。


## 結論

現状の `ProgramDialog.svelte` は、
単なる UI コンポーネントではなく、
`実行オーケストレータ` の役割まで担っている。

そのため、今後の改善では

- 表示
- 実行制御
- Worker bridge
- 出力状態管理
- transaction 管理
- runtime error 反映

を段階的に外へ出すのが妥当である。


## 現在 `ProgramDialog.svelte` が担っている責務

## 1. 対象 work の解決

やっていること:

- `$store.target` から現在の work を解決
- workspace から該当 work を取得
- 実行対象の source を画面へ渡す

問題:

- UI 表示前に、対象データ解決責務を持っている
- workspace / target への依存が強い


## 2. 注入対象コンテキストの構築

やっていること:

- disable 状態を見て env/resource/dataset/process を絞り込む
- Pro ライセンスによる process 利用可否も反映する
- `ContextDataUtil.Props` を組み立てる

問題:

- これは UI より application / domain の責務
- 毎回 `$store` に強く依存している


## 3. Monaco への型注入準備

やっていること:

- 利用可能な reserved API 一覧を解決
- declare 文を生成
- context の declare 文と結合
- `ScriptEditor` へ渡す

問題:

- 実行時 API とエディタ補完準備が UI に同居している


## 4. Editor 状態管理

やっていること:

- `work.source` を更新
- Monaco 初期化完了を保持
- compile エラー状態を保持

問題:

- 編集状態は UI 責務として自然
- ただし `work.source` の更新をグローバル store に直接反映しているため、更新境界が曖昧


## 5. 実行開始制御

やっていること:

- blur / focus の制御
- TypeScript から JavaScript への変換
- source map の取得
- Worker 起動
- 実行フェーズ遷移

問題:

- 典型的な controller 責務
- UI から分離しやすい


## 6. Worker イベント受信と解釈

やっていること:

- stream 作成
- stream 受信
- invoke 仲介
- prepar_end 受信
- done 受信
- runtime-error 受信
- state 受信

問題:

- event の解釈ロジックが大きい
- UI 表示ロジックより複雑で、責務分離の優先度が高い


## 7. 出力チャネル管理

やっていること:

- channels の作成
- active channel の切り替え
- streamRef を使った初期化 / 再読込 / 終了処理

問題:

- 出力ビュー状態の管理責務
- UI に近いが、ロジック量が多い
- stream の状態管理は独立できる


## 8. 実行フェーズ管理

やっていること:

- `coding`
- `prepar`
- `executing`
- `done`
- `error`

の状態遷移を持っている

問題:

- フェーズ遷移は application state 寄り
- UI は現在フェーズを表示するだけでよい


## 9. progress / monitor 管理

やっていること:

- progress 総数 / 現在値の保持
- monitor line の更新

問題:

- 実行時状態であり UI コンポーネントに閉じ込めると再利用しづらい


## 10. runtime error の可視化

やっていること:

- errorFrame 初期化
- sourceMap と stack から marker 反映

問題:

- UI 側処理だが、runtime error の整形・変換は別責務として切り出せる


## 11. transaction 表示制御

やっていること:

- VFS を受け取る
- tx dialog を自動表示する
- transaction ボタンを表示する
- reopen 可能にする

問題:

- 実行完了後の副作用処理まで UI が担っている


## 12. ショートカット登録 / 解除

やっていること:

- `F5`
- `Alt + Enter`
- `Alt + Left`
- `Escape`

に対応

問題:

- ダイアログ固有責務としては自然
- ただし `store.shortcutEvent` を通じた実装になっており、グローバル UI state 依存がある


## 過剰責務になっているポイント

特に重いのは以下である。

1. 実行対象データの構築
2. 実行開始処理
3. Worker イベント解釈
4. 出力チャネル管理
5. transaction 表示制御

この5つは `ProgramDialog.svelte` から切り出す優先度が高い。


## 推奨分割単位

## 1. `programExecutionController`

責務:

- run / cancel
- フェーズ遷移
- transpile 実行
- 実行前準備
- Worker start / terminate

入力:

- work source
- injectional data
- usable utils
- output method

出力:

- phase
- runtime result event


## 2. `programContextResolver`

責務:

- workspace / disables / license から実行用 context を組み立てる
- declare 生成に必要なデータを提供する

現在の対応元:

- `ProgramDialog.svelte`
- `ContextDataUtil.getUsableData` 相当の処理


## 3. `workerBridge`

責務:

- Worker の init / terminate / start
- Worker イベントの受信
- invoke 仲介
- worker id 管理

現在の対応元:

- `workerAdapter.ts`
- `ProgramDialog.svelte` 内の event switch

補足:

- `WorkerAdapter` は bridge 層として再設計しやすい


## 4. `programOutputState`

責務:

- channels
- active channel
- stream 再読込制御
- plain / channel 出力の状態管理

現在の対応元:

- `ProgramDialog.svelte` 内の channels / activeChannelIdx / streamRef 処理


## 5. `programRuntimeState`

責務:

- phase
- progress
- monitor
- hasError
- monaco init 状態

現在の対応元:

- `ProgramDialog.svelte` 内の writable 群


## 6. `programTransactionController`

責務:

- VFS 受領
- tx dialog 表示状態
- transaction ボタン活性

現在の対応元:

- `txCache`
- `isDispTxDialog`
- done 時の auto open


## 7. `runtimeErrorPresenter`

責務:

- sourceMap と stack の整形
- marker 適用
- error frame 用データ整形

現在の対応元:

- `runtime-error` case


## 8. `programShortcutBinder`

責務:

- dialog 表示中のショートカット登録 / 解除

現在の対応元:

- `onMount / onDestroy`


## 分割後の理想イメージ

## `ProgramDialog.svelte`

持つべき責務:

- レイアウト
- ボタン表示
- Editor / Output / TxDialog の組み立て
- controller / state から受け取った値を描画する

持たない方がよい責務:

- Worker event switch の本体
- 実行データの構築
- phase 遷移判断
- stream 再読込ロジック
- tx open 制御


## 分割の優先順位

## 第1段階

- `programContextResolver`
- `programExecutionController`

理由:

- run 処理と context 構築を先に外すと、UI がかなり薄くなる


## 第2段階

- `workerBridge`
- `programRuntimeState`

理由:

- イベント処理の見通しが良くなる


## 第3段階

- `programOutputState`
- `programTransactionController`

理由:

- 出力系とトランザクション系を後から安全に分けやすい


## 第4段階

- `runtimeErrorPresenter`
- `programShortcutBinder`

理由:

- 仕上げとして局所責務を切り出せる


## 先に着手しやすい具体ポイント

最初の一手としては以下がやりやすい。

1. `injectionalData` を作る処理を外に出す
2. `runScript` を controller に外に出す
3. Worker event switch を `handleWorkerEvent` 関数に分離する

この3つだけでも、`ProgramDialog.svelte` の見通しはかなり改善する。


## 現時点の結論

`ProgramDialog.svelte` の問題は、
コード量そのものよりも
`UI であるべき層に application / bridge / runtime state の責務が集中していること`
にある。

そのため Phase 3 では、

- 画面の見た目を変える

のではなく、

- 実行制御を外へ出す
- Worker 橋渡しを外へ出す
- 出力状態を独立させる

ことを主目的として進めるのがよい。
