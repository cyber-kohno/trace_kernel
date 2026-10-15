---
title: $net
description: Webページの取得や外部API呼び出しを行うAPI。
---

`$net`は、Webページの取得や外部APIの呼び出しを行うAPIです。

Trace Kernelのスクリプト環境では、ブラウザの`fetch`は提供されません。ネットワークアクセスが必要な場合は、Pro版で注入される`$net`を使います。

`$net`はTauri/Rust側のHTTPクライアントを経由して実行されます。HTML取得、HTTPリクエスト、テキスト取得、JSON取得を扱えます。

## API一覧

```ts
type NetQueryValue = string | number | boolean | null | undefined;

type NetRequest = {
  url: string;
  method?: string;
  query?: Record<string, NetQueryValue>;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

type NetResponse = {
  url: string;
  status: number;
  ok: boolean;
  contentType?: string;
  headers: Record<string, string>;
  body: string;
  fetchedAt: number;
};
```

| API | 説明 |
| --- | --- |
| `getHtml(url)` | HTMLページを取得します。レスポンスの`Content-Type`が`text/html`でない場合はエラーになります。 |
| `request(req)` | 任意のHTTPリクエストを実行し、ステータス、ヘッダー、本文を含むレスポンスを返します。 |
| `getText(url, options?)` | HTTPリクエストを実行し、レスポンス本文だけを文字列で返します。 |
| `getJson<T>(url, options?)` | HTTPリクエストを実行し、レスポンス本文を`JSON.parse`して返します。 |

## getHtml

HTMLページを取得します。

```ts
const source = await $net.getHtml('https://example.com');

$println(source.url);
$println(source.html);
$println(String(source.fetchedAt));
```

戻り値は次の形です。

```ts
{
  url: string;
  html: string;
  fetchedAt: number;
}
```

`getHtml`はHTML取得に特化したAPIです。レスポンスの`Content-Type`に`text/html`が含まれない場合は、`NotHtml`エラーになります。

## request

HTTPリクエストを実行し、レスポンス全体を取得します。

```ts
const res = await $net.request({
  url: 'https://api.example.com/items',
  method: 'GET',
  query: {
    limit: 20,
    active: true,
  },
  headers: {
    Accept: 'application/json',
  },
  timeoutMs: 5000,
});

if (!res.ok) {
  $println(`request failed: ${res.status}`);
  return;
}

$println(res.body);
```

`query`に指定した値は文字列へ変換され、URLのクエリパラメータとして追加されます。`null`と`undefined`の値は送信されません。

`method`を省略した場合は`GET`として扱われます。

## getText

レスポンス本文だけを文字列として取得します。

```ts
const text = await $net.getText('https://example.com/data.txt');
$println(text);
```

`request`と同じオプションを指定できます。

```ts
const text = await $net.getText('https://api.example.com/search', {
  query: { q: 'Trace Kernel' },
  headers: { Accept: 'text/plain' },
});
```

## getJson

レスポンス本文をJSONとしてパースして取得します。

```ts
type User = {
  id: string;
  name: string;
};

const users = await $net.getJson<User[]>('https://api.example.com/users');

for (const user of users) {
  $println(`${user.id}: ${user.name}`);
}
```

`getJson`は内部で`JSON.parse`を実行します。レスポンス本文がJSONとして不正な場合は、スクリプト実行時にエラーになります。

## リクエストの制限

`$net`は外部サイトや外部APIへアクセスするため、安全側の制限を持っています。

| 制限 | 内容 |
| --- | --- |
| URLスキーム | `http`と`https`のみ利用できます。 |
| 同一ドメイン間隔 | 同じドメインへの連続アクセスは、最低3秒間隔に制御されます。 |
| ドメインごとの回数 | 1つのドメインにつき、最大30リクエストまでです。超過すると`TooManyRequests`エラーになります。 |
| リダイレクト | 最大3回まで追従します。 |
| デフォルトタイムアウト | HTTPクライアント全体のタイムアウトは8秒です。 |
| 個別タイムアウト | `request` / `getText` / `getJson`では`timeoutMs`で個別指定できます。 |
| レスポンスサイズ | レスポンス本文が2MBを超える場合は`ResponseTooLarge`エラーになります。 |

同一ドメインへのアクセス間隔は、アプリ側で自動的に待機されます。たとえば同じドメインへ連続して`$net.getHtml()`を呼び出した場合、必要に応じて次のリクエストまで待機します。

この制限は、意図しない高頻度アクセスを避けるためのものです。スクレイピングや外部APIの利用では、対象サイトやAPIの利用規約、robots.txt、レート制限、認証条件を確認してから利用してください。関連する注意事項は[免責・利用上の注意](/legal/disclaimer/)も参照してください。

## エラー

Rust側のHTTP処理では、主に次のエラーが返されます。

| エラー | 内容 |
| --- | --- |
| `InvalidUrl` | URLとして解釈できない文字列です。 |
| `UnsupportedScheme` | `http` / `https`以外のスキームです。 |
| `InvalidMethod` | HTTPメソッドとして解釈できない値です。 |
| `NetworkError` | 通信やレスポンス読み取りに失敗しました。 |
| `ResponseTooLarge` | レスポンス本文が2MBを超えました。 |
| `NotHtml` | `getHtml`で取得したレスポンスがHTMLではありません。 |
| `TooManyRequests` | ドメインごとの最大リクエスト数を超えました。 |

`request`はHTTPステータスが4xxや5xxでも、通信自体に成功していれば`NetResponse`を返します。ステータス判定は`status`または`ok`で行います。

```ts
const res = await $net.request({
  url: 'https://api.example.com/items',
});

if (!res.ok) {
  $println(`HTTP ${res.status}`);
  return;
}

$println(res.body);
```

## 使いどころ

`$net`は、外部の情報をTrace Kernelの処理に取り込みたい場合に使います。

- 外部APIからJSONを取得して、`work`で加工する
- WebページのHTMLを取得し、`$parser`のDOM APIで解析する
- 社内HTTP APIから取得した結果を、`$channel`でテーブル出力する
- 取得結果を確認し、必要に応じてPro版の`$fs`でファイルへ反映する

大量アクセスや継続的なクローリングを目的とするAPIではありません。Trace Kernelの作業単位の中で、必要な外部情報を取得して処理へ接続するためのAPIとして利用します。
