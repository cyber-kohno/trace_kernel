# 共通実行入口のRustホスト比較

**続き:** ユーザーはV8系の追加比較を選択した。V8実装、両候補の30件比較、メモリ上限の差、採用案は [28_V8ホスト比較とエンジン選定](28_V8ホスト比較とエンジン選定.md) を参照。以下はQuickJSで29件を確認した時点の記録。

2026-10-13。04の実験を更新し、26までに抽出した実行プラン・予約API・dataset準備・context生成・Work実行をRustの独立ホストでも使用した。製品CLIやエンジンの採用確定ではない。

## 実験の変更と結果

- `experiments/js-host-quickjs/fixture.ts`は、共通の`runPreparedWork`、`createReservedApi`、`createWorkContext`、実行プラン選択を使う。出力完了待ちはDesktopと同じ`createFlushScheduler`を使用する。
- 既存の11比較に、resource/envとLogic相互参照、動的dataset、processの要求と出力デコード、channel/state、無償権限、Logicのdefault不足、空channel登録失敗、重複channelの8比較を追加した。
- Node/V8との19比較、停止5件、資源・出力失敗3件、ホスト内コンパイル2件の計29件が成功した。出力、ホスト呼出し、結果、メモリ上の最終ファイル状態を照合した。
- releaseビルド、`cargo clippy --all-targets -- -D warnings`も通過した。Rust 1.93.1、x86_64-pc-windows-msvc、Node v24.13.1、固定済みrquickjs 0.14.0で実行した。
- 再現方法は実験の`README.md`、最新の生成結果は`generated/results.json`を参照。generatedはGit管理対象外。

最新実行の実測値（このPCでの単発実行であり、配布先や大規模Workの性能保証ではない）:

| 対象 | 値 |
| --- | --- |
| 実験用Rust exe | 1,367,040 bytes |
| 共通処理を含むWorkバンドル | 525,800 bytes |
| TypeScriptコンパイラバンドル | 10,149,996 bytes |
| 最小プロセス起動の中央値（10回） | 約43ms |
| コンパイラ初期化と1行変換 | 約810ms |
| コンパイラ初期化からWork出力まで | 約888ms |

exeにJS資産や本製品のnative機能は含まれていない。この合計をそのまま製品CLIの配布サイズとは扱わない。

## この比較で保証していないこと

- Node VMはブラウザWorkerではない。実GUI経路全体の同等性は別途確認する。
- native I/Oはメモリ上のモデルであり、走査treeとprocess出力もfixture。`worker_init`と`add_channel`は要求形式を照合するための模擬受付。実ファイル・HTTP・DOM/Excel・子プロセスの停止と解放待ちをRust JSホストに接続していない。network APIの生成はこの実験では空の代替オブジェクト。
- LogicはDesktopと同じ変換関数で比較準備時に変換したものを注入する。Rustホスト内コンパイルは従来の別2試験で確認する。Work/Logic/Declare全体の意味的な型検証はまだない。
- ライセンスの署名検証、.trk読込、CLI引数・終了コード・標準出力の製品仕様、背景Promiseやタイマーの所有、source mapの行番号変換は未実装。

## 次の設計判断

製品CLIのJS実行ホストを決める段階に来た。次のいずれかを選ぶ。

1. **V8系のRustホストも同じ共通入口で追加比較してから選定する（提案）。** QuickJSで今回確認できた範囲は広がったが、現在のGUIで禁止していないグローバルAPIとの契約はまだ揃っていない。候補間の互換性・配布条件を比較してからエンジン固有の製品コードに進む。
2. **QuickJSを暫定実装先としてCLI開発を続ける。** まず必要なグローバルAPIとnative所有の契約を整備し、実I/Oと配布先の確認を採用条件にする。29件の成功を製品互換性の保証とはしない。

rquickjsの[公式README](https://github.com/DelSkayn/rquickjs#supported-platforms)ではx86_64 Windows/MSVCのQuickJS対応にexperimentalの表記があり、system/Web APIを提供する方針ではない。実験のprofileもTextEncoder/TextDecoderと最小のタイマー補完だけである。

今回のグローバル検査でも、profile適用後の`Intl`、`URL`、`URLSearchParams`、`structuredClone`、`setInterval`は未定義だった。これらはDesktopの`restricted-globals.ts`では禁止していないため、CLIの提供契約と補完方法を決める必要がある。

V8についてもRustバインディングだけでブラウザのWeb APIが揃うわけではない。候補に進む場合、[rusty_v8の公式ビルド説明](https://github.com/denoland/rusty_v8#binary-build)を確認し、配布サイズ、起動、停止、必要なAPIを実測する。現時点ではV8系のサイズ・性能を比較測定していない。

設計判断まではエンジン固有の製品CLI・packages/cratesへの本移動に進めていない。
