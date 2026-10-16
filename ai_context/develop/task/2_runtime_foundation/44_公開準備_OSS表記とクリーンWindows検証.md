# 公開準備：OSS表記とクリーンWindows検証

2026-10-15作成。2026-10-16、ユーザー回答を反映。43の後、ユーザーから「次のステップを進めてください」と指示を受け、公開前のOSS調査・収集処理、別Windows用の検証手順、利用条件案を進めた。

## 1. PartitionAllocの本文由来を解決

従来はcodeと別revisionのChromium LICENSEを保存していた。固定export commitの`GitOrigin-RevId`を追跡し、元のsubtreeとtree hashの一致まで確認した。

| 項目 | 値 |
|---|---|
| PartitionAlloc export revision | `ff3b8b885b8374cbd3902642d94dc737bda93d5d` |
| Chromium origin revision | `e2ee5821963baed92f29e830f05d257fbfdc6bdd` |
| origin内のpath | `base/allocator/partition_allocator` |
| export/originの一致したtree | `89bb7ef4a998b00e579155d82dc60064a12fe3f6` |
| originのLICENSE Git blob | `2249a28657f86c645f8978b75babc1bd52aca318` |
| LICENSE SHA-256 | `368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b` |

証拠：[export commit](https://chromium.googlesource.com/chromium/src/base/allocator/partition_allocator/+/ff3b8b885b8374cbd3902642d94dc737bda93d5d?format=JSON)、[origin subtree](https://chromium.googlesource.com/chromium/src/+/e2ee5821963baed92f29e830f05d257fbfdc6bdd/base/allocator/partition_allocator?format=JSON)、[対応するLICENSE](https://raw.githubusercontent.com/chromium/chromium/e2ee5821963baed92f29e830f05d257fbfdc6bdd/LICENSE)。

`collect-release-notices.mjs`へ上記の追跡と照合を実装した。GitHub mirrorの本文は、Gitilesのorigin rootにあるLICENSE blob IDと一致する場合だけ採用する。新たな`PROVENANCE.json`を同梱し、この1件の`noticeReview`を除去した。本文以外の任意の許諾を追加したわけではない。

上流で一時的な503が発生したため、downloadは429/500/502/503/504だけ最大3回に制限して再試行する。固定URLの取得cacheは維持する。

## 2. 残る3件

`sys_traits 0.1.29`、`sys_traits_macros 0.1.0`、`deno_core_icudata 0.77.0`のreviewを維持する。

- sys_traits系：固定packageのsource、README、Cargo metadataに独立した本文・著作権表記を確認できなかった。既存issue/PR 87件のtitle/bodyでlicense/copyright/attributionを確認した範囲でも回答はなかった。新規issueは未作成。
- ICU wrapper：package作者は`the Deno authors`、MIT指定、dataは固定ICU dataと一致。wrapperの導入・変更履歴`8cf4d53874bd4523fe4f1c8e74d7ed7762e8b84b`と`3d6fd3baa9013051c4b864bbb722662fe14216a9`にも本文や移動元の許諾参照はなかった。別repoのMIT本文だけで適用確認済みとは扱わない。
- `distribution/UPSTREAM-NOTICE-QUESTIONS.md`に上流2 repo向けの具体的な英語文案を作成した。問い合わせ・投稿にはユーザーの明示許可が必要。送信していない。

[MITの正式条件](https://opensource.org/license/mit)に沿って、本文・帰属の根拠を保持するための確認である。欠損を独自のCopyright行で埋めたり、依存versionを無断更新して回避したりしない。

## 3. 更新した確認用ZIP

既に利用者確認済みの`generated/releases/`内の2つのZIPは保持した。更新したnoticeを含むcandidateは別のdirectoryへ保存した。

```text
code/apps/cli/generated/release-candidates/2026-10-15-notice-review/
  trace-kernel-cli-0.1.0-windows-x64-internal.zip
  trace-kernel-cli-0.1.0-windows-x64-internal.zip.sha256
```

- ZIP：29,248,374 bytes、SHA-256 `ac76d99ef9a0b0d22880243d5acfd4804a0c7f311368514e2d731abc0f9d163a`。
- CLI SHA-256：`1923b55ba310cc0662b777958eb7f368ebbf5dfea2e2cceb74742bc6ea2d9823`。利用者確認済みのexeと一致し、再ビルド・引数変更はない。
- 324 component、587 notice/source file、592 manifest entry。未解決reviewは3件。
- `verify-package.ps1 -Archive <candidate ZIP>`成功。全hash/byte数、V8記録、展開後のPATH空でversion/check/Work/不存在Workを確認。
- `package-windows.ps1`へ`-OutputDirectory`を追加。内部の梱包scriptの引数であり、製品CLIの引数仕様は変更していない。
- 検証時にmanifestのexe file hashとpackage identityのhashも直接照合する。

生成例（repo root、PowerShell 7）：

```powershell
node code/apps/cli/scripts/collect-release-notices.mjs
& ./code/apps/cli/scripts/package-windows.ps1 -InternalPreview -OutputDirectory './code/apps/cli/generated/release-candidates/<新しい識別名>'
& ./code/apps/cli/scripts/verify-package.ps1 -Archive './code/apps/cli/generated/release-candidates/<新しい識別名>/trace-kernel-cli-0.1.0-windows-x64-internal.zip'
```

## 4. Windows標準PowerShellでの検証

`scripts/verify-clean-windows.ps1`を追加。Node/Rust/PowerShell 7のないテストPCで実行できる。`distribution/CLEAN-WINDOWS-CHECK.md`に持ち出す3ファイルと実行コマンドを記載した。

- `BeforeRuntime`はloaderのDLL不足コードを観測するか、既に動作するかを区別する。失敗を一律にVC runtime不足とは扱わない。
- `Ready`はZIP・全entry・V8・version/check/Work/不存在Work/cmd経由の5つのprobeを検証する。PATHを空にして子processを起動。
- Windows loaderのエラーダイアログを抑え、結果をJSONに保存する。runtimeの自動導入、host PATH変更、既存report上書き、自動削除はしない。
- キー本文は収集しない。保存先の有無とOS/既知tool/VC runtime情報を記録する。クリーン環境であるとの自動断定はしない。

開発PCのWindows PowerShell `5.1.26100.9711`で、利用者確認済みZIPを使った`Ready`に成功。改変したZIPのコピーに対しては、SHA-256不一致で展開・実行前に失敗することも確認した。

reportは`generated/clean-windows-verification/host-ready.json`と同folderの`checksum-negative/report.json`。このPCにはNode/Rust/Desktopキー保存先・VC runtimeがある。WindowsSandbox.exeは存在せず、別PC/VMの確認は未実施。スクリプトが動くことと、クリーン環境の検証完了を混同しない。

## 5. 利用条件案と決定事項

`distribution/TERMS-DRAFT.md`にDesktop/CLI共通の利用条件案を作成した。ユーザーは2026-10-16に次の方針を選択した。文書へ反映済み。草案はZIPには同梱せず、homepageの叩き台を正式条件へ変更していない。

1. **Professional利用単位：利用者単位。** 指定利用者1名が複数PCで利用でき、本人管理のバッチ・タスクスケジューラによる自動実行も許可する。複数名でのキー共用は不可。
2. **再配布：契約範囲内のバックアップ・組織内配置を許可。** 組織外への再配布や別製品への同梱は個別許諾。キーは含めず、OSSの各ライセンス上の権利は維持する。

共通キーによる権限判定、Freeの個人/業務利用、CLI単独起動など承認済みの方針は再質問しない。サーバーの共有実行基盤・第三者へのサービス提供、販売/更新/支援条件等は、本人のバッチ実行の許諾だけから推定しない。

## 6. 次のステップ

1. 別のクリーンWindowsで第4節のscriptを実行し、reportと環境の説明を受け取る。
2. 上流への問い合わせ文案を確認し、送信が明示的に許可された場合のみ投稿する。回答で本文・適用version・帰属を確定し、収集処理へ反映する。
3. OSS表記の未解決事項とクリーンWindows確認を終えた後、利用条件の正式文面、公開version/署名/公開先、公開用生成を整える。

公開用生成は引き続き制限する。CLIの39件・Ctrl+Cは同じexeで既に検証済みのため今回再実行しない。機能追加やV8再ビルドは不要。既存未コミット変更、FileUtil `v0.2.0`は保持し、commit/push・外部公開は行っていない。次回も次のステップを必ず提示する。
