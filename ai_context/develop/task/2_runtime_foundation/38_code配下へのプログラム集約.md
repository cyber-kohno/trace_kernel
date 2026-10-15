# code配下へのプログラム集約

2026-10-14。ユーザーが37の`code/`構成案を承認し、CLI仕様の確認より先に配置整理を行うよう指示した。

## 1. 現在の配置

```text
trace_kernel/
  code/
    apps/
      desktop/
      homepage/
      mcp/
      license-server/
      generate-license-keypair/
    crates/native-core/
    packages/runtime-core/
    experiments/
      js-host-common/
      js-host-quickjs/
      js-host-v8/
    README.md
  ai_context/
  .agents/
  .git/
  README.md
```

`code/apps/cli`はまだ作っていない。フォルダ・package/binary名は承認済みだが、36の引数・出力・transaction・ライセンス仕様は確認待ち。

## 2. 実施内容

- `apps/`、`crates/`、`packages/`、`experiments/`のプログラム群を`code/`配下へ移した。移動前後のソース一覧は同じ569ファイル。既存の未コミット変更・workファイル・ローカル設定・依存モジュール・生成キャッシュもフォルダと一緒に移動した。
- 4つのグループの相対位置を維持したため、Cargoのpath依存、Desktopの共通TS再export、Viteの共通コード参照、npmの共通package参照は元の相対指定で動く。
- QuickJS比較、エンジン比較、V8 Workspace検証の3スクリプトのroot変数を`codeRoot`へ変更し、スクリプト位置から`code/`を解決することを明記した。呼出元のcurrent directoryに依存しない。
- リポジトリ直下と`code/`にREADMEを追加し、新配置でのセットアップ・起動・ビルド・検証手順を記載した。モジュールREADME、MCP coverageのコードパス、開発実装マップ、01/15/36の最新案内を更新した。旧引継ぎ本文は当時の記録として残す。
- `C:\app\codex_home\config.toml`の既存Trace Kernel MCP command 1行を`C:\app\git\trace_kernel\code\apps\mcp\target\release\trace-kernel-mcp.exe`へ変更した。現在接続中のMCPプロセスの強制停止はしていない。
- Tauri生成物に移動前の絶対パスが残っていたため、Desktopの`target`と`target-codex-check`内のTauri/pluginパッケージを`cargo clean -p ...`で選択的に削除し、新配置で再生成した。他のキャッシュは維持した。
- Cargo/npmのworkspace統合、lockfile集約、製品identifier・バージョンの変更は行っていない。ユーザー変更の`FileUtil.VERSION = v0.2.0`を維持する。
- commit/push、CLI作成、ライセンス鍵生成、サーバー公開は行っていない。

## 3. 確認状況

成功済み:

- Desktop `npm run check`: Svelte 0 errors / 0 warnings、MCP API coverage/behavior/context consistency、Frontend回帰191件、runtime-coreの型・60モジュールのimport境界。
- native-core `cargo test --offline --locked`: 109件成功、6件のsubprocess fixtureは既定でignored。Desktop `cargo test --offline --locked --lib --target-dir target-codex-check`: 35件成功。Rust合計144件。
- 共通runtime/compiler/標準lib asset生成。
- Desktop開発サーバー経由の共通モジュール・依存・bridge・型lib読込とserver終了。
- MCP `cargo check --offline --locked`。
- HomepageのAstroビルド: 75ページ。
- ライセンス関連のNodeモジュール3件の構文確認（鍵生成・発行・サーバー起動は実行していない）。
- Desktop Frontend production build。
- Desktop `cargo build --offline --locked --bin trace-kernel`: 通常の`target`と`target-codex-check`の両方で成功し、`trace-kernel.exe`の生成を確認。
- V8 release build。
- エンジン比較：QuickJS/V8それぞれ30件。
- V8検証90件：host 13、native I/O 14、native services 19、Workspace/license 21、generated asset 11、channel 12。リポジトリ直下から新配置のスクリプトを呼び出し、全件成功。
- 変更したJSスクリプト3件のPrettier check、`git diff --check`（既存CRLFを考慮した設定）。
- Gitのignoreを確認し、`node_modules`・`target`等の生成キャッシュが新配置でuntrackedとして露出していない。`packages/runtime-core/build`の3ファイルは生成キャッシュではなくビルドツールのsource。
- `code/apps/cli`は未作成、`FileUtil.VERSION`はユーザー変更のv0.2.0。

プログラムの移動とビルド/検証は完了。ユーザーも新構成でのビルド成功を確認し、旧空フォルダを削除した。

MCPには既存の未使用tool_router warning、Desktopには既存のresource_limits再export warningがある。Homepageのsite未指定等のwarningも今回の配置変更の対象外。

## 4. 旧空フォルダの状態

移動時にはVS Code・Rust解析・関連ターミナルが旧`apps/desktop`を使用していて、空フォルダの削除が拒否された。その後ユーザーが削除済みと報告した。`Test-Path apps`がFalseであることを確認し、配置整理は完了。

## 5. 次のステップ

ユーザーは36のCLI引数仕様も了承した。最新は [39_CLI実行対象と出力互換性の整理](39_CLI実行対象と出力互換性の整理.md)。対応APIの事前チェックと出力writerの設計を反映して`code/apps/cli`のCargo構成、asset embed、trk→Work実行、stdout/stderr/終了codeを実装する。

Gitは未stage・未commitのため、旧パスのtrackedファイルが削除、新しい`code/`がuntrackedとして見える。移動前からの未コミット変更と新規共通モジュールも新配置に保持している。古いtrackedファイルをcheckoutで戻したり、新配置を削除したりしないこと。
