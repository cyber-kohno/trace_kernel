# DesktopとMCPの識別情報と共通契約

2026-10-16。[46の計画](46_DesktopとMCPの互換性整備計画.md)を1から順に進める指示を受け、第1工程を実装した。
その後のユーザー指示により、MCP通信世代だけを接続互換性キーとする設計へ改訂した。本資料は改訂後の状態を示す。
**本資料は第1工程時点の記録。** 接続時の強制検査は後続の [48](48_DesktopとMCPの通信世代検査と接続保護.md)で実装した。以下の「未実施」は本工程完了時点の状態を示す。
Homepage、installer/ZIP、CLIの製品version・引数・実行コード・確認済み配布物は変更していない。commit/pushも行っていない。

## 採用した識別情報

正本は `code/release/desktop-mcp.json`。

```json
{
  "formatVersion": 1,
  "releaseVersion": "0.2.0",
  "bridgeProtocolGen": 1
}
```

GUI表示v0.2.0を維持し、DesktopのCargo/npm/lock/TauriとMCPのCargoを0.2.0へ揃えた。
CLIは0.1.0のまま。ライブラリーcrateの内部package versionも製品versionと混同しない。
releaseIdは廃止した。同じ配布済み製品versionを別内容へ差し替えず、内容変更時には製品versionを上げる。製品versionは診断・配布物識別用で、接続可否のキーではない。

Workspace世代0・API世代1は既存の共有gen-version.jsの定数から読み取る。値・公開export・保存形式を変えず、別の世代定数を追加していない。
Rust/Nodeのbuild helperは、現在のJSON文字列リテラルとして定義されたexportを読む。動的式・欠損・重複・不正値は黙って推測せず失敗する。
MCP単体のRustビルドでNodeや共通JSの生成物を必要としない方式にした。Node側もimport cacheへ依存せず、変更時に元の定数を読み直す。

## 追加した境界

### 軽量な共通契約

`code/crates/mcp-protocol` を追加。依存はserde/serde_jsonだけで、Tauri/V8/OS I/O/アプリ状態を持たない。
ProductIdentity、BridgeContract、構造化されたCompatibilityError/code、検証・互換判定を提供する。

- 接続判定に渡すBridgeContractはbridgeProtocolGenだけを持つ。自分のビルドに埋め込まれた世代と相手の世代が一致すれば許可する。
- 世代情報なし、欠損、不正型、不正値、0、世代の不一致は拒否する。自分より新しい/古い番号を推測で受け入れない。
- 製品version/API/Workspace世代は診断・ビルド用のProductIdentityに残し、接続判定の入力には含めない。値の形式検証はビルド情報の検証であり、互換性の追加条件ではない。
- 不正入力の値や秘密情報をエラーメッセージへ展開しない。
- 現在の通信世代1の正本はrelease JSONだけ。共通crateやNode helperへ1を重複定義しない。別世代の製品も自分の埋込世代と相手を比較する同じ判定関数を使える。

MCP通信世代は要求/応答の形式だけでなく、method、エラー、承認、MCP向けWork API、内蔵解説の対象仕様を含む契約全体を表す。後方互換なAPI追加でも上げる。UIのみの修正や契約を維持する障害修正は上げないが、MCPに見える契約を変える修正では上げる。詳細な更新規則は46とrelease/READMEを正本にする。
API世代は従来どおり後方互換な追加では上がらなくてよい。接続判定のためにAPI世代の意味を変更しない。
世代の更新漏れは番号の比較だけでは検出できないため、契約差分のリリースレビューと既存のAPI/解説/動作検査を継続する。

### ビルド・表示

`code/release/build-support.rs` をDesktop/MCPのbuild.rsで共有し、識別情報を検証してOUT_DIRへ出力する。
Cargo package versionの不一致をビルド時に拒否し、Desktopではnpm/lock/Tauriのversionも確認する。入力ファイルの変更をCargoへ通知する。
必須manifestの番号は正本の鏡像で、独立したruntimeの正本ではない。同期更新し忘れた場合は検査で止める。

Desktop Viteには共通情報のvirtual moduleを追加し、FileUtil.VERSIONをそこから取得する。見た目のv0.2.0と保存名の規則は従来どおり。
dev/build時に両アプリのmanifestを検査し、Frontendへproduct-identity.jsonを出力する。
DesktopのRust releaseビルドではそのidentityが欠損/不一致なら拒否する。個々のJS assetまでhashで証明する仕組みではない。
開発中の識別情報更新はViteを再起動させるが、Rust側も再ビルド/再起動が必要。debugビルドはFrontendのdev serverを使えるよう、製品buildのreceiptを必須としない。

取得経路:

- Desktop: Tauri command `get_product_info`、FrontendのPRODUCT_INFO。
- MCP: `--version` / `-V`、`--version-json`、pingのidentity。
- MCPの標準serverInfo.versionもCargo経由で0.2.0。

MCPの引数なしstdio起動は維持した。pingのstatus=okはMCP自体の状態で、Desktopとの互換確認済みという意味ではない。
health/descriptor/bridge要求と内蔵Resourceの対象情報は、本工程ではまだ変更していない。

## 更新・検証手順

`code/release/README.md` に更新対象とコマンドを記載した。Desktopのnpm run checkにはprecheckでrelease検査を接続した。
新しいcrateと両アプリのCargo.lockを含む。既存依存のversion更新はなく、共通の既存Serde依存だけを使う。
開始時からのruntime-core/package-lock.jsonの変更、Desktop Cargo.tomlの他の内容、45の修正を維持した。

初回実装時に実行した結果（以下の件数は改訂前の記録）:

- mcp-protocol: 単体8件＋build helper3件、計11件成功。全targetのClippy `-D warnings` 成功。
- Node release検査: 7件成功。manifestずれ、不正metadata、Cargoのpackage外version、世代定数の不正/更新、Viteの出力/監視を確認。
- MCP: 9件成功。build成功。実debug exeのversion/version-json取得成功。
- Desktop: `cargo check --offline --locked --lib`、Rustテスト36件成功。
- Desktop: Svelte 0 errors / 0 warnings、製品Vite build成功。product-identity.jsonの生成とMCP実exeの情報との一致を確認。
- Transaction40、ライフサイクル134、Workspace5、実行plan2、I/O context7、実行/完了3、計191件成功。
- MCP API coverage/behavior/GUI整合性、共有moduleのdev配信テストが成功。
- 共通TSの型・61 module依存境界・CLI profile30件・共通asset生成が成功。assetのWorkspace/API世代は0/1を維持。
- 変更箇所のPrettier/rustfmt、git diff --check成功。

既存の警告（MCP tool_router未読、Desktop resource_limits再export、Viteのurl外部化/大きなchunk）は今回の対象外として残す。
Desktopの最終release exe/installerのlink・配布、実GUI経由の操作、新旧MCPの実接続は未実施。release時の不一致拒否はhelperのfixture試験で確認した。

### MCP通信世代のみの判定へ改訂した後の確認

- mcp-protocol: 単体10件＋build helper3件の計13件成功。全targetのClippy `-D warnings` 成功。
- Node release検査8件成功。通信世代をJSONだけで変更でき、共通crate/Node helperの固定値に依存しないことも確認。
- MCPテスト9件、Desktop Rustテスト36件成功。MCP debug buildとversion/version-json取得成功。releaseIdは出力しない。
- DesktopのSvelte検査0 errors / 0 warnings、Vite製品build成功。Frontendのproduct-identity.jsonとMCP実exeの4項目が一致。
- MCP API coverage、behavior、GUI/context整合性検査成功。rustfmt/変更したNodeファイルのPrettier/git diff --check成功。
- 同世代なら製品version差があっても許可、世代差は両方向で拒否、欠落/不正形式/0を拒否する純粋関数のテストを追加。API/Workspace世代を接続判定に混ぜないことも確認。
- 通信経路への適用、新旧実接続、GUI操作、最終Desktop exe/installerの確認は引き続き次工程。CLI/Homepage/既存の配布物は変更していない。

## 本工程完了時の次工程（実施結果は48）

46の第2工程（Desktop側の強制検査）と第3工程（MCP側の発見/呼出）を同じ変更単位で進める。
旧MCPが新metadataを無視して要求する場合も、DesktopがWebViewへの転送/pending登録前に拒否するようにする。
新MCPは旧healthの相手を情報なしと表示し、bridgeを呼ばない。複数sessionの判定を分離し、tokenを公開DTOへ出さない。
現段階は保護を有効化する前の中間実装であり、互換性対応済みの完成版として社内配布しない。
