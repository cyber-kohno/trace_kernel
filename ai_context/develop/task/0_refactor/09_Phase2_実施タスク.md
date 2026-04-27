# Phase 2 実施タスク

## 目的

[08_Phase2_store分割設計.md](ai_context/develop/plan/0_refactor/08_Phase2_store分割設計.md)
を、実際に着手できる作業単位へ落とし込む。

このフェーズの目的は、

- state の責務を分離する
- `$store` への全体依存を減らす
- 後続の実行系分割の前提を作る

ことである。


## このフェーズの完了条件

以下を満たしたら Phase 2 完了とする。

- `app-store` が独立している
- `ui-store` が独立している
- `workspace-store` が独立している
- validation 責務が workspace 本体から分離されている、または分離直前まで整理されている
- 主要画面が必要な store だけを参照する形に変わっている


## 実施順

Phase 2 は以下の順で進める。

1. `app-store` 切り出し
2. `ui-store` 切り出し
3. `workspace-store` 切り出し
4. `workspace-model` / `workspace-validation` 分離
5. 主要画面の参照差し替え
6. `cacheMap` / `invUnits` の所属確定


## Task 1. `app-store` を作る

### 対象

- `license`
- `setting`

### 新規候補ファイル

- `app-store.ts`

必要に応じて:

- `app-selectors.ts`
- `app-actions.ts`

### やること

- 既存 `store.ts` から `license`, `setting` を切り出す
- 現在の参照箇所を `app-store` 経由に差し替える
- `StoreSetting` / `storeLIcense` の命名はこの段階では無理に変えず、参照経路整理を優先する

### 主な影響箇所

- `Entry.svelte`
- `ProgramDialog.svelte`
- setting dialog 周辺
- license panel 周辺
- `FileUtil.updateAppTitle`

### 完了条件

- `license`, `setting` が `store.ts` から外れている
- 参照側が `app-store` を読む


## Task 2. `ui-store` を作る

### 対象

- `dialog`
- `target`
- `shortcutEvent`

### 新規候補ファイル

- `ui-store.ts`

必要に応じて:

- `ui-actions.ts`
- `ui-selectors.ts`

### やること

- ダイアログ開閉、対象選択、ショートカット登録を `ui-store` に寄せる
- `ProgramDialog`, `DialogManager`, `MainFrame`, `ModuleManage` などの参照先を差し替える

### 主な影響箇所

- `DialogManager.svelte`
- `MainFrame.svelte`
- `MaintenanceMange.svelte`
- `ProgramDialog.svelte`
- `SystemMenu.svelte`
- `ModuleManage.svelte`

### 完了条件

- `dialog`, `target`, `shortcutEvent` が `store.ts` から外れている
- UI コンポーネントが `ui-store` を読む


## Task 3. `workspace-store` を作る

### 対象

- `workspace`
- `handlePath`
- `snapshot`

### 新規候補ファイル

- `workspace-store.ts`

必要に応じて:

- `workspace-actions.ts`
- `workspace-selectors.ts`

### やること

- ワークスペース本体とファイル関連 state を切り出す
- `FileUtil` の読込 / 保存ロジックの参照先を変更する
- 既存の `dirty` 判定との接続を保つ

### 主な影響箇所

- `Entry.svelte`
- `FileUtil`
- `MainFrame.svelte`
- `ModuleManage.svelte`
- `StoreWorkspace.getWorkspace`
- `dirty.ts`

### 完了条件

- `workspace`, `handlePath`, `snapshot` が `workspace-store` に集約される
- ワークスペース保存 / 読込が新 store を前提に動く


## Task 4. `workspace-model` を分離する

### 対象

現 `storeWorkspace.ts` のうち、モデル定義部分。

### 新規候補ファイル

- `workspace-model.ts`

### 移すもの

- `Props`
- `Category`
- `Target`
- `getInitial`

### 残さないもの

- `validate`
- `validateAll`
- `getWorkspace`
- `getTarget`

### 完了条件

- workspace モデル定義と validation ロジックが別ファイルになる


## Task 5. `workspace-validation` を分離する

### 対象

現 `storeWorkspace.ts` の validation ロジック。

### 新規候補ファイル

- `workspace-validation-store.ts`
- `workspace-validation.ts`

### 移すもの

- `disables`
- `validate`
- `validateAll`
- duplicate check
- enable / error 判定

### やること

- validation 結果の state と、validation 実行ロジックを整理する
- `StoreWorkspace.validate(...)` 呼び出しを順次置換する

### 主な影響箇所

- `ModuleManage.svelte`
- `StoreWorkspace.validateAll()` 呼び出し箇所
- 編集系コンポーネント

### 完了条件

- `disables` が `store.ts` から外れている
- validation 実行ロジックが workspace モデルから切れている


## Task 6. 主要画面の `$store` 依存を差し替える

### 対象

優先度高:

- `Entry.svelte`
- `SystemMenu.svelte`
- `MainFrame.svelte`
- `ModuleManage.svelte`
- `ProgramDialog.svelte`

次点:

- maintenance 系画面
- detail 系画面

### やること

- `$store.xxx` を必要な store 参照へ置き換える
- 画面ごとに依存している state を明確化する

### 目標

各画面が必要な state だけを読む状態にする。

### 完了条件

- 上記主要画面で `$store` 全体参照が解消されている、または大幅に減っている


## Task 7. `cacheMap` / `invUnits` の所属を決める

### 対象

- `cacheMap`
- `invUnits`

### やること

- 利用箇所を調査する
- workspace 由来か runtime 由来かを判断する
- 必要なら専用 store 化する

### 完了条件

- どこへ置くべきか決まっている
- 暫定的にでも `store.ts` にぶら下がったまま放置しない


## Task 8. 移行中の橋渡し層を必要最小限で作る

### 目的

全面置換中の不整合を抑える。

### やること

- 一時的 selector を作る
- `workspace`, `ui`, `app` ごとの取得関数を揃える
- 置換中だけ使う互換関数は短命に保つ

### 注意

- 旧 `store.ts` を延命しすぎない
- 二重更新を長期間残さない


## 具体的な着手順

## スプリント 1

- `app-store.ts` 作成
- `ui-store.ts` 作成
- 主要参照の差し替え

### ゴール

- `license`, `setting`, `dialog`, `target`, `shortcutEvent` が独立する


## スプリント 2

- `workspace-store.ts` 作成
- `workspace-model.ts` 分離
- `workspace-selectors.ts` 作成

### ゴール

- workspace 本体の責務が整理される


## スプリント 3

- `workspace-validation-store.ts`
- `workspace-validation.ts`
- validation 呼び出し側の置換

### ゴール

- validation が分離される


## スプリント 4

- `$store` 全体依存の残件処理
- `cacheMap`, `invUnits` の所属確定

### ゴール

- `store.ts` 依存を縮小または撤廃できる状態になる


## 実装時の注意点

## 1. 一気に immutable 化しない

このフェーズでは state の責務分離が主目的。
更新方式の全面刷新は次段階でよい。


## 2. validation はロジックと state を両方見る

単に `disables` を移すだけでは足りない。
`validate()` の責務ごと分離する必要がある。


## 3. ProgramDialog は deep dependency を持つ

`ui-store` と `app-store` の切り出し後も、
`ProgramDialog` は `workspace-store` と validation に深く依存する。
そのため Phase 2 では「完全整理」ではなく「参照境界を明確にする」と考える。


## 4. naming rule は新規ファイルから適用する

新しく作る `.ts` ファイルは [02_命名規約.md](ai_context/develop/plan/0_refactor/02_命名規約.md)
に従い、`kebab-case` で作成する。


## Phase 2 完了後に得られること

- 画面ごとの依存 state が見える
- workspace と UI の責務が切れる
- app 全体設定が独立する
- validation 分離の基盤ができる
- Phase 3 で `ProgramDialog` を分割しやすくなる


## 現時点の結論

Phase 2 は単なる store の分割ではなく、
`状態の境界を明文化する作業` である。

そのため、最初に実装すべきなのは

1. `app-store`
2. `ui-store`
3. `workspace-store`

であり、その後に

4. `workspace-validation`

へ進むのが最も安全である。
