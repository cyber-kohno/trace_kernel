# native-coreへの初期移行

**GUI確認済み:** ユーザーから30の動作確認は問題なしとの報告を受けた。続きは[31_共通TypeScriptへの初期移行](31_共通TypeScriptへの初期移行.md)、[32_V8実I_Oとnative所有](32_V8実I_Oとnative所有.md)を参照。CLIアプリ着手前にフォルダ名と引数仕様を確認する指示が追加された。

2026-10-13。29でV8採用とホスト整備を進めた後、既にTauri境界から分離していたRust実処理を共通crateへ移した。Desktopが共通コードの利用側になる第6段階の最初の変更。

## 変更

`crates/native-core`を独立したCargo workspaceとして追加した。以下の実装と内部の回帰テストをそのまま移動した。

- `execution_io`: 実行ごとの受付32件、Operationの所有、停止要求、解放待ち、cleanup失敗の保持。
- `blocking_io`: callerが破棄されてもblocking taskがOperationを所有し、処理完了まで枠を保持する。
- `file_system`: ファイル操作15機能、文字コード・DTO・エラー伝播。
- `scan`: 条件・走査・進捗callback・協調停止・件数/深度/文字量の上限。
- `resource_limits`: native資源上限の定数とLimitedBuffer。

Desktopの元の5ファイルは`pub use trace_kernel_native_core::<module>::*;`のみになり、既存command/runtime/parser/process/HTTP等の呼出先を共通実装へ接続する。Cargo.tomlにpath依存を追加し、Cargo.lockを更新した。IPC名・引数・返却値・実処理の規則は引き継ぐ。ExecutionIoには公開crateのClippy指摘に従いnewと同じDefaultを追加した。

フロントエンドのライフサイクル試験が受付上限を読み取る場所は、共通crateの定数へ変更した。値32を試験側へ複製しない。

## 検証

- native-core: 45件成功、失敗0。
- Desktop Rust `--lib`: 90件成功、失敗0、既存の子プロセス補助fixture 6件ignored。移動した45件はnative-coreで実行するので、Desktopだけの試験件数が減ったことを試験欠落と取り違えない。
- native-core Clippy: 全target、警告をエラー扱いで成功。
- Desktop `npm run check`: 型エラー/警告0、API coverage/behavior/GUI整合成功、transaction 37、lifecycle 134、Workspace 5、execution plan 2、context 7、execute 3件成功。

```powershell
cargo test --locked --manifest-path crates/native-core/Cargo.toml
cargo clippy --locked --manifest-path crates/native-core/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
cd apps/desktop
npm run check
```

以後はDesktopのRust試験に加え、native-coreの試験も実行する。新規crateのCargo.lockも移動先へ持っていく。targetはGit管理対象外。

## 残る範囲とGUI確認

process・HTTP・Excel・DOM・channel・MCPの実装はDesktopに残る。共通TypeScriptはまだDesktop内の分離済みモジュールで、packages/runtime-coreへの移動は未実施。V8実験は実native I/Oへ未接続。`.trk`を読む製品CLIはまだない。

今回はDesktopが共通crateを使う構成へ切り替わったため、再ビルドしたGUIで次を確認する。

1. ファイル読込またはdynamic dataset走査を使うWorkが実行され、出力と完了が従来どおりになる。
2. 実行中のCancel、開発ダイアログの×、アプリのメインフレームの×で停止/終了が完了する。再起動ボタンはモーダルに隠れており、この確認には使わない。

## 次のステップ

GUI確認後、共通TypeScriptをpackages/runtime-coreへ段階的に移し、残るnative機能を共通crateへ接続する。V8ホストにExecutionIoの受付/停止/解放待ちを接続して実I/Oを検証した後、`.trk`読込・Work指定・標準出力/標準エラー・終了コードのRust CLI入口を追加する。V8採用判断は済んでいるので再度尋ねない。
