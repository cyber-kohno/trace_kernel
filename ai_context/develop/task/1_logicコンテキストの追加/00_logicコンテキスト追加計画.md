# logicコンテキスト追加計画

## 目的

Trace Kernel に新しいコンテキスト `$logic` を追加し、`work` とは別に「再利用可能な関数特化コンテキスト」を定義できるようにする。

背景として、現行の `$process` は外部プログラム呼び出しの注入には適しているが、
「A の結果を使って B を実行し、その戻り値を返す」といった合成ロジックを workspace 内の部品として再利用する用途には向いていない。

そのため、`work` のような実行単位ではなく、`$channel` や `$state` を持たない軽量な再利用部品として `$logic` を導入する。

## 結論

- `$logic` は採用する
- `work` を流用せず、独立した新コンテキストとして追加する
- `StoreLogic.name` を Trace Kernel 上の注入名とする
- スクリプト内の関数名は注入名の正本にしない
- 引数と戻り値のシグネチャは UI で持たず、TypeScript ソースから抽出する
- `logic` は 1 コンテキスト 1 関数を原則とする

## 命名

### 採用名

- コンテキスト名は `$logic`

### 命名の意味

- `work`: 実行単位
- `process`: 外部プログラム呼び出し
- `logic`: 再利用可能なロジック部品

この分離により、責務が読み取りやすくなる。

## 設計方針

### 1. logic は work とは別物

`work` は実行エントリポイントであり、出力方式や予約 API を伴う。
一方 `logic` は再利用される関数部品であり、単独実行の主体ではない。

そのため、`work` の縮小コピーとして実装するのではなく、
workspace に `logics` を追加し、`$logic.xxx` として注入する新カテゴリとして扱う。

### 2. logic は user-defined function asset として扱う

`logic` の本質は「実行対象」ではなく「注入可能な関数資産」である。
そのため、UI や store でもこの前提を崩さない。

### 3. logic は純粋 TS 記述を正本にする

引数、戻り値、型注釈、関数本体はすべて script 上の TypeScript コードを正本とする。
UI で引数や戻り値を別管理しない。

## スクリプト仕様

### 基本方針

`logic.source` は TypeScript の関数定義そのものを保持する。
このソースから以下を行う。

- 文法チェック
- 構造チェック
- シグネチャ抽出
- 実行用関数生成

### 初期の推奨許可形

初期実装では、次のような形を標準とする。

```ts
export default async function buildReport(
  input: string,
  limit: number,
): Promise<string> {
  return input.repeat(limit);
}
```

### 1コンテキスト1関数の表現

`logic` は `export default` により 1 関数であることを表す。

構造ルールは初期段階では厳しめに寄せる。

- `export default` は 1 つだけ
- その実体は関数であること
- top-level の余計な実行文は禁止
- named export は禁止
- `import` は原則禁止、必要なら将来緩和を検討する

### 関数名の扱い

- `StoreLogic.name` を注入名とする
- スクリプト上の関数名は実装詳細とする
- スクリプト上の関数名と `StoreLogic.name` の一致は必須にしない

例:

```ts
export default async function buildReport(input: string) {
  return input.trim();
}
```

この script を `StoreLogic.name = "reportBuilder"` で保持する場合、
呼び出し側では `await $logic.reportBuilder("x")` として使う。

## Promise / async 方針

### 結論

- `Promise` は必須にしない
- 同期関数と非同期関数の両方を許可する
- 呼び出し側の `work` では `await $logic.xxx(...)` を基本形とする

### 理由

`$dataset.content()` や `$process` はすでに非同期であり、
`logic` でも非同期処理を自然に扱える必要がある。

一方で、単純な同期ロジックまで `async` 強制にする必要はない。

### 呼び出し側の運用

同期関数でも `await` は可能なため、呼び出し側を `await` で統一できる。

## 注入ポリシー

### logic に注入するもの

`logic` には、現時点ではコンテキスト系のみ注入する。

- `$env`
- `$resource`
- `$dataset`
- `$process`
- `$logic`

### logic に注入しないもの

`work` 用の予約 API は `logic` には注入しない。

- `$channel`
- `$state`
- `print`
- `println`
- その他 `DeclareUtil` 管理の work 実行向け API

### 理由

`logic` を再利用部品として保ち、`work` と責務が混ざることを防ぐため。

## シグネチャ管理方針

### UI 管理はしない

引数名、引数型、戻り値型は store 上で手入力管理しない。
TypeScript ソースから毎回、または必要時に抽出する。

### 抽出方法

TypeScript Compiler API を使い、AST と TypeChecker から default export 関数の signature を読む。

取得対象:

- 引数名
- 引数型
- 戻り値型

### この方針の利点

- script と UI の二重管理を避けられる
- 型の食い違いが起きない
- 将来的に宣言生成にも流用できる

## バリデーション方針

### 既存作法との整合

Trace Kernel 全体では、コンテキスト名の重複チェックなどは maintenance 右ペインで行っている。
この作法は `logic` にも引き継ぐ。

### Store / UI 側で行うもの

- `StoreLogic.name` が空でないこと
- `StoreLogic.name` が一意であること
- `logic.source` が空でないこと

### スクリプト解析で行うもの

- TypeScript の文法エラー
- semantic error
- `export default` が 1 つだけであること
- 1 コンテキスト 1 関数のルールを満たすこと
- 許可されない top-level 構造を持たないこと

### エラー表示

`work` と同様に Monaco 上で構文エラーを表示する。
加えて、`logic` 固有の構造違反も marker として表示できるようにする。

## 実行時方針

### 基本

`logic.source` を transpile して実行可能な関数に変換し、
`$logic.xxx` に注入する。

### 実行時の注入名

`$logic` の各プロパティ名は `StoreLogic.name` とする。

### default export の扱い

script の default export 関数を取り出し、kernel 側で `StoreLogic.name` に束縛して注入する。

## 既存システムとの整合性

### 整合する点

現行システムでは、`ContextDataUtil` が各コンテキストをオブジェクト化し、
`worker.ts` で `new Function(...)` に注入している。

この構造に `logics` を追加すること自体は自然であり、
`$logic` も同じ注入の流れに乗せられる。

### 注意点

`$process` は外部実行アダプタであり、
`$logic` はワーカ内で動く再利用ロジックである。

同じ「関数」でも責務は異なるため、実装上も明確に分離する必要がある。

## 最小実装イメージ

### store

- `StoreLogic` 新設
- `StoreWorkspace.Props` に `logics: StoreLogic.Props[]` を追加
- `StoreWorkspace.Category` に `logic` を追加
- dirty snapshot 対象に `logic` を追加
- validation に `logic` を追加

### maintenance UI

- `logic` 用一覧エントリ追加
- 右ペインで `name` と `source` を編集可能にする
- `work` に近い editor 体験を持たせるが、実行主体にはしない

### program / runtime

- `ContextDataUtil.Props` に `logics` を追加
- `createObjects()` で `$logic` を生成
- `createDeclareDef()` で `$logic` の型宣言を生成
- `logic` 用 script から default export 関数を抽出

### editor

- `logic` 専用 editor を用意する
- analysis model は `work` のような wrapper ではなく module として扱う
- 構文エラーと構造エラーの両方を marker 表示する

## 段階的導入案

### Phase 1

基盤追加を行う。

- `StoreLogic`
- workspace への統合
- validation
- maintenance 一覧と右ペイン

### Phase 2

script editor と構造検証を行う。

- Monaco 連携
- TypeScript module 診断
- 1 関数制約チェック
- signature 抽出

### Phase 3

注入と実行時生成を行う。

- `$logic` 注入
- declare 生成
- `work` からの呼び出し確認

### Phase 4

必要に応じて拡張を検討する。

- `logic` から `logic` の呼び出し
- `import type` の限定許可
- シグネチャ表示 UI
- 実装補助の改善

## 初期実装で意図的に見送るもの

- `logic` 単体の実行 UI
- `StoreLogic.name` と関数名の一致強制
- UI での引数定義・戻り値定義編集
- `work` と同等の予約 API 注入
- 複数関数を 1 logic に含めること

## 保留事項

以下は実装時に最終判断する。

- `export default function` のみに限定するか、無名 default export も許可するか
- `logic` から `$logic` を呼べるようにするか
- 構造チェックの厳しさをどこまで初期実装に入れるか
- default export 関数の抽出方法を AST 主導にするか、transpile 後の形も併用するか

## 現時点の推奨判断

初期実装では、仕様を狭くして安全性を優先する。

- `logic` は 1 コンテキスト 1 default export 関数
- `StoreLogic.name` を唯一の注入名とする
- script は TypeScript を正本とする
- 同期 / 非同期両対応
- 呼び出し側は `await` を基本形とする
- `logic` には work 向け予約 API を注入しない

この方針であれば、現行の整理された責務を壊さずに、再利用ロジックの注入という目的を達成しやすい。
