# 共通TypeScriptへの初期移行

2026-10-13。30のGUI動作確認はユーザーから問題なしとの報告を受けた。第6段階として、分離済みTypeScriptを`packages/runtime-core`へ移した。

## CLI着手時の確認事項

ユーザーの追加指示: **CLIアプリを作り始める前に、フォルダ名とコマンドライン引数の仕様を必ず確認する。** `apps/cli`は構成案にある名前であり、今回のアプリ作成の承認として扱わない。現時点では製品CLIのフォルダ、Cargoアプリ、入口、引数仕様を作成していない。既存V8実験のstdin JSONは検証プロトコルで、将来のCLI仕様とは別。

## 移行内容

新しい共通packageは`@trace-kernel/runtime-core`。ソースは20モジュールで、npm依存とpackage-lockを独立して管理する。

- execution 8: Workプラン/API権限、I/O context、Work context、dataset準備、予約API/state生成、Work実行、共通完了処理、出力scheduler。
- transaction 4: model、I/O port、verification、service。
- data 4: データ変換/文字コード、path、env名の検査、Work名の検査。
- workspace 3: 読込準備、検証、generation互換性判定。
- model 1: Workspace/domainの型、文字コード、出力方式、validation target。

Desktopの元の19ファイルはre-exportのみになった。状態モデル9ファイルのWorkspace/domain型は共通定義のaliasになり、GUIの状態factory・store用の型・dataset表示用の型はDesktopに残る。規則と実装を両方の場所へコピーして維持しない。

TS sourceをexportするpackageとして、利用するbundlerが変換する。唯一のruntime npm依存は既存と同じencoding-japanese 2.2.0。TypeScriptと型定義も固定し、UI/Tauri/Node依存は追加していない。共通PackageはDesktopをimportしない。

## 開発サーバーと試験

- Viteのdev serverがリポジトリ内の共通sourceを配信できるよう、fs.allowをリポジトリrootへ設定した。ユーザーのホーム等をallowに追加していない。
- `test:shared-runtime-dev`は一時的なlocalhostの空きportでViteを起動し、共通module、文字コード依存、DesktopのbridgeをHTTPで取得する。終了時はserver.closeする。
- npmの`check`には`test:runtime-core`を追加した。共通package自身の型検査と、全import/exportの依存検査を実行する。package外への相対import、未申告の外部依存、Svelte/Tauri/Node依存、動的importを拒否する。
- 既存のbehavioral試験は、必要な箇所で共通sourceを直接検査し、その他はDesktopのbridge経由で同じ実装を読めるようにした。MCPのAPI coverageも共通sourceを確認する。
- Rust比較用fixtureの実行/context/transaction/data/schedulerは共通packageを直接importする。個別APIの残るDesktop依存まで除去済みとは扱わない。

## 新しいcheckoutでの準備

```powershell
npm ci --prefix packages/runtime-core
npm ci --prefix apps/desktop
npm --prefix apps/desktop run check
npm --prefix apps/desktop run test:shared-runtime-dev
npm --prefix apps/desktop run build
```

新規package-lockと共通sourceも引継ぎ対象。node_modulesはGit管理対象外。

## 検証結果

- Desktop `npm run check`成功。型エラー/警告0、MCP/API検査成功、transaction 37、lifecycle 134、Workspace 5、execution plan 2、context 7、execute 3件成功。共通packageの20モジュールの型・依存検査も成功。
- `test:shared-runtime-dev`成功。共通module/文字コード依存/bridgeを実際にHTTP取得し、一時serverを閉じた。
- `npm run build`成功。source-mapのurl外部化と大きなchunkに関するビルド警告は残る。Desktop Workerを含むbundle生成が完了した。
- Rust比較は共通packageを使ったfixtureで両候補30件ずつ成功。Workバンドル526,078 bytes。実native接続の検証結果は32を参照。

## 次のステップ

32でV8検証ホストと実native I/Oを接続する。共通packageへ移した後のGUIで通常のWork/Logic・dataset・transactionを確認したら、残る個別APIとprocess/HTTP/parser等のnative機能の共通化を続ける。CLIアプリ本体の着手前には冒頭の確認事項を守る。
