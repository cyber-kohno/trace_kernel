# MCPミニウィンドウの小型化と診断分離

2026-10-16。利用者から、MCPミニウィンドウの肥大化と縦スクロールを避けたいとの指摘を受け、提案した表示整理の方針について承認を得て実装した。

## 変更内容

- 通常のミニウィンドウは「MCP / gen」「短い状態」「公開中のSession IDとCopy」「Diagnostics」「Publish / Stop」に限定。
- TRACE KERNEL、Development Session、Desktop version、API gen、Workspace genをミニウィンドウから削除。診断画面にもMCP以外の版・世代は表示しない。
- 拒否0件なら警告・空履歴欄は表示しない。拒否があれば件数だけを表示。
- Endpoint、受付/拒否件数、最終受付時刻は別の診断ダイアログへ移動。
- 診断ダイアログはOverview / Rejections / Helpの切り替え式。補足説明と再起動手順はHelp、各拒否の理由・世代・対処はRejectionsへ配置。
- 拒否履歴は1グループだけ表示し、Previous / Nextで切り替える。最新8グループまでの保持・回数集約は変更しない。
- 閲覧中のグループはcodeと両世代で特定し、pollによる順序変更で別の理由へ切り替わらない。新Session IDでは選択をリセットする。
- 通常ミニウィンドウの縦スクロール指定を除去。画面の端でも収まるよう表示位置を調整する。
- 診断はHTMLのmodal dialogとして独立させ、Escape・フォーカス制御・背景操作抑止を利用する。閉じるとバッジへフォーカスを戻し、他のアプリ内ダイアログが開いた場合やWorkspaceを閉じた場合は診断も閉じる。
- コピー失敗は表示し、診断画面の全文を手動コピーできる。tokenは表示しない。

通信契約、世代値、製品version、native処理、MCPツール/API、公開・停止の処理は変更しない。UIだけの整理のためMCP通信世代は1のまま。CLI、Homepage、配布物、利用者のWorkspaceやAI設定も変更しない。

## 検証

`scripts/test-mcp-diagnostics.mjs`は従来の8件から12件へ拡充。実コンポーネントを使ったSSRで、通常表示からの不要情報排除、診断の情報保持、履歴1件表示・ページ端の操作制限・空履歴・Help、選択キーの安定性、従来のpoll/停止/破棄の回帰を検証する。

- 診断テスト12件成功。
- Svelte検査: 0 errors / 0 warnings。
- `node code/release/check-desktop-mcp-suite.mjs`の統合26工程がすべて成功。製品Frontend build、MCP stdio、実プロセス隔離acceptanceまで再確認した。native-coreは113件成功・既存6件ignored、MCP31件、Desktop Rust36件、診断以外のTS回帰191件、CLI API profile30件も成功。既存のtool_router未読、Viteのurl外部化・chunk size警告は残る。
- 変更したコードのPrettierチェック、git diff --checkも成功。

### 実コンポーネントのブラウザー表示確認

再現用入口（Desktopディレクトリで実行）:

```powershell
node scripts/preview-mcp-diagnostics.mjs
```

表示されたloopback URLで、実Svelteコンポーネントを使う専用fixtureを開く。実Tauri、セッションdescriptor、token、Workspace、ライセンスには接続しない。製品ルート/本番buildには追加しない。

確認済み:

- 640×480: 停止中ミニウィンドウ約140px、拒否8グループがあっても約160px。内部スクロールなし。
- 320×480 / 360×480: 診断のOverview / Rejections / Helpが内部スクロールなしで収まる。横方向のoverflowもなし。
- 320×240: 診断エラーがあるミニウィンドウも約202pxで画面内に収まり、パネル内部のスクロールなし（fixture本体の補助操作欄によるページスクロールとは区別）。
- 履歴のNextで2/8へ移動後、順序を反転しても同じ世代差の履歴が7/8として表示される。
- 新Session IDへ切り替えると1/8にリセット。他ダイアログ表示の通知で診断が閉じる。
- Escapeで閉じた後、MCPバッジが再び有効になりフォーカスが戻る。

極端に小さい画面・拡大表示で情報を欠落させないため、別診断ダイアログの本文には防御的なoverflowを残す。通常ミニウィンドウへ長い情報を展開したり、内容を隠すためだけにスクロールバーを消したりはしない。確認用ブラウザーのサイズ設定は元に戻し、専用タブと自分が起動したfixtureサーバーは終了した。

### タブ切替時の位置（追記）

利用者からOverview / Rejections / Helpの切替でダイアログの上下位置が変わることを指摘された。内容の高さに合わせてブラウザー標準の中央配置が再計算されており、意図した動きではないため、ダイアログ上端をviewportの16px位置に固定した。640×480の確認fixtureでOverview / Rejections / Helpを順に切り替え、各状態のtopが16pxで変わらないことを確認した。ウィンドウの高さは選択タブの内容に応じて変わる。

## 残る確認

50のFree版実接続、旧形式/異世代の拒否、集約表示、停止/再公開と新IDへの再接続は旧表示で確認済み。この表示整理後の実Tauri WebViewでの最終見た目・クリップボード・小画面/拡大時の確認はまだ利用者に依頼する段階。

更新提案のApply / Reject試験は、今回の表示整理を優先するため保留したまま。実Workspaceへの作成・更新を行う前に対象と実施許可を確認する。Pro実環境、社内入替も未実施。これらを今回のブラウザーfixture検証だけで完了扱いにしない。commit / pushなし。
