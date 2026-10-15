# DesktopとMCPの互換性整備計画

**進捗追記（2026-10-16）:** 第1工程は [47](47_DesktopとMCPの識別情報と共通契約.md)、第2/3工程は [48](48_DesktopとMCPの通信世代検査と接続保護.md)、第4工程は [49](49_DesktopのMCP状態と互換性診断表示.md)で実装済み。製品version/API世代の一致判定とreleaseIdは廃止し、MCP通信世代だけを接続互換性キーとして両側の通信経路で検査する。第5工程は自動検証を先行したが、GUI実接続と社内移行は未完了。

作成・改訂日: 2026-10-16。アプリ側のみの実装計画。第1工程は実装済みで、残りは以下の方針で進める。
**第5工程の追記:** [50_DesktopとMCPの組み合わせ検証と社内移行](50_DesktopとMCPの組み合わせ検証と社内移行.md)で自動検証入口・実プロセス隔離検証・読み取り専用の実接続チェック・手動移行手順を整えた。実Tauri GUI/実ライセンス/社内入替は未完了で、全工程完了とは扱わない。
外部公開・本格運用前で、現在の利用者は社内メンバーに限られる。旧接続形式の後方互換を維持するために複雑化せず、この機会に境界を整理する。

## 1. 目的と適用範囲

目的は、Desktopだけ、またはMCPだけが更新された場合でも、不整合な組み合わせによる解説の誤用・要求の誤解釈・Workspace変更を防ぐこと。
**MCP通信世代が一致するDesktop/MCPだけ接続を許可**する。製品version・API世代・Workspace世代は接続条件にしない。
互換性のない接続だけを拒否し、Desktop単体の編集・Work実行は利用できる状態を保つ。

対象:

- Desktopの製品識別・MCP bridge・接続状態表示。
- 独立MCPサーバーの製品識別・セッション発見・要求/応答・内蔵解説の対象表示。
- 両アプリが使用する軽量な接続契約と判定処理、ビルド検査、回帰試験。
- 社内で新旧を入れ替える手順と開発資料。

対象外:

- Homepageの設計・文面・ダウンロードリンク変更。
- DesktopへのMCP同梱、installer/ZIP生成、配布URL、署名、自動更新。
- CLIの引数・実行動作・製品version変更と、確認済みCLI exe/ZIPの再生成。
- `.trk`保存形式、Workspace世代/API世代の値や意味の変更、保存ファイルの移行。
- 標準MCPプロトコル版やSDKの更新、MCPの新機能、異なるMCP通信世代間の互換保証・交渉。
- ライセンス・OSS表記等、[44](44_公開準備_OSS表記とクリーンWindows検証.md)の別課題。

## 2. 初回調査時の状態（第1工程の実装前）

- `native-core/src/mcp.rs` と `apps/mcp/src/server.rs` にSessionDescriptorが別々に定義され、sessionId/endpoint/tokenだけを持つ。
- `/health` はok/sessionIdを返す。MCP側はHTTP成功と文字列内のsessionIdで生存確認し、製品version・連携世代・API世代は比較していない。
- `/bridge` の要求はmethod/paramsで、Desktopは相手の互換性情報を確認せずWebViewへ転送する。
- API解説はMCPにビルド時埋込、live型宣言はDesktop経由で共通基盤から取得する。[45](45_MCPの共通ソース参照とAPI検査の追従.md)で検査側の参照漏れを修正したが、接続する製品同士の互換検査は未実装。
- ResourceのknowledgeVersion=1は資料の識別情報で、接続互換性の判定には使われていない。
- GUIのFileUtil.VERSIONはv0.2.0、DesktopのCargo/TauriとMCP Cargoは0.1.0。比較を追加する前に製品識別を揃える必要がある。
- 現在のWorkspace世代は0、API世代は1。これらは今回上げない。

以下のコードパスは `code/` を起点とする。

## 3. 採用する初期契約

### 識別情報と単一定義

| 情報 | 用途 | 初期方針 |
|---|---|---|
| releaseVersion | 利用者向け製品version | 同じソースからの製品ビルドではUI/Cargo/Tauri/MCP自己紹介を揃える。異なる製品version間の接続を妨げない |
| bridgeProtocolGen | Desktop⇔MCPの連携契約全体 | 唯一の接続互換性キー。初期値1。要求・応答・操作・MCP向けWork API・内蔵解説の対象仕様を含む |
| apiGen | Work APIの互換性世代 | 既存の共有定義から取得し、診断用に表示。接続判定には使わない |
| workspaceGen | 保存形式 | 診断用に表示してもよいが、MCP接続の互換判定とは分ける |

releaseVersion/bridgeProtocolGenの正本は `code/release/desktop-mcp.json`。releaseIdは設けない。
API/Workspace世代をMCP用の別定数として手書き複製しない。既存の共有定義から両Rust binaryとFrontendへ渡す経路を用意する。
既存gen-versionの公開export、共通packageの依存境界、MCP単体ビルドの成立を維持する。必要な形式整理は値を変えずに行う。
GUIのv0.2.0を基準に両アプリの製品versionを0.2.0へ整理済み。CLIの0.1.0へ波及させない。
Cargo等に宣言が必要な番号は生成/同期し、ビルド前検査で正本との差を拒否する。GUI表示だけを揃えて完了としない。

同じ配布済み製品versionの内容を別内容に差し替えず、変更時は製品versionを上げる。MCP通信世代は以下の連携契約の変更に応じて上げる。時刻・Git dirty状態・exe hashで世代を決めない。

### 互換性の判定

- 条件はbridgeProtocolGenの完全一致だけ。ローカルのビルド情報を正本とし、相手の世代が欠落・不正・0・異なる場合は拒否する。
- ProductIdentity（診断・ビルド情報）とBridgeContract（世代だけの接続契約）を分け、製品version/API/Workspace世代を接続判定へ渡さない。
- 小さい番号なら受理する、同じmajorなら受理する等の推定はしない。
- bridgeProtocolGenは標準MCPのprotocolVersionとは別。通信DTO、提供tool/resource、method、エラー、承認の意味、MCPから案内・利用できるWork APIや内蔵解説の対象仕様を変更する場合に更新する。後方互換なAPI追加でも上げる。API世代が変わる変更もMCP向け契約に反映されるため、MCP通信世代を上げる。
- GUIだけの修正、内部リファクタリング、既存契約どおりへ戻す障害修正では世代を上げない。障害修正という分類でもMCPに見える契約を変更する場合は上げる。解説の誤字修正だけなら不要だが、利用可能なAPI仕様を変える場合は上げる。
- Free/Proやplain/channel等の実行時の利用条件は従来のcontext/権限検査で扱う。ライセンス差を別世代として管理しない。
- capabilities交渉、世代の範囲指定、旧方式fallbackは将来課題とし、今回は実装しない。

世代値だけでソースの互換性が自動証明されるわけではない。リリース時にMCP向け契約の差分をレビューし、API宣言・内蔵解説・要求/応答・承認の回帰テストと世代更新の要否を確認する。更新漏れを製品version等の重複チェックで代替しない。
ビルド時のmanifest一致やRust/Frontend情報一致は、単一配布物内の組立不備を防ぐ検査であり、インストール済みDesktop/MCP間の接続判定ではない。

契約DTOと判定はDesktop/MCPで共有する。軽量な `code/crates/mcp-protocol` の追加を推奨する。
同crateはTauri、V8、UI、OS I/Oや実行処理を持たず、DTO・判定・エラーだけを担当する。型を使うためだけにMCPへnative-core全体の重いI/O依存を追加しない。
アプリ固有の識別情報は各ホストが渡し、共有ライブラリーがDesktopのUI状態を参照する構成にしない。

## 4. 実装工程

### 第1工程: 識別情報・共通契約・ビルド検査

1. release情報の正本、API世代の取得経路、MCP通信世代の更新規則を確定する。
2. 上記の軽量契約と、互換/非互換の純粋な判定処理を追加する。
3. Desktop/MCPの製品versionを統一し、それぞれが同じ識別情報を取得できるようにする。
4. Desktopの表示/設定/CargoとMCPの自己紹介・version表示を検査する。識別情報の変更をRustビルドが追跡するようにする。
5. 正本との不一致、世代の不正値、未更新の生成物をビルド検査で失敗させる。

主な対象: 両Cargo.toml、Desktopのtauri.conf.json/build.rs/Vite設定/FileUtil、MCP build情報、新規共通契約と検査script。
FileUtil.VERSIONは保存名にも使われるため、番号整理で意図せず拡張子・保存動作・Workspace移行を変えない。

完了条件: 両アプリの製品情報と連携契約を取得でき、単独ビルドも可能。同一ソースのmanifest不一致をビルド時に検出し、接続判定はMCP通信世代だけで行う。

### 第2工程: Desktop bridgeでの強制検査

1. descriptorと認証付きhealth応答へDesktopのBridgeContractと診断用の製品情報を追加する。互換性判定では診断項目の差異・拡張を拒否条件にしない。
2. 各bridge要求にMCP側のBridgeContractを必須とし、Desktop側で認証・形式・通信世代一致を検査する。診断用ProductIdentityを接続判定に混ぜない。
3. 不一致/情報欠落はWebViewへのevent送信・pending登録・処理開始より前に拒否する。read/create/update等で抜け道を作らない。
4. エラーに安定したcode、理由、双方のMCP通信世代、必要に応じ診断用の製品version、対応世代への更新/再起動の案内を含める。旧MCPにも説明が届くよう、可能な範囲で既存error.messageの形を維持する。「必ず製品versionを揃える」と案内しない。
5. bodyサイズ、接続数、deadline、認証、停止/join/descriptor削除の既存契約を維持する。

主な対象: `crates/native-core/src/mcp.rs`、Desktop `src-tauri/src/mcp.rs`。
互換性のない要求でWorkやWorkspaceを変更せず、提案dialogも表示しない。認証前に詳しい接続情報を開示しない。

完了条件: 新Desktopが、旧MCPの情報なし要求も、新MCPの不一致要求も処理前に拒否できる。

### 第3工程: MCPの発見・呼出・資料の対象表示

1. healthをHTTP成功やsessionIdの部分文字列ではなく、型付けした応答として解析する。接続・読込待ちに上限を設ける。
2. descriptorは接続候補情報とし、認証付きhealthの識別情報とsessionIdを確認する。descriptorだけを互換性の正本にしない。
3. 到達可能な非互換セッションを一覧から黙って消さず、「非互換/世代情報なし」と理由を提示する。死亡・不正descriptorとは区別する。
4. 対象session単位で互換判定し、非互換ならbridge要求を送らない。呼出のたびに対象を確認し、初回だけの確認や別sessionの結果を流用しない。
5. 全bridge要求へ自身のBridgeContractを付ける。Desktopの互換性エラーを汎用的なSession not foundに潰さない。
6. `get_work_context` 等の接続先情報と、内蔵解説/ResourceにMCP通信世代、診断用の製品version・API世代を示す。MCP未接続でも解説取得は可能だが、特定Desktopで利用可能と保証した表示にはしない。

主な対象: `apps/mcp/src/server.rs`、`resources.rs`、MCP内蔵instructions、共通契約。
tokenを持つ内部descriptorとエージェントへ返す公開DTOを分離し、一覧・エラー・ログ・GUIにtokenやWork source等を出さない。
標準MCPのtool/resource提供自体は、非互換Desktopが一つ見つかっただけでサーバー全体を停止しない。

完了条件: 新MCPが情報なしの旧Desktopや異なるMCP通信世代へ操作を送らず、製品versionが違っても同じ通信世代の接続先は利用できる。

### 第4工程: Desktopの状態・診断表示

1. MCP詳細表示へDesktopの製品version、MCP通信世代、診断用API世代を追加する。製品version差を非互換と表示しない。
2. 認証済み相手との互換性拒否を、双方のMCP通信世代と対応方法を含めて確認できるようにする。要求に相手の製品versionは含めないため、推測したversionを表示せず、通信世代を対処の基準にする。
3. 「公開中/到達可能」と「互換な相手との通信」を区別する。現在のavailableを接続確認済みと扱わない。
4. 一つの非互換クライアントの存在でbridge全体を止めない。拒否通知や診断履歴を無制限に蓄積しない。
5. 更新後はAIクライアント側のMCPプロセス再起動が必要なことを案内する。強制停止や外部設定の自動変更はしない。

主な対象: `mcp-session-types.ts`、`McpSessionBadge.svelte`、SystemMenu、必要なRust→UI通知。
接続数等のmetrics全体の再設計は行わず、今回の互換性表示に必要な範囲に絞る。

### 第5工程: 組み合わせ検証と社内移行

| ケース | 期待する結果 |
|---|---|
| 同一MCP通信世代 | 発見、参照、型宣言取得、validateが成功 |
| 製品versionが異なるがMCP通信世代は同じ | 接続を許可。UIだけの更新でMCPの更新を強制しない |
| MCP通信世代が異なる（製品versionが同じでも） | 拒否。双方の通信世代と対処を表示 |
| API/Workspace世代が異なるがMCP通信世代は同じ（判定関数のfixture） | 接続判定は許可。API契約変更時にMCP通信世代を上げる責務はリリースレビューで担保 |
| 新Desktopへ旧MCP形式の要求 | Desktop側で拒否。event/pending/変更を発生させない |
| 新MCPから旧Desktopのhealthを取得 | legacy/情報なしと表示し、bridge要求を送らない |
| 世代の欠損・不正型・0・相手が別世代 | 推定やfallbackをせず拒否 |
| descriptorとhealthの不一致 | 呼び出さず診断。古い情報を正常として使わない |
| 互換/非互換のDesktopが同時起動 | sessionごとに判定し、互換sessionは利用可能 |
| 認証失敗・停止中・遅延/不正応答 | 既存の保護を維持し、無期限に待たない |
| MCPだけ不整合 | Desktop単体の編集/保存/Work実行を阻害しない |

純粋な判定テスト、loopback bridgeの実送受信、MCPツール応答、UI状態の試験を分ける。
拒否試験では結果のerrorだけでなく、event sink未呼出・pending未追加・副作用なしも確認する。
任意の古いリリースの実行ファイルを自動取得・起動せず、まず旧形式fixtureで再現する。

共通Rust/native-core/Desktop/MCPのテスト、共通TSの型/依存境界、MCP API coverage/behavior/GUI整合性、Desktopのcheck/buildを再実行する。
MCP RustテストはDesktopのcheckに含まれないため、アプリ側の検証入口で両方を実行できるようにする。Homepageのビルドは今回の必須工程にしない。
CLIの製品再ビルドは行わないが、共有metadataを触る場合は既存CLI向けasset生成・build.rsの契約が壊れないことを確認する。

最後に新しいDesktop/MCPの実接続で、Free/Pro、plain/channel別の宣言とvalidateを確認する。
実Workspaceの作成・更新・Work実行は自動で行わず、必要な副作用試験には専用fixture/一時Workspaceを使う。

初回の社内移行は、既存MCPプロセスとDesktopの停止 → MCP通信世代1を持つ両アプリへ更新 → 既存の設定path確認 → AIクライアント側MCPの再起動 → 世代情報と接続確認、の順にする。以後は通信世代が変わらなければ片側だけの製品更新も許可する。
新しいチェックで過去の旧Desktop/旧MCP同士まで安全にできるわけではない。旧版を使い続ける運用は対象外とし、社内で入れ替える。
稼働中の社内アプリやAI設定を、実装担当が承認なしに変更しない。

## 5. 全体の完了条件と着手順

- DesktopとMCPが各自のMCP通信世代を持ち、同世代だけ接続できる。単一製品内のmanifestやFrontend/Rust情報のずれはビルド時に検出できる。
- 新旧/世代不一致は両方向で拒否され、不明な相手を許容しない。
- 内蔵API解説と接続先の対象関係を確認できる。
- 不一致の理由と再起動を含む対処方法が利用者に分かる。
- Desktop単体の機能と、既存の承認・停止・認証・API検証を維持する。
- 上記を自動テストと実接続確認で示し、未確認は未確認と記録する。
- Homepage・配布物・CLIの製品仕様は変更しない。

実装着手時は**第1工程の識別情報と共通契約から開始**する。次に第2/3工程を同じ変更単位で整え、UI、組み合わせ検証へ進む。
第2工程だけの途中状態は新旧が接続できなくなるため、社内利用者へ片側だけを配布しない。
アプリ側が完了してから、Desktop/MCPの同梱・単体配布、対応リリース表示、Homepageの導線を別計画として扱う。
