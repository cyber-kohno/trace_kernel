# 開発環境のないWindowsでの確認

対象はWindows x64。Windows標準のPowerShell 5.1を使用でき、Node.js・Rust・Desktop・PowerShell 7の追加導入は不要。

## 用意するもの

開発PCから、次の3ファイルをテスト用PC/VMの`C:\tk-cli-check`へコピーする。

1. 確認対象の`trace-kernel-cli-0.1.0-windows-x64-internal.zip`
2. そのZIPと組になった`.zip.sha256`
3. `code/apps/cli/scripts/verify-clean-windows.ps1`

開発ツールとTrace Kernel Desktopが入っていない別PC/新規VMで確認する。テスト環境のOS版・bit数、Desktop等が未導入であることを利用者が確認する。スクリプトのツール探索だけで新規環境だと証明できるわけではない。

## 1. VCランタイム導入前

コマンドプロンプトから実行する。

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\tk-cli-check\verify-clean-windows.ps1" -Archive "C:\tk-cli-check\trace-kernel-cli-0.1.0-windows-x64-internal.zip" -Stage BeforeRuntime -ReportPath "C:\tk-cli-check\before-runtime.json"
```

ZIPと全entryのハッシュ・V8記録を確認し、任意名の新規directoryへ展開する。CLI子processのPATHを空にし、実行時依存を確認する。ランタイムの導入やPATHの永続変更は行わない。

結果の見方：

- `native-dependency-missing`：Windows loaderの依存DLL不足コード`0xc0000135`を観測した。これだけでは不足したDLL名は特定できない。VCランタイム導入後に第2節を実行する。
- `runtime-already-available`：導入前から必要な依存があり、Workまで成功した。DLL不足状態を確認できたという意味ではない。
- `failed`：報告JSONの`error`と`checks`を確認する。一般の実行失敗をすべてVCランタイム不足と扱わない。

DLL不足を起こす目的で、通常使用中のPCのランタイムをアンインストールしたり、system DLLを削除・改名したりしない。未導入状態を用意できない場合は、そのケースを未確認として報告する。

## 2. VCランタイム導入後

必要に応じて、テスト環境へ[Microsoft公式のVisual C++ v14 Redistributable x64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)を導入する。

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\tk-cli-check\verify-clean-windows.ps1" -Archive "C:\tk-cli-check\trace-kernel-cli-0.1.0-windows-x64-internal.zip" -Stage Ready -ReportPath "C:\tk-cli-check\ready.json"
```

`status: passed`、PowerShellの終了コード0を確認する。主な確認項目は以下。

- ZIP SHA-256、全entryのbyte数・SHA-256、exeとV8検証記録の対応。
- `--version`。
- `--check`が成功し、Workの出力がない。
- 通常実行で`cli test!`。
- 不存在Workは終了コード3。
- `cmd.exe`経由でも通常実行が成功。
- Node等のないPATHで実行。

レポートは既存ファイルへ上書きしない。再試験は別の`ReportPath`を指定する。展開先は保存し、自動削除しない。

## 報告するもの

- `before-runtime.json`と`ready.json`。
- 新規VM/別PCのどちらか、Desktop・開発ツールが未導入であること。
- VCランタイム導入前から起動できたか、導入して起動できたか。
- 必要なら手元のWorkの結果。ただしWorkやキーをレポートへ同梱する必要はない。

レポートにはライセンスキーの内容を収集しない。Desktop保存先の存在有無、既知ツールのPATH上の有無、VCランタイム登録、OS情報、検証結果、展開先を記録する。`environmentFreshness: requires-user-confirmation`は利用者による環境確認が別途必要であることを示す。

## 現在の確認状況

2026-10-15、開発PCのPowerShell 5.1でスクリプトを実行し、既存ZIPの検証と5つの起動/Work probeが成功した。このPCはNode/Rust/Desktopキー保存先・VCランタイムがあり、クリーン環境の試験ではない。Windows Sandbox.exeも存在しないため、この環境だけで別Windowsでの確認を完了したとは扱わない。
