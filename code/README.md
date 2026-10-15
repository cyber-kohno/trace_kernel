# プログラムとビルド

プログラム群はこの`code/`配下にまとめる。Gitやエージェントなど、リポジトリ全体の設定はリポジトリ直下に置く。ビルド用スクリプトや新しい共通モジュールも原則この配下へ追加する。

## 配置

| 配置 | 内容 |
|---|---|
| `apps/desktop` | Tauri GUI。Cargo/binary名`trace-kernel`、Windows実行ファイル`trace-kernel.exe` |
| `apps/cli` | 独立したV8 CLI。`trace-kernel-cli.exe` |
| `apps/mcp` | AI連携用MCPサーバー |
| `apps/homepage` | 公式サイト（Astro） |
| `apps/license-server` | ライセンス発行サーバー |
| `apps/generate-license-keypair` | ライセンス署名の鍵生成ツール |
| `crates/native-core` | 共通Rust。ファイル・process・HTTP・DOM・Excel・channel・MCP等 |
| `crates/mcp-protocol` | Desktop/MCPの軽量な識別情報・通信契約・通信世代による互換判定 |
| `packages/runtime-core` | 共通TypeScript。Workspace・型検証・Work実行・API・VFS等 |
| `release` | Desktop/MCPのリリース正本・ビルド検査・更新手順（CLIとは別） |
| `experiments` | QuickJS/V8の比較・回帰確認用ホストとスクリプト |

`apps/cli`は承認済み引数・ライセンス仕様を実装した。ビルド・利用方法・終了コードは [CLI README](apps/cli/README.md) を参照する。
リポジトリの名前`trace_kernel`と、Rust内部の識別子`trace_kernel_lib`等は維持する。

## Desktopのセットアップと起動

以下のコマンドは**リポジトリ直下**から実行する。Node.js/npmとRust/Tauriのビルド環境が必要。

```powershell
npm ci --prefix code/packages/runtime-core
npm ci --prefix code/apps/desktop
npm --prefix code/apps/desktop run tauri -- dev
```

既存の`node_modules`や`target`は各モジュールと一緒に移動している。Tauriとプラグインの生成キャッシュは旧絶対パスを含むため、今回の移動で選択的に削除・再生成した。他のキャッシュは維持しており、移動後の最初のビルドでは再コンパイルが発生することがある。

## Desktop・共通基盤の検証

Desktop/MCP互換性の自動検証をまとめて実行する入口（既存依存を使用、offline/locked、GUIや実Workspaceへの接続なし）:

```powershell
node code/release/check-desktop-mcp-suite.mjs
```

実GUI・ライセンス・社内入替の確認手順は [組み合わせ検証と社内移行](../ai_context/develop/task/2_runtime_foundation/50_DesktopとMCPの組み合わせ検証と社内移行.md) を参照。

```powershell
node code/release/check-desktop-mcp.mjs
node code/release/test-desktop-mcp.mjs
cargo test --locked --manifest-path code/crates/mcp-protocol/Cargo.toml
cargo test --locked --manifest-path code/apps/mcp/Cargo.toml
npm --prefix code/apps/desktop run check
npm --prefix code/apps/desktop run test:shared-runtime-dev
npm --prefix code/apps/desktop run build
npm --prefix code/packages/runtime-core run build:assets
cargo test --locked --manifest-path code/crates/native-core/Cargo.toml
cargo test --locked --manifest-path code/apps/desktop/src-tauri/Cargo.toml --lib
cargo build --locked --manifest-path code/apps/desktop/src-tauri/Cargo.toml --bin trace-kernel
```

## V8と比較ホストの検証

```powershell
cargo build --release --locked --manifest-path code/experiments/js-host-v8/Cargo.toml
cargo build --release --locked --manifest-path code/experiments/js-host-quickjs/Cargo.toml
node code/experiments/js-host-common/compare-engines.mjs
node code/experiments/js-host-v8/verify-host.mjs
node code/experiments/js-host-v8/verify-native-io.mjs
node code/experiments/js-host-v8/verify-native-services.mjs
node code/experiments/js-host-v8/verify-workspace.mjs
node code/experiments/js-host-v8/verify-shared-assets.mjs
node code/experiments/js-host-v8/verify-channels.mjs
```

V8の短いdeadlineを使う検証は、重いRust/Frontendビルドの終了後に実行する。JSホスト検証スクリプトは呼出元のcurrent directoryではなくスクリプトの配置から`code/`を解決する。

## その他のアプリ

```powershell
npm ci --prefix code/apps/homepage
npm --prefix code/apps/homepage run build
cargo check --locked --manifest-path code/apps/mcp/Cargo.toml
```

各アプリの作業ディレクトリも新配置に合わせる。IDEは`code/apps/desktop`またはリポジトリ直下を開く。MCP起動などで絶対パスを外部設定に登録している場合は、`code/apps/mcp/target/release/trace-kernel-mcp.exe`等の新配置へ変更する。

## 資料

- 開発資料：`../ai_context/develop`
- 利用者向け説明：`../ai_context/docs`
- 配置変更の引継ぎ：`../ai_context/develop/task/2_runtime_foundation/38_code配下へのプログラム集約.md`
- CLIの実行対象と出力互換性：`../ai_context/develop/task/2_runtime_foundation/39_CLI実行対象と出力互換性の整理.md`
- CLI初期実装と検証：`../ai_context/develop/task/2_runtime_foundation/40_CLI初期実装とライセンス対応.md`
- Windows CLI配布案と依存調査：`../ai_context/develop/task/2_runtime_foundation/41_Windows_CLI配布案と依存調査.md`
- V8再ビルド・内部ZIPと検証結果：`../ai_context/develop/task/2_runtime_foundation/42_ZIP生成と公開前のV8ライセンス判断.md`
- ZIP利用者確認完了と公開準備：`../ai_context/develop/task/2_runtime_foundation/43_CLI確認完了と公開準備.md`
- OSS表記の由来照合・クリーンWindows検証手順・利用条件案：`../ai_context/develop/task/2_runtime_foundation/44_公開準備_OSS表記とクリーンWindows検証.md`

過去の引継ぎにある`apps/`・`crates/`・`packages/`・`experiments/`から始まるリポジトリ基準のパスは、現在は先頭に`code/`が付く。モジュール間の相対位置は維持しており、Cargo/npmのworkspace構成やlockfile管理は変更していない。
