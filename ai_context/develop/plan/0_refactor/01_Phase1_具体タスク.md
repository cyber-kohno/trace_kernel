# Phase 1 具体タスク

## 目的

Phase 1 では、今後の改善を安全に進めるための前提を作る。

このフェーズではコードを大きく組み替えるのではなく、

- 命名
- 配置
- 責務境界
- 呼び出し経路

を可視化し、判断基準を固定することを主目的とする。


## このフェーズの到達点

以下の状態になっていることを完了条件とする。

- 新規ファイルをどこに置くべきか判断できる
- ファイル名と export 名の付け方が統一されている
- `app/src` の各ディレクトリの責務が説明できる
- Tauri command と TypeScript 側呼び出し口の対応が追える
- 明確に直すべき命名揺れ、構造不整合が一覧化されている


## 実施タスク

## Task 1. 命名ルール文書を作る

### 目的

ファイル名、コンポーネント名、store 名、utility 名の揺れを止める。

### 決めること

- Svelte コンポーネントは `PascalCase.svelte`
- store は `camelCase.ts` か `StoreX.ts` のどちらかに統一する
- 型定義ファイル、ドメインモデル、サービス、ブリッジ層の命名規約
- 略語の扱い
  - `MD`, `PR`, `tx`, `fs` を許容するか
- typo を含む既存名称の扱い
  - すぐ直すか、後続フェーズで直すか

### 成果物

- 命名規約メモ
- 改名方針


## Task 2. ディレクトリ責務マップを作る

### 目的

`app/src` 配下のモジュールを「なんとなくの配置」から脱却させる。

### 対象

- `app/src/app/contents`
- `app/src/app/store`
- `app/src/app/util`
- `app/src/app/contents/detail/program`
- `app/src-tauri/src`

### 整理観点

- 画面表示
- ワークスペース編集
- 実行制御
- ランタイム注入
- Tauri bridge
- Rust command 実装

### 成果物

- ディレクトリごとの責務一覧
- 責務が曖昧なディレクトリ一覧


## Task 3. Store 責務の棚卸しをする

### 目的

Phase 2 の store 分割に備えて、現状の責務を分類する。

### 調査対象

- `store.ts`
- `storeWorkspace.ts`
- `storeEnv.ts`
- `StoreResource.ts`
- `storeDataset.ts`
- `StoreProcess.ts`
- `StoreWork.ts`
- dirty, invalidate, cache, setting, license 関連

### 分類単位

- workspace state
- ui state
- app state
- runtime state

### 成果物

- 各 store / state の責務一覧
- 分割候補一覧
- グローバル store から分離したい要素一覧


## Task 4. `$store` 直接依存ポイントを洗い出す

### 目的

不要な全体購読や依存の広がりを把握する。

### 調査観点

- `$store` 全体を参照している箇所
- 実際には一部 state だけ使っている箇所
- UI とドメイン更新が混在している箇所
- 破壊的更新を前提にしている箇所

### 成果物

- 過剰購読ポイント一覧
- 分離優先度付きの対象一覧


## Task 5. `ProgramDialog` の責務分解メモを作る

### 目的

Phase 3 の中心になる実行系分割のために、責務を先に言語化する。

### 見る観点

- 表示責務
- 実行開始責務
- Worker イベント受信責務
- stream 管理責務
- progress / monitor 管理責務
- tx dialog 制御責務
- runtime error 表示責務

### 成果物

- `ProgramDialog.svelte` の責務一覧
- 分離候補の単位
- 優先的に外に出す責務の順序


## Task 6. Tauri command 対応表を作る

### 目的

TypeScript から Rust への呼び出し経路を明示化する。

### 整理項目

- command 名
- request 引数
- response 型
- 呼び出し元 TS ファイル
- 利用目的
- エラーハンドリング有無

### 対象例

- file system commands
- scan commands
- process commands
- stream commands
- parser commands
- scraper commands
- worker lifecycle commands

### 成果物

- Tauri command 対応表
- 呼び出し経路が重複している箇所の一覧


## Task 7. すぐ分かる命名不整合を一覧化する

### 目的

後続フェーズで安全に改名するための対象を先に確定する。

### 例

- `MaintenanceMange`
- `MDResourece`
- `storeLIcense`
- `trce_kernel`

### 分類

- typo
- 大文字小文字揺れ
- 略語が分かりづらい
- 責務が名前に出ていない

### 成果物

- 命名不整合一覧
- 変更影響が大きい候補
- 先に直してよい候補


## Task 8. ルール適用の優先順位を決める

### 目的

文書だけ作って終わらないように、後続フェーズへの接続点を明確にする。

### 決めること

- 先に変えるもの
- 後からまとめて変えるもの
- 既存コードは維持しつつ新規から統一するもの

### 成果物

- 運用ルール
- フェーズ2への引き継ぎメモ


## 推奨成果物ファイル

Phase 1 の成果物は以下のように分けると扱いやすい。

1. `02_命名規約.md`
2. `03_ディレクトリ責務マップ.md`
3. `04_Store責務整理.md`
4. `05_ProgramDialog責務分解.md`
5. `06_TauriCommand対応表.md`
6. `07_命名不整合一覧.md`


## 着手順

優先順は以下を推奨する。

1. Task 2 ディレクトリ責務マップ
2. Task 3 Store 責務棚卸し
3. Task 5 ProgramDialog 責務分解
4. Task 6 Tauri command 対応表
5. Task 1 命名ルール文書
6. Task 7 命名不整合一覧
7. Task 4 `$store` 依存洗い出し
8. Task 8 ルール適用優先順位

理由:

- まず構造を把握しないと命名規約を決めても空回りしやすい
- Store と ProgramDialog は後続フェーズの起点なので先に可視化する価値が高い


## 補足方針

Phase 1 では、原則として大規模リネームや構造変更はしない。

この段階でやるべきことは、

- 変更対象を明確にする
- 判断ルールを決める
- 後続フェーズの作業順を確定する

である。

設計判断が揃ってから Phase 2 以降に入ることで、
手戻りの少ない改善ができる。
