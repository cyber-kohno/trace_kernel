# Trace Kernel

プログラムとビルド関連モジュールは [`code/`](code/README.md) 配下で管理する。
開発資料・仕様・引継ぎは `ai_context/` に置く。

```text
code/
  apps/          Desktop、CLI、MCP、公式サイト、ライセンス関連アプリ
  crates/        共通Rust
  packages/      共通TypeScript
  experiments/   JSホストの比較・回帰確認
ai_context/      資料・仕様・引継ぎ
```

セットアップ、起動、ビルド、検証コマンドは [code/README.md](code/README.md) を参照する。
CLIは [`code/apps/cli`](code/apps/cli/README.md) に実装。独立した`trace-kernel-cli.exe`でWorkを実行できる。
