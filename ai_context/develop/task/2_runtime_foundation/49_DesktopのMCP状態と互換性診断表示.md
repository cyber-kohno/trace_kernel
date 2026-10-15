# DesktopのMCP状態と互換性診断表示

2026-10-16。46の第4工程の残対応を依頼され、実装した。
後続の第5工程の自動検証と実GUI確認手順は [50](50_DesktopとMCPの組み合わせ検証と社内移行.md)を参照。
開始画面のmcp gen表示は前の依頼で追加済み。本工程ではワークスペースを開いた後のMCP詳細を整備した。
MCPの外部通信契約・世代値・製品versionは変更していない。診断はDesktop内部のIPCで取得する。

## 表示内容

- MCP詳細欄へDesktopの製品version、MCP通信世代、診断用API/Workspace世代を追加。
- AvailableをPublished（公開中）に変更。公開しただけでは相手との互換性を確認できていないことを説明する。
- 互換なbridge要求をGUIへ転送できた後はVerified requestと表示する。HTTPの要求受付履歴であって、現在の接続継続を保証するConnected表示ではない。
- 実測していなかったClients表示を撤去。代わりに互換要求の受付件数、互換性拒否件数、最終受付時刻を表示する。healthの成功だけでは受付確認済みにしない。
- 最新の互換性拒否についてcode、Desktop/相手のMCP世代、回数、最終時刻、理由と対処を表示。
- 世代なし（旧方式）、不正な情報、世代不一致を区別する。更新案内は同じMCP世代にすることとAIクライアント側のMCPプロセス再起動。製品versionの一致は要求しない。
- 相手の製品versionはbridge要求に含めていないため表示しない。相手世代が取得できない場合はUnknownとし、不正値を反射しない。
- MCP側の事前拒否はDesktopへ届かず、この履歴には現れないことを明示。表示のためだけに外部通信契約や通知endpointを追加していない。
- 一つの相手の拒否でbridge全体をエラー/停止状態にしない。他の互換な相手は利用できる。

## 診断情報の保持・取得

- native-coreのmcp_diagnostics.rsへセッション単位の診断を分離。Desktopのmcp_diagnostics Tauri commandで安全なsnapshotを取得する。
- 同じcode/期待世代/相手世代の拒否を集約し、最新8グループだけ保持。セッション全体の拒否件数も記録する。カウンターは飽和加算。
- token、source、method/params、不正入力の生値、相手からのエラーメッセージを保持しない。未認証要求では診断も更新しない。
- 拒否時に追加のGUI eventやトーストを発行しない。処理前拒否の契約と、通知連発防止を維持する。
- UIは取得完了後1秒で次を取得し、通常のpollを重ねない。開始/停止時はpause/resume、画面破棄時はdisposeする。古い応答・失敗・キャンセル済みtimerは後続状態を上書きしない。
- 停止後は診断を消し、再公開は別セッションとして0件から開始する。停止後にdescriptor清掃だけ失敗した場合は、セッション情報を残し、Stop MCPで再試行できる。
- 診断取得失敗時は確認不能と表示する。開始/停止エラーや清掃待ちも詳細に表示し、外部MCPプロセスを強制停止したり設定を書き換えたりしない。
- ワークスペースClose時にMCP停止が失敗した場合は、ワークスペースを閉じず、停止の再試行を促す。

## 主な変更箇所

- crates/native-core/src/mcp.rs / mcp_diagnostics.rs
- apps/desktop/src-tauri/src/mcp.rs / lib.rs
- apps/desktop/src/app/mcp/McpSessionBadge.svelte / mcp-session-types.ts / mcp-diagnostics.ts
- apps/desktop/src/app/contents/system/SystemMenu.svelte
- apps/desktop/scripts/test-mcp-diagnostics.mjs、package.jsonのcheck/test入口

## 検証と残作業

- 診断のTSテスト8件成功。公開/受付確認/停止/清掃失敗、対処文、実コンポーネントの開いたpopoverを用いるSSR表示fixture、pollの再開競合/古い結果の破棄/unmount/障害復帰を検査。
- nativeのMCPテスト9件、MCP全体31件、Desktop Rust36件成功。Rust側で拒否の集約・上限・飽和加算、秘密情報非保持、未認証/health非加算、停止/再公開リセットを確認。
- MCP API coverage/behavior/GUI-context整合性、既存TS回帰191件成功。
- Svelte型検査は0 errors / 0 warnings、製品Vite build成功。native全体は113件成功・従来のfixture6件ignored、native libのClippy成功。Prettier/rustfmt/git diff --checkも確認。Viteのurl外部化・chunk size、MCPのtool_router未読等の既存警告は残す。
- SSR fixtureは開いた状態にするためテスト入力内でexpandedの初期値だけ変更している。実GUIのクリック操作・レイアウト・Tauri IPCまで確認したものとは扱わない。
- 次は第5工程の実GUIでのFree/Pro、plain/channel、承認・拒否の確認と社内移行。最終Desktop exe/installerの作成・公開配布は未実施。
- CLI、Homepage、配布済みexe/ZIP、AIクライアント設定、MCPの外部契約は変更していない。commit/pushや稼働中アプリの停止も行っていない。
