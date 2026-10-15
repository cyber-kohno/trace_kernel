# Trace Kernel CLI（Windows x64）

ZIPを展開して`trace-kernel-cli.exe`を実行します。Desktop、WebView、Node.jsの起動・導入は不要です。Workで指定した外部プログラムは別途必要です。

## 起動前の準備

Microsoft Visual C++ v14 Redistributable **x64**が必要です。`VCRUNTIME140.dll`等が見つからない場合は、[Microsoft公式の配布案内](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)からx64版を導入してください。CLIのZIPがランタイムを自動導入したりPATHを変更したりすることはありません。

以下は`C:\tools\trace-kernel-cli`へ展開した場合の例です。配置先は任意に変更できます。

## コマンドプロンプト

```bat
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" --help
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" --version
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" "C:\tools\trace-kernel-cli\examples\cli-test.trk" "cli-test"
echo %ERRORLEVEL%
```

sample Workは`cli test!`と出力します。

自分のWorkspaceを使用する場合：

```bat
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" --list "C:\jobs\daily.trk"
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" --check "C:\jobs\daily.trk" "日次集計"
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" "C:\jobs\daily.trk" "日次集計" --timeout 60
echo %ERRORLEVEL%
```

**`--check`は検証のみで、Workを実行しません。** 検証成功時はWorkの出力が表示されません。通常実行は`--check`を外してください。

## PowerShell

```powershell
$cli = 'C:\tools\trace-kernel-cli\trace-kernel-cli.exe'
& $cli 'C:\tools\trace-kernel-cli\examples\cli-test.trk' 'cli-test'
$LASTEXITCODE
```

## VFSと実行option

VFS計画を適用する場合は`--commit`を指定します。未指定で計画があればcode 5となり、VFSは適用されません。直接の`$fs`操作、外部process、HTTPは通常実行中に行われます。

- `--timeout <秒>`：全体の時間制限。0（初期値）は無制限。
- `--memory-limit <MiB>`：V8メモリ超過の検出基準。64〜512、初期値256。process全体のRSS上限ではありません。
- `--cwd <既存directory>`：実行directory。未指定はtrkの親。共通`$fs` APIは絶対pathを要求します。
- Work名は空白・日本語・大文字小文字を含め完全一致。重複名は拒否します。
- Workspace/API世代が合わない場合は、対応するDesktopで移行・保存してから使ってください。

## ライセンスkey

優先順位は`--license-file`の明示ファイル、同じOSユーザーのDesktop保存済みライセンス、Freeです。Desktopは未導入・未起動でも利用できます。Professionalを利用する場合、`{"key":"v1.…"}`形式のファイルを指定できます。

```bat
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" "C:\jobs\daily.trk" "日次集計" --license-file "C:\licenses\license.json"
```

WindowsでのDesktop保存先は`%APPDATA%\jp.hkdev.tk\license.json`です。不正なファイルはcode 4とし、別のkeyへ切り替えません。CLIは保存keyを変更・削除しません。別ユーザーとしてスケジューラ実行する場合は、そのユーザーが読めるファイルを明示指定してください。

利用者のkeyはこのZIPに含まれません。本体の利用条件とOSSライセンスは`LICENSE.txt`と`THIRD-PARTY-NOTICES.txt`を参照してください。

## 出力と終了コード

plainはUTF-8 textをstdoutへ、table/複数channelはchannelId付きJSON Linesをstdoutへ出します。state通知はstderr JSON Lines、診断はstderr textです。途中結果があっても終了コードで成否を確認してください。

| Code | 内容 |
|---|---|
| 0 | 成功 |
| 1 | Work/native/メモリ/出力/VFS/終了処理の失敗 |
| 2 | 引数不備 |
| 3 | Workspace・世代・Work選択・型/APIのエラー |
| 4 | ライセンスエラー |
| 5 | 未適用VFS計画あり |
| 124 | timeout |
| 130 | Ctrl+C中断 |

Ctrl+Cで停止できます。適用済み変更のrollbackは行いません。stdout/state各8MiBなど既存の資源上限があります。静的検証は外部処理の成功や動的コードの全動作を保証せず、Workはセキュリティsandboxではありません。

## 更新と削除

更新は実行中のCLIを終了してから同じ配置先へ展開してください。PATH登録なしの絶対path指定なら、呼出元のPATH変更は不要です。

削除する場合は展開folderを削除します。Microsoftの共有ランタイムやDesktop保存keyはCLIの削除と別に管理してください。
