---
title: $runtime
description: workの実行制御に関するAPI。
---

`$runtime`は、workの実行制御に関するAPIです。

現時点では、処理を途中で正常終了する`exit`と、一定時間待機する`sleep`を提供します。

```ts
$runtime.exit();
await $runtime.sleep(1000);
```

`$runtime`は、出力方式に関係なく利用できます。

## API一覧

| API | 説明 |
| --- | --- |
| `exit()` | workの実行をその場で正常終了します。 |
| `sleep(ms)` | 指定したミリ秒だけ待機します。 |

## exit

`exit`は、workの実行を途中で終了します。

```ts
if ($resource.input.trim() === '') {
  $println('入力が空のため終了します。');
  $runtime.exit();
}

$println('この行は実行されません。');
```

`$runtime.exit()`は内部的には専用の終了シグナルを投げます。通常の例外とは区別され、Trace Kernelのランタイムでは正常終了として扱われます。

そのため、エラーとして表示されるのではなく、そこまでの出力を残したままworkが完了します。

### returnとの違い

work全体は非同期関数として実行されるため、トップレベルで`return`を書いても処理を終了できます。

```ts
if (items.length === 0) {
  return;
}
```

`$runtime.exit()`は、関数の内側や共通処理の途中から、呼び出し元へ戻らずにwork全体を終了したい場合に使います。

```ts
function validate(value: string) {
  if (value === '') {
    $println('値が空です。');
    $runtime.exit();
  }
}

validate($resource.input);

$println('validateでexitした場合、この行は実行されません。');
```

## sleep

`sleep`は、指定したミリ秒だけ待機します。

```ts
$println('start');
await $runtime.sleep(1000);
$println('1秒後に実行されます');
```

戻り値は`Promise<void>`です。必ず`await`して利用します。

```ts
for (const item of items) {
  $println(item);
  await $runtime.sleep(300);
}
```

短い間隔で処理の様子を確認したい場合や、外部APIへの連続アクセスを少し抑えたい場合などに利用できます。

外部サイトやAPIへのアクセス間隔を制御する場合は、Pro版の[`$net`](/pro/api/net/)にも同一ドメインへのレート制御があります。ネットワークアクセスでは、`sleep`だけに頼らず、対象APIやサイト側の利用条件も確認してください。

## 注意点

- `$runtime.exit()`は正常終了として扱われます。異常系を表現したい場合は、通常の`throw new Error(...)`を使います。
- `$runtime.sleep(ms)`は単純な待機処理です。実行キャンセルやタイムアウト制御のAPIではありません。
- `sleep`中もworkの実行は完了していないため、長時間の待機を多用すると実行時間が長くなります。
- `fetch`、`console`、`window`、`document`などのブラウザ/Node.jsグローバルは、Trace Kernelのスクリプトランタイムでは提供されません。

## 型定義

```ts
type RuntimeAPI = {
  exit: () => void;
  sleep: (ms: number) => Promise<void>;
};
```
