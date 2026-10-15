# FS/VFSとWorkspace基盤の共通化

**その後の進捗:** 型宣言/意味解析、標準lib/コンパイラasset、channel/MCP境界の共通化は [35_型宣言assetとchannel_MCPの共通化](35_型宣言assetとchannel_MCPの共通化.md) を参照。本資料の残作業と試験件数は本工程時点の記録。

2026-10-13。33のGUI確認についてユーザーから問題なしと報告を受けて続行した。FS/VFSとtransaction計画正規化に続き、Workspace圧縮・既存migration状態・ライセンス署名検証・TypeScript変換まで共通化した。

**製品CLIはまだ作成していない。** CLIアプリのフォルダ名とコマンドライン引数の仕様は、作り始める前にユーザーへ必ず確認する。既存実験ホストと試験スクリプトの入力は製品CLIの仕様ではない。

## FS/VFSと計画正規化

- `packages/runtime-core/src/api/fs/`へDclFileSystem、RealFSWriter、transaction API、open/save/update/copy/rename/delete/makeDir、path検証を移した。
- RealFSWriterは`create(native: NativeCall)`でhostのtransportを受け取る。DclFileSystemのfactoryもNativeCallを受け取る。OpenTextとtransaction factoryは生成されたfilesystem portを受け取る。host選択・execution所有はhost adapterが担当する。
- パス規則、readText/openTextの事前50MiB検査、encoding、tokenのidentity、transactionの一度だけ生成、履歴/予約pathの検査、直接FS操作の要求形は維持した。
- `transaction/tx-plan-normalize.ts`へVFSからorderへの変換を移した。Desktopのreview UIと両JSホストが同じ実装を利用する。order列挙順、snapshot、未変更openの除外等も維持する。
- `data/file-types.ts`を正本にし、DesktopのTauriDto.FileStat/FileRequest/TextEncodingをaliasへ変更した。共通側からTauriDtoを参照しない。
- Desktopの既存パスは薄いfactory/再export bridge。既存の利用側の引数や公開型宣言は変えていない。

## Workspace・ライセンス・コンパイラ

- `workspace/workspace-codec.ts`へ既存のgzip/Base64圧縮・復元を移した。`window.btoa`を標準globalのbtoaへ変更し、windowのないhostでも利用する。`prepareFile(content, currentGen)`は復元後に既存のWorkspace compatibility判定を行う。
- Pakoは途中で切れたgzipに対して例外なしでundefinedを返す場合があるため、復元結果がstringでなければ明示的に拒否する。正常な保存形式は変更していない。
- `workspace/workspace-migration.ts`へ既存State/create/startを移した。currentGenを利用側から受け取る。Desktopにはstore更新、dialog/open、dirty snapshot、title更新を残した。
- **既存migrationはWorkspace本体を保持しgen headerを更新するだけ。今回、世代ごとのschema変換を実装したわけではない。** compatibility warning/rejectionと明示的migrationの入口は維持し、読込時に自動migrationをしない。
- `license/license-util.ts`へ既存public keyによるEd25519署名検証、payload検査、表示変換を移した。Desktopにはlicense.jsonの保存/起動時読込を残した。失敗時に保存keyを消す既存動作も維持した。
- `compiler/typescript-util.ts`へ既存transpileModule設定と変換を移した。DesktopのWork/Logic/MCP解析もこのmoduleがexportする同じTypeScript instanceを利用する。semantic解析規則そのものはまだDesktopにある。
- 固定runtime依存を追加: Pako 2.1.0、TypeScript 5.6.3、@noble/ed25519 3.0.0、@noble/hashes 2.0.1。型依存@types/pako 2.0.4。いずれも既存Desktopのlockと同じ版。TypeScriptをdev依存からruntime依存へ移した。
- 初回のoffline npm installでは制限sandbox内のcacheにregistry metadataがなく失敗した。既存Desktopのlock情報を照合して共通lockへ反映し、既存cacheを使用するsandbox外のnpm ci --offlineで再現した。

共通packageは29から47モジュールになった。新規18モジュールはFS/VFS 12、file types、plan normalize、codec、migration、license、compiler。UI/store/Tauriをimportしない型・依存境界検査を継続する。

## V8と比較fixture

- V8 bootstrapへDeno公式atob/btoaを追加。native decoderの`DOMExceptionInvalidCharacterError`をDOMException builderへ登録した。不正Base64の例外がundefinedになる状態を検出し、この登録で修正した。
- Web API試験へbinary byte/空白/padding省略/不正文字/Latin1外文字の検証を追加し、13件になった。
- 両engineのWork fixtureはFSとTxPlanNormalizeも共通packageを直接importする。WorkerInvokeへのesbuild aliasは不要になった。
- compiler fixtureも共通packageへ切り替えた。Work/Compilerの両bundleでDesktop source依存を禁止する。runner自身のesbuild等の開発toolはDesktopのnpm環境を使用する。
- 新規`experiments/js-host-v8/verify-workspace.mjs`は共通codec/migration/licenseだけをbundleする。gzipのNode zlibとの相互運用、Unicode、世代別判定、壊れた入力、移行前の状態保持、既存public署名fixtureをNode cryptoで独立に確認した結果との一致、改ざん拒否、既存trkファイル7件を検査する。
- この試験は圧縮済みのtextをV8に渡す。ファイルpathからWorkspaceを読み、Workを選び実行する製品入口や独立CLIを追加したわけではない。

## 検証

```powershell
npm ci --prefix packages/runtime-core
npm --prefix apps/desktop run check
npm --prefix apps/desktop run test:shared-runtime-dev
npm --prefix apps/desktop run build
cargo build --release --locked --manifest-path experiments/js-host-v8/Cargo.toml
node experiments/js-host-common/compare-engines.mjs
node experiments/js-host-v8/verify-host.mjs
node experiments/js-host-v8/verify-native-io.mjs
node experiments/js-host-v8/verify-native-services.mjs
node experiments/js-host-v8/verify-workspace.mjs
```

Frontend checkは0 errors/0 warnings、API coverage/behavior/context整合、transaction 40件、lifecycle 134件、Workspace 5件、plan 2件、context 7件、Work実行3件が成功。共通47モジュールの型/import境界も成功。新規transaction試験3件は複数factory間のnative transport/VFS/tokenの分離、サイズ超過時にbyte読込しないこと、read失敗時にtoken/orderを残さないことを検査する。

Desktop本番build、共通依存を含むdev server配信、V8 release build、両engine比較各30件、V8 Web API等13件、実I/O14件、実nativeサービス19件、Workspace/license 21件が成功。今回Rustのnative実処理は変更していない。

dev server試験はpako追加時の再最適化後にcloseが完了しない状態を観測した。試験対象のencoding/Pakoを明示的に最適化し、全appの自動依存探索をこのfixtureだけ無効にした。配信とserver.closeの完了を検査して終了コード0を確認した。製品dev server設定は変更していない。

TypeScriptを共通へ移した直後はDesktopと共通の2つのcompilerがbundleされ、通常Node heapの約2GiBでbuildが失敗した。解析側も共通instanceへ揃えると、heap増量なしでbuildが成功した。重いbuild中の短期限engine検証は避ける。既存のsource-mapのurl外部化・chunkサイズ警告は残る。

## 残作業・保証限界

- generation metadata、予約API/context/Declareの型宣言生成、TypeScript標準libとsemantic解析のasset/host境界は未完了。transpileModuleはsemantic型検証ではない。
- V8のchannel永続化・MCP実接続と、Workspace→Workを通した入口は未接続。
- 圧縮復元全体のsize上限やmigration schema変換、全Rust確保/RSS上限、security sandbox、クリーンPC配布は今回の保証に含まない。
- appの表示版`v0.2.0`は既存のユーザー変更を維持した。commit/pushはしていない。

## ユーザー確認と次のステップ

再ビルドしたGUIで、既存Workspaceの読込→保存→再読込と、FS/VFSを使うWorkの結果・transaction確認/適用を確認する。既存Professionalライセンスがある場合は、再起動後の認識も確認する。新しいproduct keyの購入や発行は不要。

問題がなければ、型宣言・標準lib/コンパイラassetの共通化と、残るchannel/MCPのnative境界を進める。CLIアプリ作成の直前にフォルダ名・実行入口名・コマンドライン引数の具体案を確認する。
