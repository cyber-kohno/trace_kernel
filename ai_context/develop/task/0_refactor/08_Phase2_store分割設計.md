# Phase 2 Store分割設計

## 目的

現行の `store.ts` 中心の状態管理から、
責務ごとに分離された store 構成へ移行する。

本フェーズでは、

- state の責務境界を明確にする
- UI 状態とワークスペース状態を分ける
- validation を独立した責務として扱う
- 後続の ProgramDialog 分割に備える

ことを目的とする。


## 現状の問題

現在の `store.ts` は以下をまとめて持っている。

- workspace 本体
- workspace ファイル情報
- target 選択状態
- dialog 状態
- shortcut 登録
- validation 結果
- snapshot
- license
- setting
- cache / invalidate

この構成だと、以下の問題がある。

1. 変更の影響範囲が広い
2. `$store` 全体購読が増える
3. UI 状態とドメイン状態の区別がない
4. validation が workspace モデルと密結合している
5. 実行系分離の前提が作りにくい


## 分割方針

## 基本方針

store は「データの種類」ではなく、
`責務` と `ライフサイクル` で分ける。

判断軸は以下。

- 永続化対象か
- UI 一時状態か
- validation 結果か
- 実行中だけ必要な状態か
- ワークスペース非依存のアプリ状態か


## 採用する store 構成

Phase 2 では、以下の5系統へ分ける。

1. `workspace-store`
2. `workspace-validation-store`
3. `ui-store`
4. `app-store`
5. `runtime-store`（Phase 2 では準備レベル）


## 1. `workspace-store`

### 役割

ワークスペースそのものと、ワークスペースファイルに関する情報を持つ。

### 持つもの

- `handlePath`
- `workspace`
- `snapshot`

### 持たないもの

- `dialog`
- `target`
- `shortcutEvent`
- `license`
- `setting`
- `disables`

### 理由

- ワークスペース保存 / 読込対象として意味がまとまる
- file 操作系ユースケースと相性が良い


## 2. `workspace-validation-store`

### 役割

workspace に対する validation 結果を持つ。

### 持つもの

- `disables`

将来的に持ちうるもの:

- duplicate 情報
- validation detail
- error summary

### 持たないもの

- workspace 本体
- dialog / target

### 理由

- validation は「状態そのもの」ではなく「状態の評価結果」であるため
- workspace モデルと切り離すと責務が明確になる


## 3. `ui-store`

### 役割

画面表示や選択状態など、ワークスペースとは別の UI 状態を持つ。

### 持つもの

- `target`
- `dialog`
- `shortcutEvent`

将来的に持ちうるもの:

- toast
- open panel
- focus 状態
- preview 状態

### 理由

- UI 状態は永続化対象ではない
- 画面遷移や操作状態の責務をまとめられる


## 4. `app-store`

### 役割

ワークスペース非依存のアプリ全体状態を持つ。

### 持つもの

- `license`
- `setting`

将来的に持ちうるもの:

- `cliArgs`
- 起動モード
- バージョン情報

### 理由

- アプリ全体の設定と権限制御は workspace と別ライフサイクル


## 5. `runtime-store`

### 役割

Program 実行中だけ必要な runtime UI 状態を持つ。

### Phase 2 時点の扱い

このフェーズでは本格移行はしないが、将来の受け皿として設計だけ先に定義する。

### 将来的に持つもの

- phase
- progress
- monitorLines
- channels
- activeChannel
- txCache
- txDialogOpen
- runtimeError

### 理由

- Phase 3 の ProgramDialog 分割と強く関連するため


## 分割後の依存関係

理想的な依存は以下。

- `workspace-store`
  - workspace data を提供する
- `workspace-validation-store`
  - workspace data を評価する
- `ui-store`
  - 現在の表示対象を持つ
- `app-store`
  - ライセンスと設定を持つ
- `runtime-store`
  - 実行時状態を持つ

依存の向きとしては、

- `ui-store` は `workspace-store` に依存しない
- `workspace-validation-store` は `workspace-store` を参照してもよい
- `app-store` は独立
- `runtime-store` は `workspace-store` と `app-store` の読み取りには依存しうる


## 既存 state の移行マッピング

## 現行 `store.ts` からの移行先

### `workspace-store`

- `handlePath`
- `workspace`
- `snapshot`


### `workspace-validation-store`

- `disables`


### `ui-store`

- `target`
- `dialog`
- `shortcutEvent`


### `app-store`

- `license`
- `setting`


### 保留 / 再評価対象

- `cacheMap`
- `invUnits`

理由:

- 現時点では責務がやや曖昧
- 先に利用箇所を精査してから、workspace 寄りか runtime 寄りか判断した方がよい


## `storeWorkspace.ts` の分割方針

現在の `storeWorkspace.ts` は以下を持っている。

- workspace モデル定義
- target 定義
- workspace 取得補助
- validation
- duplicate check

これを以下のように分ける。

## 残すもの

### `workspace-model.ts`

持つもの:

- `Props`
- `Category`
- `Target`
- `getInitial`


## 別へ出すもの

### `workspace-validation.ts`

持つもの:

- `validate`
- `validateAll`
- duplicate check
- enable / disable 判定


### `workspace-selectors.ts`

持つもの:

- `getWorkspace`
- `getTarget`

補足:

- selectors を分けなくてもよいが、model と validation からは切った方が読みやすい


## 分割後のファイル案

命名規約に合わせると、以下のような構成が考えられる。

- `workspace-store.ts`
- `workspace-model.ts`
- `workspace-validation-store.ts`
- `workspace-validation.ts`
- `workspace-selectors.ts`
- `ui-store.ts`
- `app-store.ts`

必要に応じて

- `runtime-store.ts`
- `workspace-actions.ts`

も追加する。


## 更新方式の方針

## 原則

store 直接ミューテーションを少しずつ減らし、
更新関数経由へ寄せる。

### 例

避けたい:

- `workspace.envs.push(...)`
- `work.source = v`
- `$store = { ...$store }`

目指す形:

- `workspaceActions.addEnv()`
- `workspaceActions.updateWorkSource(index, source)`
- `uiActions.openDialog("program")`


## ただし Phase 2 ではやりすぎない

このフェーズの目的は、

- 状態の入れ物を分けること

であり、

- 全更新を command 化すること

ではない。

そのため Phase 2 では、

1. store の責務分離
2. 主要操作だけ action 化

までを目標にする。


## 移行手順

## Step 1. `app-store` を切り出す

対象:

- `license`
- `setting`

理由:

- 依存範囲が比較的独立している
- 影響が小さく着手しやすい


## Step 2. `ui-store` を切り出す

対象:

- `dialog`
- `target`
- `shortcutEvent`

理由:

- ProgramDialog や MainFrame 系の依存を明確にできる


## Step 3. `workspace-store` を切り出す

対象:

- `workspace`
- `handlePath`
- `snapshot`

理由:

- 保存 / 読込処理の責務がまとまる


## Step 4. `workspace-validation-store` を切り出す

対象:

- `disables`
- validation ロジック

理由:

- 最後に切る方が移行中の混乱が少ない


## Step 5. `cacheMap` / `invUnits` の所属を決める

選択肢:

- workspace-store
- runtime-store
- 専用 store

この2つは利用状況を再調査した上で決める。


## コンポーネント側の変更方針

## 優先対応対象

- `Entry.svelte`
- `SystemMenu.svelte`
- `MainFrame.svelte`
- `ModuleManage.svelte`
- `ProgramDialog.svelte`

### 理由

- 現在 `$store` への依存が大きい
- 状態分割の効果が出やすい


## 読み替え方

### 例

現状:

- `$store.workspace`
- `$store.dialog`
- `$store.target`
- `$store.license`

分割後:

- `$workspaceStore.workspace`
- `$uiStore.dialog`
- `$uiStore.target`
- `$appStore.license`


## 成功条件

Phase 2 完了時点で、少なくとも以下を満たす。

1. `store.ts` を唯一の state 入口にしていない
2. `license` と `setting` は app state として独立している
3. `dialog` と `target` は ui state として独立している
4. `workspace` と `snapshot` は workspace state にまとまっている
5. validation 結果は workspace 本体から分けられている、または分離直前まで整理されている


## リスク

## 1. 移行途中の二重管理

store 分割途中に旧 `store.ts` と新 store が並立すると、同期漏れが起きやすい。

対策:

- 段階ごとに参照先を置き換える
- 一時的な mirror は短期間に限定する


## 2. コンポーネント修正範囲の拡大

`$store` 依存が広いため、分割の影響が多方面に出る。

対策:

- 優先対象から段階的に置き換える
- selector / action 層を併用して、呼び出し側の変更量を抑える


## 3. validation の責務切り出しが不完全になる

対策:

- Phase 2 の終盤で `workspace-validation` を専用資料ベースに整理する


## 現時点の結論

Phase 2 の本質は、state を増やすことではなく、
`状態の責務境界を明確にすること` にある。

そのため、このフェーズでは

1. `app-store`
2. `ui-store`
3. `workspace-store`
4. `workspace-validation-store`

の順で切り出していくのが最も安全である。

これができると、Phase 3 での `ProgramDialog` 分割や、
Phase 5 の bridge 整理がかなり進めやすくなる。
