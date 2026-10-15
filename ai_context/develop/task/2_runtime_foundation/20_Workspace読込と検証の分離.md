# Workspace読込と検証の分離

2026-10-13。第5段階の最初の実装。

## 変更

- `prepare-workspace-load.ts` に、展開済みJSONの解析と世代互換性判定をまとめた。Tauri、Svelte store、画面遷移を参照せず、Workspaceと判定結果を返す。
- `FileUtil.loadWorkspaceChoose` と `loadWorkspaceFile` は、ファイル選択後の読込・移行案内・API警告・snapshot作成・store反映を共通経路にした。ファイル指定で開いた場合だけ成功トーストを出す従来の違いは維持した。
- `validate-workspace.ts` に、env/resource/dataset/process/logic/workの既存の検証規則を移した。Workspaceを受け取って無効な項目を返す純粋な関数で、UI状態は参照しない。
- `ValidationService` は検証結果をstoreへ反映するアダプターにした。全件再検証では以前のWorkspaceに属する古い無効項目を消し、個別編集時は該当カテゴリを再計算する。

## 確認と残る範囲

- 互換性の各分岐、重複名、各カテゴリの無効条件、GUIアダプターの古い項目の解消を `test-workspace-load.mjs` の5件で確認。`npm run check` で型検査、MCP整合性、transaction・runtime回帰試験も実行。
- 圧縮ファイルの読込とUIの移行/警告表示は引き続きDesktop側にある。Workspace全体のJSON構造検証、実行準備とAPI権限注入はまだ共通化していない。
- 実GUIでのファイル選択・起動引数からの読込は未確認。

Work実行前のcontextとAPI権限選択は [21_Work実行プランとAPI権限選択](21_Work実行プランとAPI権限選択.md) を参照。次はWorker側のcontextオブジェクト生成とI/Oの境界を整理する。
