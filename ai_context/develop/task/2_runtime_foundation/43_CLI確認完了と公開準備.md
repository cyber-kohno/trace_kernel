# CLI確認完了と公開準備

2026-10-15。ユーザーから内部ZIPの動作確認に問題なしとの報告を受けた。CLIの初期実装、V8再ビルド、内部ZIPの生成・自動検証・利用者確認まで完了した。

**公開準備の追記:** [44_公開準備_OSS表記とクリーンWindows検証](44_公開準備_OSS表記とクリーンWindows検証.md)でPartitionAllocの元tree/本文を照合し、未解決OSS表記は3件になった。別Windows用のPowerShell 5.1 script・問い合わせ文案・利用条件案を作成した。利用単位と再配布の質問は回答待ち。以下の4件という記述は調査開始時点の記録。

## 1. 確認済みの成果物

- 対象：`code/apps/cli/generated/releases/trace-kernel-cli-0.1.0-windows-x64-internal.zip`。
- ZIP SHA-256：`c4311515e6cfd2727a1c3817310ac1e423589bb20b977bd68902ce67111f2cf4`。
- V8 150.4.0、glibc数学実装を無効化したsource build。対象objectと旧定数表の不在を確認。
- 数学・Intlを含む39件、Windows Ctrl+C、591 manifest entry、展開後のPATH空での実行は42で確認済み。
- ユーザー確認済みZIPとexeをこの報告だけで再生成・変更しない。
- 旧`prebuilt-internal.zip`は変更前の比較保存用。利用者確認の対象と混同しない。

## 2. 公開前の残作業

| 項目 | 現状 | 次の作業 |
|---|---|---|
| クリーンWindows | 別PC/VMで確認したとの報告はない | 開発tool/Desktop/Nodeがない環境で実行。VC runtime不足時と導入後を確認 |
| OSS表記 | manifestのreview項目が4件 | 下記の証拠と不足を整理し、確定した本文・由来を収集手順へ反映 |
| 本体利用条件 | homepageの文書は明示的に叩き台 | Desktop/CLIへの適用範囲、利用単位、再配布等を製品方針として決定 |
| 正式配布 | `-InternalPreview`だけを許可 | 上記確定後、version・署名・公開先と公開用ZIP生成を確定 |

## 3. OSS表記の未確定事項

依存versionや実行ファイルの変更は行わず、現在の固定依存に対する表記を確認する。

- `sys_traits 0.1.29`：MIT metadataはあるが、固定revision `0b168a2935d4c398d38ea5d25af8f793858299b5`の本文・attribution欠損を収集側が記録している。
- `sys_traits_macros 0.1.0`：同じく固定revision `75cbf3ea478624cc78275b0264e78e9ae13ce3f5`で欠損を記録。共通の上流は [dsherret/sys_traits](https://github.com/dsherret/sys_traits)。最新repoのroot一覧にもLICENSEは確認できなかったが、最新の表示だけを旧版の許諾証拠として使わない。
- `deno_core_icudata 0.77.0`：同梱dataは固定ICU dataとSHA-256一致。独立したMIT wrapper本文/attributionの扱いを確認する。[上流README](https://github.com/denoland/deno_core_icudata)はRusty V8のICU dataを由来として案内している。
- PartitionAlloc：固定code revision `ff3b8b885b8374cbd3902642d94dc737bda93d5d`。実source headerはChromium AuthorsとBSD-style LICENSEを参照している。収集したChromium本文は別revisionのため、対応する由来を確認する。現在の本文は仮の別許諾に差し替えない。

上流への問い合わせ・issue投稿はユーザーの明示許可を得てから行う。本文欠損を独自の著作権者名や許諾で埋めない。4件のreview項目と公開用生成の制限を維持する。

## 4. 本体利用条件の具体的な整理案

現行の`code/apps/homepage/src/content/docs/legal/terms-license.md`は、無料版の個人/業務利用とProキーによる追加機能を説明する叩き台である。次の構成で製品方針を整理し、その後に正式文面へ落とす。

| 規約の項目 | 整理案・既存仕様 | 未決事項 |
|---|---|---|
| 対象製品 | DesktopとCLIを同じ規約で対象に含める | 他の配布アプリも同じ規約へ含めるか |
| Free/Professional | 現在の共通権限判定と同じキー検証に合わせる | 追加のCLI料金を新設する根拠は現時点でない |
| 個人・業務利用 | 現行叩き台の利用可という方針を引き継ぐ | なし（既存方針を再確認する質問は不要） |
| Pro利用単位 | OSユーザーからのキー探索は実装上の仕様 | 人・端末・組織・サーバー実行の契約上の利用単位は未定。探索方法から推定しない |
| 配布・複製 | 公式ZIP、バックアップ、組織内配置の扱いを明記する | 第三者への再配布、別製品への同梱の可否 |
| OSS・外部ツール | 各上流の条件を保持し、本体条件との関係を明記する | 収集中の4件を確定 |
| 販売・更新・支援 | 既存の販売方針と整合させる | 返金・サポート・更新の具体条件 |

これは利用許諾文ではなく、公開前に必要な製品判断の一覧である。homepageやZIPのLICENSE.txtを確定済みとして書き換えない。

## 5. 次のステップ

まずOSS表記の証拠整理と、開発環境のないWindowsでの確認を進める。本体規約の最終化には第4節の未決事項についてユーザーの設計判断が必要。機能追加の継続と公開条件の確定を混同しない。

次回以降も次のステップを必ず提示する。新たなCLIフォルダ名・コマンド名・引数変更をユーザー確認なしに追加しない。既存の未コミット変更、FileUtil `v0.2.0`を保持する。commit/push・外部公開は未実施。
