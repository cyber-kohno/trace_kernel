import WorkerInvoke from './worker-invoke';
import type RuntimeUtil from '../runtime/runtime-util';

namespace DclNet {
  type QueryValue = string | number | boolean | null | undefined;

  type RequestOptions = {
    url: string;
    method?: string;
    query?: Record<string, QueryValue>;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  };

  type ResponsePayload = {
    url: string;
    status: number;
    ok: boolean;
    contentType?: string;
    headers: Record<string, string>;
    body: string;
    fetchedAt: number;
  };

  const buildRequest = (req: RequestOptions) => {
    const query =
      req.query == null
        ? undefined
        : Object.fromEntries(
            Object.entries(req.query)
              .filter(([, value]) => value != null)
              .map(([key, value]) => [key, String(value)]),
          );

    return {
      url: req.url,
      method: req.method,
      query,
      headers: req.headers,
      body: req.body,
      timeoutMs: req.timeoutMs,
    };
  };

  export const getObject = (rustCache: RuntimeUtil.RustCache) => {
    const call = <T>(command: string, args: object) =>
      WorkerInvoke.call<T>(
        command,
        {
          ...args,
          executionId: rustCache.executionId,
        },
        null,
      );
    return {
      getHtml: (url: string) => {
        return call('load_html_from_url', { url });
      },
      request: (req: RequestOptions) => {
        return call<ResponsePayload>('load_http', {
          req: buildRequest(req),
        });
      },
      getText: async (url: string, options?: Omit<RequestOptions, 'url'>) => {
        const res = await call<ResponsePayload>('load_http', {
          req: buildRequest({ url, ...options }),
        });
        return res.body;
      },
      getJson: async <T>(
        url: string,
        options?: Omit<RequestOptions, 'url'>,
      ): Promise<T> => {
        const res = await call<ResponsePayload>('load_http', {
          req: buildRequest({ url, ...options }),
        });
        return JSON.parse(res.body) as T;
      },
    };
  };

  export const getDeclare = () => {
    const apis = [
      'type NetQueryValue = string | number | boolean | null | undefined',
      'type NetRequest = { url: string; method?: string; query?: Record<string, NetQueryValue>; headers?: Record<string, string>; body?: string; timeoutMs?: number; }',
      'type NetResponse = { url: string; status: number; ok: boolean; contentType?: string; headers: Record<string, string>; body: string; fetchedAt: number; }',
      'getHtml: (url: string) => Promise<{url: string; html: string; fetchedAt: number;}>',
      'request: (req: NetRequest) => Promise<NetResponse>',
      'getText: (url: string, options?: Omit<NetRequest, "url">) => Promise<string>',
      'getJson: <T>(url: string, options?: Omit<NetRequest, "url">) => Promise<T>',
    ];
    return `{${apis.join(';')};}`;
  };
}
export default DclNet;
