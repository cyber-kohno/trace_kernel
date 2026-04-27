# Phase 2.5 `.ts` 命名統一方針

## 目的

`.ts` ファイルの命名を一律 `kebab-case` に統一し、次の問題を先に解消する。

- Windows 上で見逃しやすい大文字小文字の揺れ
- `StoreX.ts` / `storeX.ts` のような命名規則の混在
- ファイル名だけで責務や種別を判別しづらい状態
- import 文の表記揺れによる事故

本対応は見た目の統一ではなく、今後の store 分割、runtime 分割、責務整理を安全に進めるための土台整備として扱う。

## 結論

`.ts` ファイルを先に一律 `kebab-case` に寄せる方針は採用してよい。

ただし、次の条件を守る。

- `.ts` の rename と責務変更を同じ作業単位に混ぜない
- rename は段階的に行い、波ごとに `npm run check` を実行する
- Windows で不安定な「大文字小文字だけ変更」は避ける
- `.svelte` は当面 `PascalCase` を維持する
- `.rs` は現状の `snake_case` を維持する

## 適用ルール

### 基本ルール

- `.ts`, `.d.ts` は `kebab-case`
- 単語間は `-`
- 略語も基本は小文字に寄せる
- 接尾辞で責務を表す

### 推奨接尾辞

- `*-store.ts`: store モジュール
- `*-util.ts`: 一時的な util。将来分解候補
- `*-api.ts`: 外部境界、Tauri invoke、HTTP など
- `*-parser.ts`: パース責務
- `*-adapter.ts`: UI と runtime の橋渡し
- `*-writer.ts`: 書き込み責務
- `*-types.ts`: 型群

### 非推奨

- `StoreX.ts` のような PascalCase ファイル名
- `storeX.ts` のような camelCase ファイル名
- `LIcense` のような typo を含む名前
- 役割が分からない `Util`, `Factory`, `Manager` の多用

## 実施順

### Wave 1: store 層

対象:

- `StoreDeclare.ts`
- `StoreProcess.ts`
- `StoreResource.ts`
- `StoreSetting.ts`
- `StoreWork.ts`
- `storeEnv.ts`
- `storeDataset.ts`
- `storeCache.ts`
- `storeInvalidate.ts`
- `storeLIcense.ts`
- `storeWorkspace.ts`

理由:

- いま最も参照頻度が高い
- すでに `app-store.ts`, `ui-store.ts` が追加されており、統一の軸にしやすい
- 今後の `workspace-store` 分割と直結している

### Wave 2: util / bridge 層

対象:

- `contextDataUtil.ts`
- `declareUtil.ts`
- `runtimeUtil.ts`
- `workerInvoke.ts`
- `workerAdapter.ts`
- `TypescriptUtil.ts`
- `fileUtil.ts`
- `validateUtil.ts`

理由:

- import 数が多く、命名の混在が目立つ
- 後続の責務整理で分割対象になりやすい

### Wave 3: runtime / tx 層

対象:

- `txCommitRunner.ts`
- `txDetailUtil.ts`
- `txExecuter.ts`
- `txPlanNormalize.ts`
- `txPlanUtil.ts`
- `txVerifyUtil.ts`
- `realFSWriter.ts`

理由:

- 実行系の責務整理前に表記だけ揃えておくと、その後の分割がしやすい

### Wave 4: 残差整理

対象:

- 命名規約に従っていない小規模 `.ts`
- typo が残っている `.ts`
- import パスだけズレているもの

## Windows での rename 方針

### 原則

Windows では `StoreProcess.ts -> store-process.ts` のような rename が不安定になりやすい。
そのため、大小文字だけの差や、末尾だけの差に見える rename は避ける。

### 推奨手順

1. 一時名へ変更する
2. import を追従する
3. `npm run check` を実行する
4. 最終名へ変更する
5. 再度 `npm run check` を実行する

例:

- `StoreProcess.ts`
- `tmp-store-process.ts`
- `store-process.ts`

ファイル数が多い場合は、一時名を全件に使うのではなく、同一ディレクトリ単位で rename を完了させる。

## 作業単位

1 回の作業では 5 から 10 ファイル程度を上限にする。

各作業単位で必ず行うこと:

- rename
- import 更新
- `npm run check`
- 差分確認

これにより、どの rename でエラーが入ったかを追いやすくする。

## 完了条件

- `app/src` 配下の `.ts`, `.d.ts` が原則 `kebab-case` になっている
- PascalCase / camelCase の `.ts` が意図的な例外を除いて消えている
- import の大文字小文字不一致が解消している
- `npm run check` が命名由来のエラーを出さない

## 例外

当面の例外は次の通り。

- `+layout.ts` のようなフレームワーク予約名
- 生成物、外部依存、または別規約に従うファイル

## この方針の位置づけ

本対応は Phase 2 の途中に挟む「Phase 2.5」として扱う。

- Phase 2: store 分割
- Phase 2.5: `.ts` 命名統一
- Phase 3: 実行系責務分解

命名を先に揃えることで、後続の構造改善で「rename と設計変更が混ざる」状態を避ける。
