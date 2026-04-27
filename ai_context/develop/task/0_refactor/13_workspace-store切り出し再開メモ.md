# `workspace-store` 切り出し再開メモ

## 目的

`store.ts` に残っていた workspace 本体の状態を、専用 store へ分離する。

今回の対象:

- `workspace`
- `handlePath`
- `snapshot`

## 今回の方針

最初から action / selector / validation まで一気に分けない。

まずは:

1. writable store を新設する
2. workspace 本体参照を新 store に寄せる
3. root store から対象 state を抜く

この順で最小単位の切り出しを行う。

## 追加するもの

- `workspace-store.ts`
  - `handlePath`
  - `workspace`
  - `snapshot`

## 今回まだやらないもの

- `workspace-validation-store.ts`
- `workspace-actions.ts`
- `workspace-selectors.ts`
- immutable 更新の徹底

## 影響が大きい箇所

- `file-util.ts`
  - 読み込み / 保存 / タイトル更新
- `dirty.ts`
  - snapshot 監視
- `store-workspace.ts`
  - `getWorkspace`, `validateAll`
- workspace 編集画面
  - `MDEnv`, `MDProcess`, `MDResource`, `MDWork`, `MDDataSet`
- 起動 / 終了導線
  - `Entry.svelte`
  - `StartFrame.svelte`
  - `SystemMenu.svelte`

## 次の段階

`workspace-store` 切り出しが安定したら、次に進む。

1. `workspace-model.ts`
2. `workspace-validation-store.ts`
3. `workspace-validation.ts`

この順に進めると、validation と model をきれいに分離しやすい。
