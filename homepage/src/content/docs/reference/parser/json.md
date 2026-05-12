---
title: JsonInspector
description: JSONをパス指定で操作するオブジェクト。
---

`$parser.json()`は、JSON文字列を解析し、パス指定で値を取り出せる`JsonInspector`を返します。

JSON全体をJavaScriptオブジェクトとして直接扱うこともできますが、`JsonInspector`を使うと、`users[0].name`のようなパスで必要な値だけを取り出せます。

```ts
const json = $parser.json($resource.configJson);

if (json.exists('users[0].name')) {
  $println(json.queryString('users[0].name'));
}
```

## JsonInspector

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `root()` | `unknown` | ルート値を返します。 |
| `query(path)` | `unknown` | パスの値を返します。存在しない場合はエラーです。 |
| `queryString(path)` | `string` | 文字列として値を返します。型が違う場合はエラーです。 |
| `queryNumber(path)` | `number` | 数値として値を返します。型が違う場合はエラーです。 |
| `queryBoolean(path)` | `boolean` | 真偽値として値を返します。型が違う場合はエラーです。 |
| `exists(path)` | `boolean` | パスが存在するか確認します。 |
| `keys(path?)` | `string[]` | オブジェクトのキー一覧を返します。 |
| `length(path?)` | `number` | 配列長、またはオブジェクトのキー数を返します。 |
| `toObject<T>()` | `T` | JSON全体を指定型として取得します。 |

パスは、ドットと配列インデックスで指定します。

```ts
json.query('users[0].profile.name');
json.queryNumber('items[3].price');
```

## サンプルJSON

以降の例では、次のJSON文字列を使います。

```ts
const source = `{
  "project": {
    "name": "Trace Kernel",
    "version": 1
  },
  "users": [
    { "id": "001", "name": "taro", "active": true, "score": 82 },
    { "id": "002", "name": "jiro", "active": false, "score": 64 }
  ],
  "tags": ["parser", "json", "reference"]
}`;

const json = $parser.json(source);
```

## 値を取り出す

`queryString()`、`queryNumber()`、`queryBoolean()`を使うと、期待する型で値を取り出せます。

```ts
$println(json.queryString('project.name'));
$println(String(json.queryNumber('project.version')));
$println(json.queryString('users[0].name'));
$println(String(json.queryBoolean('users[0].active')));
```

出力は次のようになります。

```txt
Trace Kernel
1
taro
true
```

型が違う場合はエラーになります。たとえば`project.version`は数値なので、`queryString('project.version')`では取得できません。

## 配列を扱う

配列は`users[0]`のようにインデックスで指定します。`length(path)`を使うと、配列の長さを取得できます。

```ts
const userCount = json.length('users');
$println(`users: ${userCount}`);

for (let i = 0; i < json.length('users'); i++) {
  const name = json.queryString(`users[${i}].name`);
  const score = json.queryNumber(`users[${i}].score`);
  $println(`${name}: ${score}`);
}
```

出力は次のようになります。

```txt
users: 2
taro: 82
jiro: 64
```

## 存在確認してから取り出す

存在しないパスを`query()`や`queryString()`で参照するとエラーになります。任意項目を扱う場合は、先に`exists()`で確認します。

```ts
if (json.exists('users[0].email')) {
  $println(json.queryString('users[0].email'));
} else {
  $println('email is not defined');
}
```

出力は次のようになります。

```txt
email is not defined
```

## キー一覧を取得する

`keys(path?)`は、オブジェクトのキー一覧を返します。

```ts
$println(json.keys('project').join(','));
$println(json.keys('users[0]').join(','));
```

出力は次のようになります。

```txt
name,version
id,name,active,score
```

## JSON全体をオブジェクトとして取得する

`toObject<T>()`を使うと、JSON全体を指定した型として取得できます。

```ts
type Config = {
  project: {
    name: string;
    version: number;
  };
  users: {
    id: string;
    name: string;
    active: boolean;
    score: number;
  }[];
  tags: string[];
};

const config = json.toObject<Config>();

$println(config.project.name);
$println(config.tags.join(','));
```

出力は次のようになります。

```txt
Trace Kernel
parser,json,reference
```

## エラーになりやすいケース

- 存在しないパスを`query()`で参照する
- 配列インデックスの範囲外を参照する
- `queryString()`、`queryNumber()`、`queryBoolean()`で実際の型と違う型を要求する
- `keys()`を配列やプリミティブ値に対して呼び出す
- `length()`を数値や文字列など、配列でもオブジェクトでもない値に対して呼び出す
