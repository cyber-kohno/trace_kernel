# Network API (`$net`)

`$net` is available only with the Pro capability. Network calls contact external services and may transmit request data. Confirm the user asked for network access and use the intended URL, method, headers, and body. `get_work_context` reports whether `$net` is currently injected.

## Convenience methods

- `getHtml(url)` returns `{ url, html, fetchedAt }`. The endpoint must return a `text/html` content type; non-HTML or oversized responses are errors. The result's `url` is the normalized requested URL, not necessarily the final redirect URL.
- `getText(url, options?)` returns the response body as text, including for non-2xx HTTP statuses.
- `getJson<T>(url, options?)` parses the response body as JSON and returns it as `T`, including for non-2xx HTTP statuses; the generic is a TypeScript assertion, not runtime schema validation.

## Full request

`request({ url, method?, query?, headers?, body?, timeoutMs? })` returns `url`, `status`, `ok`, optional `contentType`, `headers`, `body`, and `fetchedAt`. `url` is the normalized requested URL with appended query parameters; it does not report the final redirect URL. Query values that are null or undefined are omitted; other query values are converted to strings. The method defaults to `GET`; only `http` and `https` URLs are accepted. Check `ok` and `status` before treating a response as successful. `getText` and `getJson` return only the body/value, so use `request` when status or headers matter.

The current desktop implementation uses an 8-second default request timeout (override with `timeoutMs`), follows at most 3 redirects, and rejects response bodies larger than 2 MiB. Requests to the same host are spaced at least 3 seconds apart and currently limited to 30 requests per app session; the counter does not reset. `fetchedAt` is a Unix timestamp in seconds. Network, timeout, URL, method, rate-limit, and size failures reject the call rather than returning an HTTP response object. `getHtml` uses the same host limiter and body-size limit, and additionally rejects non-HTML content types.

```ts
const response = await $net.request({
  url: 'https://example.invalid/items',
  method: 'GET',
  query: { page: 1, active: true },
  timeoutMs: 10_000,
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const items = JSON.parse(response.body) as { id: string }[];
```

Use the service's documented endpoint and response shape. Do not treat a TypeScript cast as validation of untrusted JSON.
