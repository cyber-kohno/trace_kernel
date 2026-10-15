# DesktopとMCPの通信世代検査と接続保護

2026-10-16。ユーザー承認に基づき、46の第2/3工程を実装した。
後続の第4工程は [49](49_DesktopのMCP状態と互換性診断表示.md)で実装済み。以下の残作業は本工程完了時点の記録。
接続互換性の条件は **MCP通信世代 bridgeProtocolGen の一致だけ**。
製品version/API/Workspace世代は診断用。releaseIdは導入しない。
初期世代1は外部配布前の新契約として維持した。旧方式へのfallbackはない。

## Desktop側の強制検査

- native-coreの起動時にDesktopのビルド済みProductIdentityを注入する。native-coreがGUIや製品metadataファイルへ依存して読み込む構成にはしない。
- 内部descriptorと認証付きhealthにBridgeContractと診断情報を載せる。共通crateへdescriptor/health/request DTOを移した。
- 全bridge要求について、認証 → envelope解析 → contractの形式・世代一致 → sessionId一致 → pending登録/GUI event、の順で処理する。
- 情報なし・不正形式・0・異世代はHTTP 409と安定した互換性エラーを返す。旧MCPが読めるerror.messageを残し、双方の世代を返す。不正な入力値、token、Work sourceをエラーへ反射しない。
- 要求のsessionIdと実際のDesktopセッションが異なる場合も処理前に拒否する。health確認後のポート再利用で別Workspaceへ誤送信することを防ぐ。
- 未認証では世代情報を返さない。サイズ/接続数制限、read deadline、承認待ち、停止時cancel/join/descriptor削除は維持する。
- Desktop単体の操作や、別の互換なクライアントを停止させる機構は追加していない。

## MCP側の発見・呼出

- 接続処理をapps/mcp/src/bridge.rsへ分離した。内部descriptorのtokenを含むDTOをtool結果へserializeしない。
- 公開SessionViewはsessionId/endpoint、status、compatible、双方のcontract、必要に応じ診断情報とerrorだけを持つ。
- statusはcompatible/incompatible/legacy/invalid/unavailable。到達可能な非互換相手も理由付きで残す。壊れたdescriptorファイルは読み飛ばし、到達不能な相手はunavailableとして表示する。
- descriptorの情報だけでは判断せず、認証付きhealthのHTTP status/JSONの型/ok/sessionId/contractを検査する。部分文字列による生存確認を廃止した。
- descriptorのcontractがある場合はhealthと照合する。descriptorに世代がなくても、認証済みhealthの有効な世代を正本として使える。診断情報の欠落・拡張・version差は接続拒否にしない。
- 同じsessionIdのdescriptor重複は一覧でもinvalidとし、呼出でも拒否する。曖昧な接続先を自動選択しない。
- 各操作で対象sessionだけを再確認し、非互換ならPOSTを送らない。初回確認のキャッシュを別sessionや後続操作へ流用しない。
- 全bridge要求へ自身のcontractとsessionIdを付加する。health後にDesktopが返した互換性エラーもcode/双方の世代/messageを保持し、Session not foundへ潰さない。
- discovery/probeの同期通信はspawn_blockingで実行する。

MCPは数値のloopbackアドレスだけへ接続する。tokenの改行等を拒否し、descriptor読込は16 KiB、HTTP headerは16 KiB、応答bodyは32 MiBまで。
connectは500 ms、healthは2秒の絶対deadline。bridgeは通常35秒、更新提案は605秒（Desktopの承認待ち600秒に余裕を加える）。送信にもdeadlineを適用する。
Content-Lengthで応答を読み、切断までの無期限readや、少量ずつの応答でtimeoutが延び続ける状態を避けた。不正HTTP/JSONの生データをエラーに含めない。

## API解説と接続先情報

- get_work_contextの既存結果へmcpConnectionを追加し、確認済みcontract、Desktopの診断情報、MCPの診断情報を返す。従来のcontext/apiDeclarationsは変更しない。
- Resourceの本文・metadata、get_api_reference、server instructionsで内蔵解説の対象MCP通信世代を示す。特定Desktopとの接続確認済みという意味にはしない。
- 世代一致後も、live型宣言、Free/Pro、plain/channel、既存の検証・承認を引き続き使う。

## テストと確認結果

- 共通契約: 単体11件＋build helper3件、計14件成功。strict Clippy成功。
- MCP: 30件成功。実際のnative bridgeソースをtest targetへ読み込み、loopback TCPでクライアントと両側を確認する。uuidはテスト専用依存で、MCP製品へnative-coreの重いI/O依存を追加していない。
- native-core全体: 112件成功、子プロセスfixtureの6件は従来どおりignored。MCP専用8件も再実行して成功。
- Desktop: cargo check成功、Rustテスト36件成功。Svelte検査0 errors / 0 warnings。
- MCP API coverage/behavior/GUI-context整合性、TS回帰191件成功。保存・実行・停止等の既存動作を確認した。
- MCP debug build成功。実exeのstdioを初期化し、tools/list、ping、resources/list/read、get_api_referenceを確認するscripts/test-stdio.mjsが成功。実Workspaceの発見・操作は行わない。
- 互換性の試験は、製品version違いの同世代、異世代、旧形式、欠損/不正/0、descriptorずれ、重複ID、複数session、health→bridge間の拒否、timeout/不正応答、秘密情報非公開を含む。
- 拒否時はGUI event未発行・pending未登録をnative側で確認。旧形式/異世代へのPOSTが0回であることもMCP側で確認した。

MCPの既存tool_router未読、resourcesのtest module後の定義、Desktopのresource_limits再exportは既存のwarningとして残す。製品の依存version更新は行わず、既存uuidのversionも維持した。

## CLI・配布物と残作業

- native-coreが軽量mcp-protocolへ依存するため、native-core/Desktop/CLIのCargo.lockへそのローカル依存だけを反映した。CLIの引数・製品version・Work実行や配布済みexe/ZIPは変更していない。
- CLIのcargo treeをofflineで試したが、この環境にdeno_coreのindex/cacheがなく、CLI全体のCargo解決・ビルド確認は未実施。CLI lockはローカルpackage追加だけの最小変更に留めた。CLI再ビルドを成功扱いにしない。
- GUIの診断表示は次の第4工程。拒否理由は現状MCP tool結果で取得できるが、Desktop側の履歴表示等はまだない。
- 第5工程のGUI実接続（Free/Pro、plain/channel、明示承認）と社内入替確認は未実施。最終Desktop exe/installerのlink、公開配布・Homepage整備も未実施。
- commit/push、既存の社内Desktop/MCP停止、AIクライアント設定変更は行っていない。開始時からのユーザー差分も維持した。

次は第4工程のDesktop診断UI。その後に実GUIでの最終確認と社内移行を行う。
