# Store責務整理

## 目的

現状の store 構成を整理し、
Phase 2 でどの単位に分割するかを決めるための下準備を行う。


## 現状の問題意識

現在の状態管理は、`store.ts` を中心に多くの責務が集約されている。

特に以下が混在している。

- ワークスペース本体
- UI 状態
- 一時的なランタイム状態
- アプリ設定
- ライセンス状態

この構成だと、

- どの変更がどこへ影響するか見えにくい
- `$store` 全体購読が増えやすい
- UI 更新とドメイン更新の境界が曖昧

という問題が起きやすい。


## 現状の state 一覧

## `store.ts`

保持しているもの:

- `handlePath`
- `workspace`
- `target`
- `shortcutEvent`
- `dialog`
- `cacheMap`
- `invUnits`
- `disables`
- `snapshot`
- `license`
- `setting`

### 問題点

- 役割の異なる state が1つにまとまっている
- 画面都合の state と、永続化対象の state が同居している
- ランタイム一時状態の入口にもなっている


## `storeWorkspace.ts`

責務:

- workspace モデル定義
- target 定義
- enable / error 判定
- 名前重複チェック
- validateAll

### 問題点

- モデル定義と検証ロジックが同居している
- validation の責務が大きい
- workspace service 的な役割も持っている


## 個別モデル store 群

### `storeEnv.ts`

責務:

- env の型定義

### `StoreResource.ts`

責務:

- resource の型定義

### `storeDataset.ts`

責務:

- dataset の型定義
- scan / choose で使う UI 向け構造も保持

### `StoreProcess.ts`

責務:

- process の型定義

### `StoreWork.ts`

責務:

- work の型定義

### 問題点

- 「純粋なモデル定義」と「UI 用構造」が混在しているものがある
- naming が不統一


## 補助 state 群

### `dirty.ts`

責務:

- 変更有無の管理
- snapshot 比較

### `storeInvalidate.ts`

責務:

- invalidate 単位の管理

### `storeCache.ts`

責務:

- キャッシュ管理

### `StoreSetting.ts`

責務:

- 設定値

### `storeLIcense.ts`

責務:

- ライセンス状態と判定補助


## 責務分類

Phase 2 では、少なくとも以下の単位に分けるのが望ましい。

## 1. Workspace State

含めるもの:

- workspace 本体
- env / resource / dataset / process / declare / work
- handlePath
- snapshot

責務:

- 永続化対象のワークスペースデータを持つ
- ワークスペース読込 / 保存に必要な情報を持つ


## 2. Workspace Validation State

含めるもの:

- disables
- validate 結果
- 重複名判定結果

責務:

- 入力状態の正常 / 異常判定
- enable / error 状態の集約

補足:

- `workspace` 本体から分けた方が、責務が明確になる


## 3. UI State

含めるもの:

- target
- dialog
- shortcutEvent

必要であれば今後含めるもの:

- toast
- modal 状態
- 選択中ビュー状態

責務:

- 表示中の画面状態
- 現在の選択状態
- UI 操作中の一時状態


## 4. App State

含めるもの:

- setting
- license

必要であれば今後含めるもの:

- cli args
- 起動モード

責務:

- ワークスペース非依存のアプリ設定 / 権限状態


## 5. Runtime UI State

将来的に分離したいもの:

- 実行フェーズ
- progress
- monitor
- channels
- transaction dialog 表示状態

責務:

- work 実行時だけ必要な一時状態

補足:

- 現状は `ProgramDialog.svelte` 内部に閉じているが、将来的な controller 分離のため state として独立余地がある


## 分離の優先度

## 最優先

- `workspace` と `ui` の分離
- `license / setting` の分離

理由:

- 参照頻度が高く、影響範囲が広いため


## 次点

- validation 系の分離

理由:

- 現状は `StoreWorkspace.validate` に寄っているため、改修時の影響が大きい


## 後続

- runtime 実行 state の分離

理由:

- `ProgramDialog` 分割とセットで進めた方が自然


## 推奨構成案

例としては以下のような構成が考えられる。

- `workspaceState.ts`
- `workspaceValidationState.ts`
- `uiState.ts`
- `appState.ts`
- `runtimeState.ts`

または、より用途ベースにするなら

- `stores/workspace.ts`
- `stores/workspaceValidation.ts`
- `stores/ui.ts`
- `stores/app.ts`
- `stores/runtime.ts`


## 現時点の分離方針

Phase 2 では、まず以下を目標にする。

1. `store.ts` を唯一の入口にしない
2. コンポーネントが必要な state だけ参照する
3. workspace 操作と UI 操作を別々に更新する
4. validation を workspace モデル定義から少しずつ離す


## 先に手を付ける対象

優先順は以下を推奨する。

1. `dialog`, `target`, `shortcutEvent` を UI state として切り出す
2. `license`, `setting` を app state として切り出す
3. `workspace`, `handlePath`, `snapshot` を workspace state としてまとめる
4. `disables` と validate ロジックを validation 層へ移す


## 現時点の結論

state の問題は「store が多いこと」ではなく、
`責務ごとの境界が弱いこと` にある。

そのため Phase 2 では、

- store の数を減らす / 増やす

ではなく、

- 何の state か
- どの画面から参照されるか
- 永続化対象か、一時状態か

で分けることを基準に進めるのがよい。
