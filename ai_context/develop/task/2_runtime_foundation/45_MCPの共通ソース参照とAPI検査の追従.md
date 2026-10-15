# MCPの共通ソース参照とAPI検査の追従

2026-10-16。ユーザーから共通基盤の外出しによるMCPへの影響確認、その後に修正の依頼を受けた。
CLIや配布ZIPの再生成、公開条件の変更、commit/pushは行っていない。開始時からのDesktop Cargo.tomlと共通package-lock.jsonの変更は維持した。

## 調査と再現

MCPの本番API解説は `code/apps/mcp/resources/*.md` をinclude_str!で埋め込む。
実装TSのinclude_str!は `src/resources.rs` のcfg(test)内にあり、解説・台帳・実装を照合するテスト用。エージェントへ実装ソースそのものを配信する仕組みではない。
`get_work_context` のapiDeclarations/contextDeclarationsはDesktopのProgramInjectionUtil経由で共通ApiDeclarations/ContextDeclarationsへ到達する。この本番経路の切断は確認しなかった。

ただし以下の2点を再現した。

1. Rustのsource照合テストが共通化前のDesktop側パスを参照していた。参照先は現在薄いアダプターになっているため、MCPのcargo testは6件成功・1件失敗。`expected output API source to contain $print` で停止した。
2. Desktopのcheck-mcp-api-coverage.mjsはネットワークのgetDeclare内の文字列配列だけから型を再構築していた。getTypeDeclareへ分離したNetRequest/NetResponseを読み込めず、到達メンバーは15でなく7に減少。skipLibCheckとWorkファイルだけの診断取得により欠落も検出しなかった。

後者は `$net.request({ url: 123 })` と戻り値の `nonexistentField` が検査を通り、本番の共通宣言ではTS2322/TS2339になることで確認した。

## 修正

### Rustテスト

`code/apps/mcp/src/resources.rs` の全6ファミリーを、`code/packages/runtime-core/src` の実ソース参照へ更新した。
APIの各実装に加え、出力/state/contextの生成処理、API型宣言、FS writerも実際の責務に合わせて参照する。
旧Desktopアダプターの文字列を検査したり、単に失敗するassertを削除したりしていない。

### API検査

`code/apps/desktop/scripts/check-mcp-api-coverage.mjs` は、テスト内で共通TypeScriptを読み込み、ApiDeclarations.createUtilDeclareDefを実行する。
networkだけでなく全APIの宣言・到達メンバー・解説サンプル検証を、本番と同じtypeDec/valueDecから作る。文字列配列/静的テンプレートの独自抽出を廃止した。
loaderの相対importは共通src内へ限定し、外部依存は共通packageを起点に解決する。実native呼出やWork実行はしない。

型検査は宣言ファイル自身も対象にし、skipLibCheckを無効化した。テストPCのambient @typesはtypes: []で持ち込まない。
既存5件に加えてネットワークの不正URL型、不正timeout型、不正query値、便利メソッドの不正option、存在しないレスポンスプロパティ、statusの型誤用の6件を追加した。
単に何らかのエラーが出るだけでなく、対応するTS2322/TS2339で拒否されることも確認する。
正しいrequest/responseの受理、全7グループの宣言の意味検証、request/responseの到達メンバー、未解決aliasがTS2304となることも回帰検査する。

## 検証

- `cargo test --offline --locked --manifest-path code/apps/mcp/Cargo.toml`: 7件すべて成功。
- MCPの `cargo check --offline --locked` 成功。既存のserver.rsのtool_router未読警告は残る。今回の修正対象ではない。
- API coverage: plain2、channel10、runtime2、state4、parser47、filesystem28、network15。解説のTypeScriptサンプル15件、誤用拒否11件、宣言・alias回帰検査が成功。
- `test-mcp-api-behavior.mjs` と `test-mcp-context-consistency.mjs` 成功。
- 共通TSのtsc --noEmit、61 module依存境界、CLI profile30件が成功。
- 変更JSのPrettier、変更Rustのrustfmt、git diff --checkを確認。

本番の型宣言・Work API・MCP応答形式は変更していないため、CLIやDesktopの製品build/ZIPの再生成は今回実施しない。
実GUI/MCP接続でのread/validateのsmoke testも未実施。自動検証を実接続確認済みと扱わない。

## 次の工程

Desktopのcheckだけでなく、独立したMCP Rustテストも継続して実行する。CIを追加する場合は両方を対象にする。
次は再ビルドしたDesktop/MCPの実接続で、解説取得、get_work_contextのFree/Pro・plain/channel別の宣言、正しい/誤ったWorkのvalidateを確認する。Workの作成や実行は確認のために勝手に行わない。
CLI公開前のクリーンWindows検証、残るOSS表記3件、利用単位/再配布条件等の残課題は [44](44_公開準備_OSS表記とクリーンWindows検証.md) のまま。今回のテスト修正で公開条件が解消したとは扱わない。
