# Work実行プランとAPI権限選択

2026-10-13。第5段階の継続。Work開始前のcontext選択と予約APIの権限規則を、UI/Workerの生成から独立した実行プランへ移した。

## 変更

- `service/execution/work-execution-plan.ts` は、Workspace、Work、無効項目、Professional権限を明示的に受け、実行に渡すcontext項目と予約API一覧を選ぶ。Tauri、Svelte store、Workerを実行時に参照しない。
- 同じプランから、Workのソース・出力方式・context・API一覧を取得する。コンパイル関数は呼出元から渡し、source mapが無ければ開始前に失敗する。
- `ProgramDialog` はこのプランを編集時の宣言表示とWorker起動の両方に用いる。既存の`ContextDataUtil.getUsableData`と`DeclareUtil.getUsableReserveList`も同じ選択関数へ委譲し、他のGUI画面の挙動を維持した。

## 確認と残る範囲

- 無効項目の除外、無償/Professionalのcontext・API、plain/channelの違い、コンパイル出力を新規テスト2件で確認。既存のMCP/GUI整合性とruntime回帰試験も`npm run check`で実行。
- contextオブジェクトの具体化、dataset走査、予約APIオブジェクトの生成はまだWorker側にある。記載時点ではUI上の実行確認は未実施だった。その後ユーザーがGUI動作を確認し、問題なしと報告した。
- Worker側context生成のI/Oポート分離は [22_contextのI_Oポート分離](22_contextのI_Oポート分離.md) を参照。
