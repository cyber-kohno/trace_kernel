# CLI実行対象と出力互換性の整理

**実装追記:** この資料の方針を承認後、CLI APIプロファイルと出力writerを製品CLIへ接続した。ライセンス取得の承認済み仕様・実装・検証結果は [40_CLI初期実装とライセンス対応](40_CLI初期実装とライセンス対応.md) を参照。以下は着手前の調査記録。

2026-10-14。ユーザーが新構成でのビルド成功・旧空フォルダの削除を確認し、36のCLI引数仕様を了承した。初期版の引数不足はエラーとし、対話で補完しない。その上で、Workの実装内容による実行可否と表形式/複数channelの扱いを整理するよう指摘された。

## 1. 基本方針

- CLIの実行対象は、CLIホストが提供するTrace Kernel APIと標準JavaScript機能で記述されたWork。
- 現在の出力方式は`plain`と`channel`。channelのviewは`text`と`table`。表形式や複数channelを理由にWorkを除外する必要はない。
- GUIの表示機能はCLIの出力形式に置き換える。データとchannel識別を保持し、表を勝手に整形テキストへ変換したり、channelを1本の識別不能なテキストに結合したりしない。
- 未対応APIを使うWorkは、事前に検出できれば理由付きで実行を拒否する。代替の空値や成功扱いで処理を続けない。
- 実行可否の静的判定と実行時の成否は別。ファイル/通信/processの成功、動的アクセス・生成コードなどまで`--check`で保証しない。

## 2. 実行対象と出力の扱い

| Workの内容 | CLI方針 |
|---|---|
| plainの`$print/$println` | 実行可。UTF-8 textをstdoutへ出す |
| text channel 1つ | 実行可。channel定義とtextをJSON Linesでstdoutへ出す |
| table channel | 実行可。列定義と行recordをJSON Linesでstdoutへ出す |
| 複数channel、text/table混在 | 実行可。全recordにchannel IDを付け、同一channel内の順序を保持する |
| `$state`のprogress/monitor | 実行可。API内部の状態・getCurrentを保持し、表示通知はstderrの構造化ログへ送る案。stdoutには混ぜない |
| env/resource/dataset、CSV/TSV/JSON、Excel/XML/HTML parser | 実行可。共通context/API/native実装を使う。HTML/XMLを扱う`$parser`はブラウザ画面操作とは別 |
| `$logic`、`$process`、`$fs`、`$net` | ライセンスに応じて実行可。Freeで提供されない機能への参照は事前エラー |
| VFS transaction | 実行可。36の`--commit`で適用を指定する。未指定で計画があればcode 5 |
| `$runtime.exit/sleep`、Promise/Date/Intl等、ホストが提供するURL/encoding/clone/timer等 | 実行可。実際に提供するAPIの型・機能範囲に合わせる |
| 未対応のブラウザ/Worker API | 事前チェックで検出して拒否。自動置換しない |
| 未知のWork methodや将来の未対応出力view | 対応するwriterがなければ拒否。既存viewへ勝手に変換しない |

Work内にはGUIのファイル選択ダイアログ等を呼ぶ公開Trace Kernel APIはない。GUIのchannel切替、列幅による描画、clipboardボタンは結果画面側の機能であり、Workの実行可否を決める条件ではない。

## 3. channelのCLI表現

36で提案したJSON Linesを基本とする。tableは既に共通APIがJSON recordとして保持しており、CSVへの変換を必須にする必要はない。

```json
{"type":"channel","channelId":"LOG","view":"text","detail":{}}
{"type":"text","channelId":"LOG","text":"集計開始\n"}
{"type":"channel","channelId":"RESULT","view":"table","detail":[{"name":"name","type":"string"},{"name":"count","type":"number"}]}
{"type":"record","channelId":"RESULT","record":{"name":"商品A","count":2}}
```

- channel定義をそのchannelのデータより先に出す。空のchannelも定義を出す。
- 列の名前・順序・型を保持する。width等の描画情報はmetadataに残せるが、CLIはGUIと同じ見た目の表を描く必要はない。
- textはprint/printlnの結合結果を保つ。flush単位の断片に分かれることはある。
- channel間はホストが受け付けた出力の順に扱い、同一channel内の順序を保証する。同期していない並行処理の全体順序まで新たに保証しない。
- table recordは共通APIのJSONシリアライズ規則を使用する。循環参照/BigInt等のシリアライズ失敗は実行エラーとし、失敗を黙って行の欠落に変えない。
- 重複channel/列、出力容量等の既存検証・上限は維持する。動的に作るID/列/値の不正は実行時エラーとなる場合がある。
- stderrには診断とstate通知を出し、stdoutには出力データのみを出す。write失敗は実行失敗として扱い、VFSの適用前に出力完了を確認する。
- Work失敗前の出力は残るため、利用者は終了codeで成功と途中結果を区別する。出力があることだけでtransaction適用済みとは判断しない。

初期版にCSV/TSV自動選択・channel別ファイル・対話的channel選択を追加する必要はない。必要になった場合は明示optionとして別途設計する。

## 4. 実装確認で見つかった事前チェックの不足

現在の`validateWorkTypes`は`lib.es2020.d.ts`と`lib.webworker.d.ts`を読み、GUI/MCP共通の禁止global診断を追加している。これはCLIホストの提供機能一覧を表すものではない。

実際に共通生成compiler assetで以下を検証したところ、いずれもdiagnosticCountは0だった。

```typescript
new Blob(["text"]);
new Worker("worker.js");
await crypto.subtle.digest("SHA-256", new Uint8Array([1]));
```

一方、現在のV8ホストを起動してtypeofを確認すると、Blob/Worker/cryptoはundefined。ほかにFile、self/postMessage、MessageChannel、ReadableStream/WritableStream、AbortController/AbortSignal、performance、WebSocket、indexedDBもundefinedだった。型検証成功だけで「GUIとCLIの両方で実行できる」と判定してはいけない。

URL/URLSearchParams、TextEncoder/TextDecoder、DOMException、structuredClone、atob/btoa、timer、Intl、queueMicrotaskはホストに存在する。ただし、global名があることとブラウザの同名APIの全機能が同じことは別なので、CLI型宣言を実際の機能範囲に合わせ、使用するメソッドも検証対象にする。

## 5. CLI着手時に追加するチェック

1. 必須引数・数値optionの検証。引数不足はstderrにusageを出してcode 2。`--help/--version`はWorkspace/Work不要、`--list`はWorkspaceのみ必要。
2. Workspaceの形式・世代・構造・選択Work・出力methodの検証。
3. ライセンスに応じたcontext/API選択とWork型検証。
4. CLIホストの提供APIプロファイルに基づく型・global参照検証。広いWebWorker型宣言をそのまま実行可否の基準にしない。
5. 選択Workと呼出候補Logicの実装にも同じプロファイルを適用する。他のWorkが未対応APIを使うだけで、対応済みWorkまで一括して除外しない。静的に呼出先を絞れる場合は到達可能Logicを確認し、動的呼出で候補を絞れない場合は候補範囲を広げて検証する。
6. コメント・文字列・ローカル変数/プロパティを名前だけで誤検出しない。TypeScriptの構文・symbol解決を使う。`globalThis`経由等も含め、静的に解決できる参照を診断する。
7. `--check`と通常実行の開始前は同じ判定を使い、CLI非対応機能はcode 3と位置・理由を返す。通常実行も事前チェックを省略しない。

Declareの型宣言、any、動的propertyアクセス、生成コード、外部processの内部動作などにより静的解析には限界がある。`--check`はWorkやLogicを試行実行せず、検出できない失敗は実行時code 1として扱う。

外部processが対話やGUI操作を待つかは一般には実行前に確定できない。CLIからの対話入力は追加せず、既存の設定済みstdinとtimeoutを使う。program名による一律禁止や、ダイアログの自動操作は行わない。

## 6. 承認状態と次のステップ

- フォルダ・実行名・36の引数構文/optionは承認済み。引数不足の対話補完は初期版で不要。
- code移動後のビルドと旧空フォルダ削除はユーザー確認済み。
- 表形式/複数channelはJSON Linesで対応する方針。state通知のstderr表現とCLI APIプロファイルの詳細を、この整理を基に実装仕様へ落とす。
- 次はCLIホスト対応APIの宣言・事前チェックと、plain/table/multi-channel/stateの出力契約を実装・検証し、`code/apps/cli`のentry pointへ接続する。

この資料作成では製品コードを変更せず、V8のglobal存在確認と現行compilerの型検証を行った。既存の90件検証はJSON Linesの製品stdout writerそのものを保証するものではないため、CLI writerの実装時に実行ファイルからの出力検証を追加する。
