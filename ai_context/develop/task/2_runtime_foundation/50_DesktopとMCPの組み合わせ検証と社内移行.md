# DesktopとMCPの組み合わせ検証と社内移行

2026-10-16。ユーザーの「進めてください」に基づき、第5工程を進めた。
**自動検証、利用者が公開したFree版Desktopへの読み取り専用実接続・非互換要求の拒否、受付状態と拒否理由・対処方法・履歴集約のGUI表示確認は成功。停止/再公開による件数・履歴リセットは利用者の報告で確認し、Session ID変更と新セッションへの再接続も成功。更新提案の手動操作・Pro実環境・社内入替等は未確認で、第5工程全体の完了とはしない。**
この環境の操作機能ではネイティブGUIを操作できないため、実GUI確認は利用者の操作を必要とする。

**以後の表示整理:** [51_MCPミニウィンドウの小型化と診断分離](51_MCPミニウィンドウの小型化と診断分離.md)。以下の画像確認は整理前のUIで行った記録。現在は概要・拒否履歴・補足を別診断ダイアログへ移し、ミニウィンドウの長い説明と履歴一覧は廃止した。新表示の実Tauri確認は別途必要。

## 1. 自動検証の入口

リポジトリ直下で実行:

```powershell
node code/release/check-desktop-mcp-suite.mjs
```

26工程を順に実行し、最初の失敗で止める。Rustはoffline/locked、Nodeは同じ実行環境を使う。依存インストール・GUI起動・CLI製品build・Homepage build・配布物生成は行わない。各工程には10分の上限がある。

対象:

- リリース正本・Node helper8件、共通Rust契約14件。
- native-core 113件成功・従来の子プロセスfixture6件ignored、MCP31件、Desktop Rust36件。
- Svelte検査0 errors / 0 warnings。
- MCP API coverage/behavior/GUI-context整合性、TS回帰191件、診断UI8件。
- 共通TSの型、61 moduleの依存境界、CLI API profile30件（CLI実行ファイルのbuildではない）。
- 共有moduleのdev配信とDesktopの製品Frontend build。
- MCP実行ファイル・隔離用native hostのbuild、stdio smoke、実プロセス隔離acceptance。

26工程すべて成功した。既存のMCP tool_router未読、Vite url外部化・chunk size等の警告は残す。実装契約の変更・世代値変更・製品version変更は今回行わない。

## 2. 実プロセスを使った隔離試験

個別実行:

```powershell
cargo build --offline --locked --manifest-path code/apps/mcp/Cargo.toml --bin trace-kernel-mcp --example compatibility_host
node code/apps/mcp/scripts/test-acceptance.mjs
```

構成は **MCP実exeのstdio → MCP本体の発見/health/呼出 → nativeの実HTTP bridge → Desktopの実要求handler/共有API宣言/共有型検査**。
apps/mcp/examples/compatibility_host.rsはテスト専用のexampleであり、製品MCPのモードや配布対象ではない。
UI store・空context・license判定portはメモリー内fixture。native hostの要求eventをNodeがTS handlerへ渡して応答する。Tauri IPC/WebView/マウス操作の試験とは区別する。

実施結果:

| ケース | 結果 |
|---|---|
| 同世代・異なる製品version（Desktop fixture 9.9.9） | 発見・接続成功 |
| 同じ一時app-data内に互換/異世代/旧形式のsession | それぞれcompatible/incompatible/legacyとして列挙 |
| 非互換へのget_work_context | エラーのcodeと理由を保持し、host要求処理を行わない |
| Free/Pro × plain/channel | API一覧と型宣言、正しいWorkのvalidate成功 |
| 出力方式違い、Freeでの$fs使用、型誤用 | validateで拒否 |
| Proでの$fs使用 | 型検証のみ成功。ファイルは読まない |
| fixtureへのcreate_work/同名再作成 | 前者のみ作成、後者は拒否 |
| 更新提案の決定待ち | 元sourceを変更しない |
| fixtureでの明示reject/apply | 拒否時は非変更、適用時のみsource変更 |
| editorを閉じた後の提案 | staleとして拒否、提案画面を開かない |
| nativeへの旧形式/異世代の直接要求 | 409・fixture非変更・安全な診断を保持 |
| 読み取り専用チェックscriptのFree/Proと拒否確認option | 同じ隔離fixtureで検証成功 |

Workには実行するとthrowするsourceも使い、validate/createで実行されないことを確認した。test上の明示決定は実ユーザーのマウス承認ではない。

一時app-dataはtest専用にmkdtempで作り、子プロセスのLOCALAPPDATA/XDG_DATA_HOMEだけを差し替える。実利用者のdescriptor・Workspace・license設定は使わない。終了時に自分が起動した子プロセスと自分が作成した一時rootだけを清掃する。tokenやWork sourceを検証ログへ出さない。

## 3. 実GUI確認の手順（一部実施済み）

### 2026-10-16の実接続結果

利用者が公開したDesktopのSession ID省略表示とFree版である旨を受領。ローカル公開descriptorのファイル名を先頭・末尾で照合し、一意に一致した全文IDを使った。tokenは表示していない。

```powershell
node code/apps/mcp/scripts/check-live-session.mjs --session "b2505987-c5e0-4172-9e4d-f64f643fb7f8" --expect-license free
```

終了code 0。実Desktopへの互換性probe、overview/context取得、Free版のplain/channel両方のAPI宣言と静的検証が成功した。Workの作成・更新・実行や既存Work sourceの読出しは行わず、実行前後でWorkspace件数・名前が不変であることもscriptで確認した。

初回は `--check-rejections` を指定せず、意図的な非互換要求は送信していない。

続いて利用者から「ちゃんと出ています」と画像を受領。画像でVerified request、Desktop version 0.2.0、MCP gen 1、API gen 1 / Workspace gen 0、Accepted 10件、Compatibility rejects 0件、Last compatible request 6:33:31を確認した。Popoverには内部scrollbarが見えるが、長い拒否履歴のscroll操作は未確認。

同じ実セッションへ `--check-rejections` を付けて再実行し、終了code 0。旧形式（contractなし）・異世代（gen 2）の読み取り専用getWorkContextがいずれもHTTP 409で拒否された。拒否後の互換なoverview取得も成功し、実行前後のWorkspace件数・名前は不変だった。Workの作成・更新・実行は行っていない。

続く利用者の画像でAccepted 20件、Compatibility rejects 2件、Last compatible request 6:38:37を確認。MCP_BRIDGE_GENERATION_MISMATCHはDesktop gen 1 / requester gen 2、MCP_CONTRACT_REQUIREDはDesktop gen 1 / requester gen Unknownで、それぞれ×1。理由・対処方法が表示され、下部の説明とStop MCPボタンまで見えることも確認した。

同じ拒否試験をもう一度実行し、終了code 0。正常な静的検証、2件のHTTP 409、拒否後のoverview取得、Workspace件数・名前の不変を再確認した。続く利用者の画像でAccepted 30件、Compatibility rejects 4件、Last compatible request 6:39:42、同じ2グループが各×2となることを確認した。トースト連発の有無は静止画像だけでは確認しない。

この画像とともに受領した全文Session IDは前回と同じb2505987-c5e0-4172-9e4d-f64f643fb7f8で、件数・履歴も残っているため、停止/再公開のリセット確認とは扱わない。停止操作を実施したかは未確定であり、不具合とも断定しない。追加要求は送らず、利用者にStop MCP → 再公開後の件数・履歴と新Session IDの確認を依頼した。

その後、停止/再公開の確認依頼に対し利用者から「リセットされました」と報告を受領。件数・履歴のリセットは確認済みとする。続いて新Session ID 639dc2ba-ab3b-4d02-83c7-f833d1806e22を受領し、旧IDからの変更を確認。次の再接続チェックが終了code 0で成功した。

```powershell
node code/apps/mcp/scripts/check-live-session.mjs --session "639dc2ba-ab3b-4d02-83c7-f833d1806e22" --expect-license free
```

Free版のplain/channel両方のAPI宣言・静的検証と、実行前後のWorkspace件数・名前の不変を再確認。Workの作成・更新・実行と意図的な非互換要求は行わず、旧IDへの追加要求も行っていない。

マウスによる承認/拒否・Pro実環境は、この結果だけでは確認済みとしない。

### 準備

1. 未保存作業を退避し、最新ソースを通常のDesktop開発手順で起動する（code/README参照）。古いexe/古いRustのまま新Frontendだけを開かない。
2. **確認用の一時Workspace**を開く。業務用の既存Workspaceで作成・更新試験をしない。
3. MCP詳細からPublish MCPを押す。Desktop version/MCP gen/API genの表示と、Publishedであることを確認する。
4. Session IDのCopyで全文を取得する。省略表示や先頭8桁は使わない。
5. 現在の実ライセンスがFree/Proのどちらかを確認する。試験のために架空のライセンスを発行したり設定ファイルを書き換えたりしない。

### 読み取り専用の実接続チェック

Freeの場合（リポジトリ直下）:

```powershell
node code/apps/mcp/scripts/check-live-session.mjs --session "ここをコピーしたSession ID全文に置換" --expect-license free --check-rejections
```

Proの場合は `--expect-license pro`。確認するMCP exeを変える場合は `--mcp-exe "実行ファイルの絶対パス"` を付ける。既定は今回buildしたdebug MCP。

- 指定したsessionだけをprobeし、overview/contextとplain/channelのvalidateを行う。
- Workの作成・更新・実行、env値/既存Work sourceの読出し、license/AI設定の変更はしない。
- `--check-rejections` は、旧形式と異世代の **読み取り専用getWorkContext** を直接送信する。guardの不具合があってもWorkを作らない。指定しなければ拒否試験は行わない。
- bearer tokenはdescriptorから内部利用するが表示しない。Workspace件数・名前が実行前後で変わっていないことも確認するため、他クライアントの編集は止めておく。
- このscript自体は隔離fixtureで検証済みだが、実GUIへの実行成功とは扱わない。

実行後、Desktopで次を確認する:

- [x] PublishedからVerified requestへ変わり、受付件数と時刻が更新される（利用者の報告と画像で確認）。
- [x] MCP_CONTRACT_REQUIREDとMCP_BRIDGE_GENERATION_MISMATCHが履歴に現れ、双方の世代/Unknownと対処文が読める（利用者の画像で確認）。
- [x] 同じ試験を繰り返しても履歴は同じグループの回数に集約される（合計4件・2グループ各×2を画像で確認）。
- [ ] 同じ試験を繰り返してもトーストが連発しない。
- [x] 拒否後も互換なMCPの読み取り要求を利用できる（実接続scriptで確認）。
- [ ] 拒否後もDesktop自体の編集/保存/Work実行は妨げられない。
- [ ] 整理後のミニウィンドウが画面内に収まり、内部scrollが不要。診断ダイアログでは履歴をPrevious / Nextで切り替えられる（51のブラウザーfixtureでは確認済み、実Tauri未確認）。
- [x] Stop MCP → 再公開すると件数・履歴がリセットされる（利用者の報告で確認）。
- [x] 再公開後のSession IDが変わることを確認し、新IDで再接続チェックを行う（全文ID比較と読み取り専用script成功）。
- [ ] Free/Proの実環境それぞれで確認する。片方しかなければ未確認を残す。

### 実ユーザーの更新提案操作

確認用Workspace内の小さいWorkだけを対象にする。AIクライアントでget_ui_state/get_workの最新editorIdとbaselineを読み、validate後にpropose_work_updateを送る。

- [ ] 決定前はsourceが変わらない。
- [ ] 実GUIでRejectすると非変更、Applyすると提案全体だけが反映される。
- [ ] 読出し後にeditorを閉じる/元sourceを変えるとstale拒否になり、提案UIを出さない。
- [ ] MCPを停止すると保留提案がキャンセルされる。

この操作は実GUI側で利用者が行う。scriptが実Workspaceの提案を自動承認する仕組みは追加していない。

## 4. 社内移行（未実施）

1. 上記GUI確認が済んでから担当者が入替を行う。未保存作業を保存/退避する。
2. 初回は旧DesktopとAIクライアントが起動している旧MCPプロセスを停止する。
3. MCP通信世代1を備えた新Desktop/MCPへ入替し、既存設定のexe pathが正しいことを確認する。
4. AIクライアント側でMCPプロセスを再起動し、実exeの識別情報とsessionのcompatible状態を確認する。
5. 同じ通信世代なら後日のUI修正等は片側だけ更新してよい。API追加等で世代が変わる場合は対応世代を揃える。
6. 問題があれば部分入替を続けず、既知の対応するDesktop/MCP組に戻す。旧版同士の安全性が今回の新guardで改善されるわけではない。

稼働中のアプリ停止・実利用者のファイル置換・AI設定変更・配布物/installer作成はこのターンでは行っていない。CLIの製品動作・version・配布物、Homepageも変更しない。commit/pushなし。

次の確認: 確認用Workで更新提案の手動操作を確認する。ここからは実Workspaceへの作成・更新を伴うため、読み取り専用試験の範囲を越えて自動実行せず、対象と実施許可を確認してから進める。トースト連発の有無・Desktop編集/保存/実行・Popover全体の配置/scroll・Pro実環境・社内入替も未確認として残す。
