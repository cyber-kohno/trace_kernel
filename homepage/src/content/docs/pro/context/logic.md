---
title: logic
description: 複数のworkから再利用する処理。
---

`logic`は、複数のworkや他のlogicから再利用する処理を定義するcontextです。

同じワークスペース内で共通化したい処理を、`$logic.name()`の形で呼び出せる関数として管理します。

contextの基本的な考え方は、[Context概要](/context/)を参照してください。

## logicの定義

1つのlogicには、1つのdefault export関数を定義します。

```ts
export default function normalizeUserName(name: string): string {
  return name.trim();
}
```

logicの名前を`normalizeUserName`として登録すると、work側では次のように呼び出せます。

```ts
const normalized = $logic.normalizeUserName(row.name);
$println(normalized);
```

関数名そのものではなく、logic要素の`name`が`$logic`配下のプロパティ名になります。

## 書けるトップレベル要素

logicのソースには、次のトップレベル要素だけを書けます。

| 要素 | 説明 |
| --- | --- |
| default export関数 | logic本体です。1つだけ定義できます。 |
| `type`定義 | logic内や引数・戻り値の型定義に使えます。 |
| `interface`定義 | logic内や引数・戻り値の型定義に使えます。 |
| type-only import | 型だけをimportできます。 |

たとえば、次のような型定義は利用できます。

```ts
type User = {
  id: string;
  name: string;
};

export default function formatUser(user: User): string {
  return `${user.id}: ${user.name}`;
}
```

一方で、runtime importや、default export関数以外のトップレベル処理は許可されません。

```ts
// runtime importは不可
import fs from 'fs';

// トップレベル処理も不可
const cache = new Map();
```

## 構造チェック

logicエディタでは、ソースの構造がチェックされます。

主なエラー条件は次の通りです。

- default export関数がない
- default export関数が複数ある
- runtime importがある
- default export関数、`type`、`interface`、type-only import以外のトップレベル文がある

初期状態のlogicは、次の形です。

```ts
export default function () {
}
```

## 補完と型

logicのdefault export関数は、引数と戻り値の型が解析されます。

```ts
export default function calcScore(name: string, count: number): number {
  return name.length * count;
}
```

このlogicを`calcScore`という名前で登録すると、work側では次のような関数として扱われます。

```ts
$logic.calcScore(name: string, count: number): number
```

関数シグネチャは、logicエディタの下部にも表示されます。引数や戻り値の型を明示しておくと、work側や他のlogicから呼び出すときの補完が効きやすくなります。

## 注入されるcontext

logicのエディタでは、ワークスペースで利用可能なcontextを参照できます。

- `$env`
- `$resource`
- `$dataset`
- `$process`
- `$logic`

ただし、自分自身のlogicは`$logic`の候補から除外されます。これは、自己参照による循環を避けるためです。

また、現時点ではlogic専用のAPI注入はありません。logic内で使えるのは、注入されたcontextと、TypeScriptの通常の式・関数です。

## 実行時の扱い

logicは、workや他のlogicから呼び出されたタイミングで実行されます。

実行時には、logicのTypeScriptソースが変換され、default exportされた関数が取り出されます。default exportが関数でない場合は、ランタイムエラーになります。

logicは独立した実行単位ではありません。workのように単体でRunするのではなく、workや別のlogicから呼び出される共通関数として使います。

## 使いどころ

logicは、次のような処理を共通化したい場合に使います。

- 複数のworkで使う文字列整形
- CSVやログの共通パース処理
- 判定条件やスコア計算
- `$resource`や`$dataset`を使った共通集計処理
- `$process`で呼び出した外部プログラムの結果整形
- 複数の`$process`呼び出しを組み合わせた一連の処理

workごとに同じ関数をコピーするのではなく、logicとして定義しておくことで、ワークスペース内の処理を整理できます。

`process`は、外部プログラムを1つの関数として呼び出すためのcontextです。外部プログラムの結果を整えたり、複数の外部プログラムを組み合わせて意味のある処理にしたりする場合は、logicとしてまとめておくと扱いやすくなります。

たとえば、`fd`で対象ファイルを絞り込み、その結果に対して`rg`で検索する処理を、1つのlogicとして定義できます。work側では、そのlogicを呼び出すだけで、外部プログラムの組み合わせを意識せずに利用できます。
