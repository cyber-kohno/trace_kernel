# ZIP生成と公開前のV8ライセンス判断

2026-10-14。ユーザーが41の「ZIP配布から進める」と「glibc数学実装を無効化して再ビルド」を承認した。V8とCLIの再ビルド、実行検証、更新した内部ZIPの展開検証まで完了した。

**2026-10-15利用者確認:** ユーザーから更新ZIPの動作確認に問題なしとの報告を受けた。第6節のsample/実Workに関する利用者確認は完了として扱う。開発環境のない別Windowsで確認したとの報告ではないため、クリーンWindows確認は残す。公開準備と本体利用条件の確認事項は [43_CLI確認完了と公開準備](43_CLI確認完了と公開準備.md) を参照する。

## 1. 実装と内部確認ZIP

- `scripts/inspect-release.mjs`：Windows targetの固定Cargo/npm依存、PE/DLL依存、license本文候補のhashを調査。
- `scripts/collect-release-notices.mjs`：local license本文と、欠損分の固定上流revisionを収集。MPL 7 source archiveはCargo.lock checksumと展開済みsourceのbyte一致を検証。
- `scripts/package-windows.ps1 -InternalPreview`：exe、配布README、sample trk、notice/source、hash manifestをZIPへまとめる。公開用生成は本体規約等が未確定のため拒否する。
- `scripts/verify-package.ps1`：ZIP SHA-256、全entry hash/byte数、余分なfile/key混入、展開後の実行を確認。
- `distribution/README.md`：cmd/PowerShell、exe絶対path、VC runtime、check/通常実行の違い、VFS、ライセンスkey、終了codeを記載。

初回内部ZIPは約28.2MiB（29,543,178 bytes）。配布folderは`trace-kernel-cli/`で、sample Work名`cli-test`、sourceは`$println('cli test!');`。利用者key・開発fixture・Node/target等は同梱しない。

324 component候補、585 notice/source fileを収集した。build/test依存も保守的に含めるinventoryであり、すべてのlicenseが製品に適用されるとの意味ではない。ZIP全590 manifest entryのhash検証に成功。展開先directoryかつPATH空で、version、check（stdout空）、通常実行（`cli test!`）、不存在Work（code 3）の確認成功。

収集中の例外を隠さず記録する。

- pako：MIT本文に加え、ソース内のZlib原著作権と条件を保存。
- fxhash/servo_arc：Rust由来source headerとApache-2.0本文。source headerにある選択式と著作権を保持。
- mac：READMEの著者・Rust式dual-license宣言とApache-2.0本文。
- selectors：source内のMPL 2.0指定とMozillaの正式本文、固定source archive。
- deno_core_icudata：packageに独立LICENSEなし。MIT wrapper metadata、READMEのICU由来、固定ICU本文を併記。公開前に表記を確認。
- sys_traits/sys_traits_macros：packageと固定repoにlicense本文/attributionがない。MIT metadata/authorを確認用JSONに記録し、未解決として保持。代替の許諾を捏造しない。
- PartitionAlloc：source revisionとは別に、公式Chromiumの固定commitからproject-level BSD本文を保存。公開前に由来を確認。

## 2. 実際にlinkされたglibcを確認

V8 `v150.4.0`の`v8/gni/v8.gni`は`v8_use_libm_trig_functions = is_clang`。`BUILD.gn`は有効時に`third_party/glibc`のsin/cos等をbuildする。

事前ビルドarchive `rusty_v8.lib`（222,067,788 bytes、SHA-256 `9d94c0cda9d4789817047ab63305fae351fae0bb006907863e7dcf125cb01c7a`）には以下のCOFF memberがある。

```text
obj/v8/libm/sincostab.obj
obj/v8/libm/s_sin.obj
obj/v8/libm/branred.obj
```

`sincostab.obj`の`.rdata`先頭256 byteは非zeroで、既存CLI exeのfile offset 74,031,888に一致した。これは候補LICENSEの列挙だけではなく、定数表が実際のexeにも含まれることを示す。調査時のCLI配置側SHA-256は`b10b6fbd410a8ee63c86ede0966c136b77b007b1f0d0e92693c5b2491a391dc4`。キャッシュ側の過去exe SHA-256 `CFBD...`とは区別し、releaseごとの実物hashを使う。

`sincostab.c`にはFSFの著作権とLGPL 2.1以降の指定がある。公開用の静的link配布には、対象source・再linkできる成果物等の条件を満たす構成を検討する必要がある。[対象V8に含まれるLGPL本文](https://github.com/denoland/v8/blob/ac1e23989121713ca642f6650b34deff7b686896/third_party/glibc/LICENSE)

`valgrind/LICENSE`にもGPLという語があるが、V8側の`valgrind.h`は同じ本文でBSD-style例外を明示している。文字列検索だけでV8全体やCLI全体をGPLと断定しない。

## 3. ユーザーの決定

ユーザーは **「glibc数学実装を無効化して再ビルド」** を選択した。V8採用とCLI引数仕様を維持する。

公開用V8は固定150.4.0からsource buildし、`v8_use_libm_trig_functions=false`を指定する。JSのsin/cosはV8のfdlibm経路へ切り替わるため、数学APIの基本と数値の境界を再確認する。速度や丸めの完全な一致は約束しない。

CLIが提供するES2020 profileにTemporalは含まれず、既存ホストでも明示的に有効化していない。source buildでは`v8_enable_temporal_support=false`も指定する。Cargo packageから省略されたGN内部Rust依存を無理に異なるversionで補完する方式を避け、公開契約を持たない機能をbuild対象から外す。

## 4. 専用source buildの準備と現在地

`generated/v8-source`へ固定Cargoソースをコピーし、専用driver/targetを作成。製品CLIのCargo.lockは変更しない。driverは製品で有効なV8 features `simdutf,use_custom_libcxx`を合わせる。

`scripts/build-v8-no-libm.ps1 -Python <Python3の絶対path>`に準備・build・archive検査の手順を実装した。生成物は`generated/`内、Python/ビルド環境はprivateプロセスへ設定し、スクリプト終了時に環境を戻す。

ビルド準備で確認した不足：

- SDKのDebugging Toolsが未導入で、上流の補助DLLコピーが停止した。private copyの`build/vs_toolchain.py`へ専用env guardを加え、静的libraryのbuild時だけSDK debugger DLLコピーを省略する。システムSDKには変更しない。build helperの通常診断にはWindowsのsystem dbghelpを使用する。
- Cargo packageには`third_party/icu/common/icudtl.dat`がない。固定ICU revision `ee5f27adc28bd3f15b2c293f726d14d2e336cbd5`から取得。Git blobとSHA-256を検証。ICU headerは77.1、dataは10,822,192 bytes、SHA-256 `1cf67874b5a87a8363a86fb3f81e3cbbed54d389062dab8fb52308d5cf8c8612`。
- Temporal有効時のGN内部Rust data build.rsもCargo packageから省略されていた。CLI profileにないTemporalを無効化した固定buildへ変更した。
- 日本語を含むWindowsユーザーpathでPythonの既定CP932読み取りが停止した。`PYTHONUTF8=1`で再開し、専用scriptにも反映した。
- bindgenにはlibclang 19以降が必要。コンパイラと同じChromium版`llvmorg-23-init-10931-g20b6ec66-11`のlibclangを公式bucketから`generated/v8-libclang`へ取得。専用scriptで`LIBCLANG_PATH`をprivateプロセスに設定する。
- 分離されたlibclang packageに組み込みheaderがなく、Windows SDKのstddef.hへfallbackして`max_align_t`診断が発生した。`BINDGEN_EXTRA_CLANG_ARGS`で実際のClang compilerのresource directoryを指定する。型を偽装するheader変更は行わない。

公式GN/Ninja、Chromium Clang/Rust toolchainはworkspace内の専用cacheへ取得。システムへSDK installerを導入していない。4 jobのC++ compile、`rusty_v8.lib`、Rust連携定義の生成が完了した。

V8 libraryの検査結果：

- 220,359,466 bytes、COFF member 1,853個。
- SHA-256 `fbeeb38284b9483175cbb2efd41ea8de9c9539c15b860ceb3ceb75c7409733f5`。
- `v8_use_libm_trig_functions=false`、`v8_enable_temporal_support=false`、`use_custom_libcxx=true`、`rusty_v8_enable_simdutf=true`を実GN設定で確認。
- glibc数学object 0件。検証記録は`generated/v8-no-libm-library-receipt.json`。
- 同じsource buildの`src_binding.rs` SHA-256は`60329391841d06f3200f366059ef2c30bc609dba2984778676ad428db60cc971`。

`scripts/inspect-v8-archive.mjs`はCOFF memberとGN設定を読み、`--expect-no-libm`でglibcのobjectがないことを検査する。`--binary/--reference-library`で旧定数表が新exeに残っていないことも確認する。設定文字列だけで「除去済み」と判定しない。

`scripts/build-cli-no-libm.ps1`でsource-built archiveと`release/gn_out/src_binding.rs`を同じビルドから使用する。Cargoのenv cacheを確実に切り替えるため、入力archive/bindingをSHA-256ごとの固定pathへコピーする。元の事前ビルドarchiveは別folderへ保持し、旧定数表の照合用に使う。

`deno_core_icudata-0.77.0/src/icudtl.dat`のSHA-256も上記の固定ICU dataと一致した。notice manifestへ一致結果を記録するが、wrapperのMIT attribution確認は公開前の残作業として維持する。

## 5. CLI再ビルドと更新ZIPの検証結果

通常の出力先`code/apps/cli/target/release/trace-kernel-cli.exe`をsource-built V8で更新した。CLIは0.1.0、Workspace 0、API 1を維持する。

- exe：76,421,632 bytes、SHA-256 `1923b55ba310cc0662b777958eb7f368ebbf5dfea2e2cceb74742bc6ea2d9823`。
- 旧glibc sin/cos定数表の256 byte sampleは新exeに存在しない（検索結果-1）。対象archiveのglibc数学object 0件とGN設定の検査も成功。
- `verify-cli.mjs`：39件すべて成功。追加のsin/cos、負のゼロ、NaN、大きな入力、Intlの数値・日付書式を含む。
- `verify-cancel.ps1`：独立した非表示Windows consoleで、CPU loopへのCtrl+C、code 130、VFS未適用を確認。
- notice/source：324 component候補、586 file。`build-provenance/v8-no-libm.json`を追加。同じexe SHA-256に一致する検証記録がある場合だけ、旧V8のglibc review項目を除去する。上流ソースのglibc本文は保守的inventoryとして保持し、「本文同梱＝当該実装をlink」と扱わない。

更新内部ZIP：

```text
code/apps/cli/generated/releases/trace-kernel-cli-0.1.0-windows-x64-internal.zip
29,247,367 bytes
SHA-256 c4311515e6cfd2727a1c3817310ac1e423589bb20b977bd68902ce67111f2cf4
```

591 manifest entryの全hash/byte数、V8検証記録とexeの対応、余分なfile/keyの混入がないことを確認。別directoryへ展開し、PATH空でversion、check（stdout空）、通常Work（`cli test!`）、不存在Work（code 3）も成功した。このPCにはVC runtimeがあり、クリーンPCでの検証とは区別する。

初回の事前ビルドV8入りZIPは`trace-kernel-cli-0.1.0-windows-x64-prebuilt-internal.zip`へ改名して保存した。今後のZIP生成は一致したno-libm検証記録が必須。両ZIPとも内部確認用であり、公開用成果物として扱わない。

## 6. 次のステップ

1. **完了（2026-10-15利用者報告）:** 更新ZIPの動作確認に問題なし。引数仕様は変更していない。個別の数学Workを確認したとの追加報告はないため、その検証まで実施済みとは記録しない。
2. 開発tool/Desktop/NodeのないWindowsで、VC runtime未導入時の案内と公式x64版導入後の実行を確認する。
3. 本体利用条件と、sys_traits/sys_traits_macrosの欠損notice、ICU wrapper attribution、PartitionAlloc本文の由来を確定する。V8のglibc数学実装の除去は完了したが、この残項目は未解決としてmanifestへ保持する。
4. 公開版version・署名・公開先を確定して、公開用生成を有効化する。

利用者確認または本体利用条件の設計判断が必要になるまでは継続してよい、というユーザー指示を引き継ぐ。次回以降も必ず次のステップを提示する。stage/commit/push/外部公開は実施していない。既存未コミット変更とユーザーのFileUtil `v0.2.0`は保持する。
