# Windows CLI配布案と依存調査

**承認・実装追記:** ユーザーが「ZIP配布から進める」を選択した。内部確認ZIPの生成と展開検証まで実装した。V8/glibc LGPLの実際のlinkを確認したため、公開用ビルド方針の判断が必要。最新は [42_ZIP生成と公開前のV8ライセンス判断](42_ZIP生成と公開前のV8ライセンス判断.md)。

2026-10-14。ユーザーが実Workspaceで通常実行の出力成功を確認した。無表示だったのは`--check`指定による検証のみの実行で、実行時出力の不具合ではない。次はWindows配布構成とランタイム・同梱ライセンスを具体化する。

## 1. 推奨する初期配布

**Windows x64のZIPを先に用意する。PATH登録は不要とし、exeの絶対pathで実行できる形を基本にする。**

| 項目 | 提案 |
|---|---|
| 配布物 | `trace-kernel-cli-0.1.0-windows-x64.zip`（現在のCLI版を使った例） |
| ZIP内の親folder | `trace-kernel-cli/`。versionをfolder名に入れず、更新時も固定pathを使える形 |
| 実行名 | `trace-kernel-cli.exe`。Desktopの`trace-kernel.exe`と別 |
| 利用方法 | ZIP展開後、exeの絶対path＋引数を指定 |
| PATH | 自動変更しない。必要な利用者だけ任意で登録 |
| 管理者権限 | CLIの配置・通常実行では不要。対象ファイル等の権限は別。VCランタイム導入時は昇格が必要な場合がある |
| 依存ランタイム | Microsoft Visual C++ v14 Redistributable **x64**。不足するPCではMicrosoft公式packageを別途導入 |
| Desktop/WebView/Node | CLI実行時に不要 |
| ライセンスkey | 配布ZIPへ利用者のkeyを含めない。既存の探索/明示指定を維持 |
| 更新 | 同じ配置先に新しい配布物を展開して更新。自動更新は初期版に追加しない |
| アンインストール | 展開folderを削除。共有VCランタイムやDesktopの保存ライセンスは削除しない |

CLIが読み込むtrkのWorkspace/API世代との適合は別で、現在のCLIはWorkspace 0 / API 1。公開版の採番・対応世代はreleaseごとに記録する。

想定構成：

```text
trace-kernel-cli/
  trace-kernel-cli.exe
  README.md
  LICENSE.txt                  本体の確定した利用条件
  THIRD-PARTY-NOTICES.txt       名前・version・著作権・適用license
  THIRD-PARTY-SOURCES.md        sourceの取得方法と同梱source対応表
  licenses/                    license本文と必要な追加notice
  third-party-sources/          MPL対象等の固定version source archive
```

配布ZIPとは別にZIPのSHA-256を公開し、package内にもexe/notice/sourceのhashとビルド情報を記録する。READMEはcmd/PowerShellの両方を載せ、`--check`は「検証のみ・Work未実行」と明示する。

コマンドプロンプトの使用例：

```bat
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" "C:\jobs\daily.trk" "日次集計"
echo %ERRORLEVEL%

rem 検証だけを行う場合。Workの出力は出ない。
"C:\tools\trace-kernel-cli\trace-kernel-cli.exe" --check "C:\jobs\daily.trk" "日次集計"
```

## 2. 実行ファイルの実測

`scripts/inspect-release.mjs`を追加し、現在のexeのPE header/import/delay import、Cargo/npm固定依存、local license本文候補を読み取り、`generated/release-audit/report.json`と`report.md`へ出力した。

- Target: `x86_64-pc-windows-msvc`、PE32+ / x64。
- Version: `trace-kernel-cli 0.1.0 (Workspace 0, API 1)`。
- exe: **77,210,112 bytes（約73.6MiB）**。
- SHA-256: `CFBD220996A0B9A61FA19FFD309D2566ECC1D7527D635006E082B0E1C32397B2`。
- VCランタイムimport: `VCRUNTIME140.dll`、`VCRUNTIME140_1.dll`。ほかはWindowsのDLL/API-set参照。
- 現在の検証PCにはx64 VCランタイム`v14.50.35719.00`が導入済み。クリーンPCで依存が不要と証明したものではない。

Microsoftの説明では、アプリのarchitectureに合い、ビルドtool以上のversionのRedistributableが必要となる。初期READMEは[公式v14 x64配布案内](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)を案内する。特定の古い「2015」版を指定しない。

Microsoftは共有ランタイムpackageによる配備を推奨しているため、初期ZIPにWindows/System32から抜き出したDLLを入れる方式は採らない。[Microsoftの配備説明](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170)

想定確認環境はWindows 10/11 x64。これは配布案の対象であり、現時点のクリーンPC動作保証ではない。Server/ARM64/native ARM build/32bitは別途確認する。

## 3. インストーラとの比較

| 方法 | 利点 | 作業・条件 |
|---|---|---|
| ZIP＋公式VCランタイム別導入（推奨） | exe直指定・任意配置に合う。インストーラ不要。PATHへの影響なし | READMEに前提を明記し、ランタイム未導入PCの確認が必要 |
| CLI専用installer | 固定配置・更新/削除・VCランタイム導入案内をまとめられる | インストールscope、昇格、署名、prerequisite導入、PATH option、更新規則を決める必要あり |
| Desktop installerにCLI同梱 | DesktopとCLIの配置を一括管理できる | CLI単体配布も残すか、Desktop未利用者向け導線、Tauri bundle設定変更の設計が必要 |

初期配布にinstallerは必須ではない。ZIPでの利用・クリーン環境確認後、配布対象に合わせて追加する。VCランタイムの自動download/installやシステムPATH変更を今回の調査で行ってはいない。

## 4. 同梱ライセンスの調査結果

Windows targetのCargo dependency closureは**306 package**（自前2、build依存を含む候補）。埋込npmの直接依存は**5 package**。これは必要候補を広く集めたinventoryであり、全packageがruntimeへlinkされるという意味でも、license本文を完全収集済みという意味でもない。

埋込npm：

| Package | Version | Metadata license |
|---|---|---|
| TypeScript | 5.6.3 | Apache-2.0 |
| encoding-japanese | 2.2.0 | MIT |
| pako | 2.1.0 | MIT AND Zlib |
| @noble/ed25519 | 3.0.0 | MIT |
| @noble/hashes | 2.0.1 | MIT |

各packageのlicense本文を確認できた。TypeScriptには`ThirdPartyNoticeText.txt`もあり、pakoはMITだけに要約しない。RustのOR/AND式も勝手に単一licenseへ置き換えず、本文・追加notice・選択条件を確認する。`encoding_rs`はBSD追加条件、`ring`はBoringSSL等の追加本文、ICU関連はUnicode licenseの確認が必要。

MPL候補は7 package：`cooked-waker 5.0.0`、`cssparser 0.31.2/0.36.0`、`cssparser-macros 0.6.1`、`dtoa-short 0.3.5`、`option-ext 0.2.0`、`selectors 0.25.0`。

未変更MPLコードを組み込んだexeについて、受領者に対象sourceの取得方法を案内する必要があるため、固定versionのsource archiveとnotice対応表を用意する案とする。Trace Kernel本体全体のlicenseをMPLへ変更する案ではない。[Mozilla FAQ Q8/Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)

**local registryだけでlicense収集を完了できない点を確認した。** Deno/V8等22 packageでrootのlicense本文候補がない。Cargoのlicense fieldだけをnoticeの代わりにせず、固定tag/revisionの公式sourceから補完する。V8 package内のnested copyrightが1つあるだけではRusty V8/V8全体の本文を満たしたことにしない。

特にV8はRusty V8のMITだけで完結せず、V8本体と組込C++/ICU/Chromium依存のnotice確認が必要。現在はRusty V8 `v150.4.0`、V8 `15.0.245.2`。上流tagの[MIT本文](https://github.com/denoland/rusty_v8/blob/v150.4.0/LICENSE)と[submodule対応](https://github.com/denoland/rusty_v8/blob/v150.4.0/.gitmodules)を確認した。Cargo packageでは多くのlicense fileが省略されている。

## 5. 本体の利用規約

公式サイトの`legal/terms-license.md`は明確に**叩き台**で、再配布・複製・改変・Pro key利用範囲等は未確定。自前CLI/native-coreのCargo licenseも未設定。ここからOSS licenseを勝手に決めない。

本体の利用条件はDesktopとCLIで共通にする案とし、CLI単体利用とOSユーザー別実行を扱えるように確定する。第三者libraryの権利はその適用licenseに従う。本体の利用規約が決まるまでは、公開用`LICENSE.txt`へ確定条文を作り込まない。

## 6. 次の作業と判断点

次の設計判断は **初期配布をZIPから始めるか、installerを先に作るか**。この資料の推奨はZIP。

ZIPを選択後、以下を進める。

1. 固定versionの第三者noticeと必要sourceを収集し、hash付き対応表を作る。本文欠落をrelease生成時のエラーにする。
2. 配布README、sample Work、ビルドmetadata、SHA-256を準備する。利用者keyや開発fixtureを含めない。
3. ZIP生成・展開・配置外での実行確認を自動化する。本体規約が未確定の間は内部確認用と公開用を明示して扱う。
4. 開発tool/Desktop/NodeがないWindows環境で、VCランタイム未導入時の案内と導入後の起動・Work実行を確認する。現PCの共有ランタイムを削除して確認する方法は使わない。
5. 本体の利用条件、公開版version/対応世代、公開先、署名を確定してから公開する。

今回実行したのはread-only依存調査とproposal/toolの追加。installer作成、PATH変更、ランタイム導入、外部公開は行っていない。既存のCLI exeと共通runtimeの実装は変更していない。
