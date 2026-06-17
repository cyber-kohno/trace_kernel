namespace JsonInspector {
  export type Instance = {
    root(): unknown;
    query<T = unknown>(path: string): T;
    queryString(path: string): string;
    queryNumber(path: string): number;
    queryBoolean(path: string): boolean;
    exists(path: string): boolean;
    keys(path?: string): string[];
    length(path?: string): number;
    toObject<T = any>(): T;
    toCsv(): string;
    toTsv(): string;
  };

  export const create = (data: unknown): Instance => {
    const read = (path: string) => {
      const hit = getByPath(data, path);
      if (!hit.found) {
        throw new Error(`Path not found: "${path}"`);
      }
      return hit.value;
    };

    return {
      root: () => data,
      query: <T = unknown>(path: string) => read(path) as T,
      queryString: (path: string) => {
        const v = read(path);
        if (typeof v !== 'string') {
          throw new Error(`Path "${path}" is not string (actual: ${typeof v})`);
        }
        return v;
      },
      queryNumber: (path: string) => {
        const v = read(path);
        if (typeof v !== 'number') {
          throw new Error(`Path "${path}" is not number (actual: ${typeof v})`);
        }
        return v;
      },
      queryBoolean: (path: string) => {
        const v = read(path);
        if (typeof v !== 'boolean') {
          throw new Error(
            `Path "${path}" is not boolean (actual: ${typeof v})`,
          );
        }
        return v;
      },
      exists: (path: string) => getByPath(data, path).found,
      keys: (path?: string) => {
        const target = path == undefined || path === '' ? data : read(path);
        if (
          target == null ||
          Array.isArray(target) ||
          typeof target !== 'object'
        ) {
          return [];
        }
        return Object.keys(target as Record<string, unknown>);
      },
      length: (path?: string) => {
        const target = path == undefined || path === '' ? data : read(path);
        if (Array.isArray(target)) return target.length;
        if (target == null || typeof target !== 'object') return 0;
        return Object.keys(target as Record<string, unknown>).length;
      },
      toObject: <T = any>() => data as T,
      toCsv: () => convertJsonArrayToTable(data, 'csv'),
      toTsv: () => convertJsonArrayToTable(data, 'tsv'),
    };
  };

  type TableFormat = 'csv' | 'tsv';

  type FlatRecord = Record<string, string | number>;

  function convertJsonArrayToTable(data: unknown, format: TableFormat): string {
    if (!Array.isArray(data)) {
      throw new Error('JSON root must be an array.');
    }

    if (data.length === 0) {
      throw new Error('JSON root array must contain at least one record.');
    }

    const first = asFlatRecord(data[0], 0);
    const headers = Object.keys(first);
    const columnTypes = headers.map((key) => ({
      key,
      isNumber: isNumberValue(first[key]),
    }));

    const lines: string[] = [
      headers
        .map((key) => formatCell(key, 'string', format))
        .join(delimiter(format)),
    ];

    data.forEach((item, index) => {
      const record = asFlatRecord(item, index);
      const keys = Object.keys(record);

      if (
        keys.length !== headers.length ||
        !headers.every((key) =>
          Object.prototype.hasOwnProperty.call(record, key),
        )
      ) {
        throw new Error(
          `JSON record at index ${index} does not match the first record keys.`,
        );
      }

      const row = columnTypes.map(({ key, isNumber }) => {
        const value = record[key];
        const actualIsNumber = isNumberValue(value);

        if (actualIsNumber !== isNumber) {
          throw new Error(
            `JSON record at index ${index}, key "${key}" has inconsistent type.`,
          );
        }

        return formatCell(value, isNumber ? 'number' : 'string', format);
      });

      lines.push(row.join(delimiter(format)));
    });

    return lines.join('\n');
  }

  function asFlatRecord(value: unknown, index: number): FlatRecord {
    if (!isPlainObject(value)) {
      throw new Error(`JSON record at index ${index} must be an object.`);
    }

    const record = value as Record<string, unknown>;
    const flat: FlatRecord = {};

    for (const [key, item] of Object.entries(record)) {
      if (typeof item === 'number') {
        if (!Number.isFinite(item)) {
          throw new Error(
            `JSON record at index ${index}, key "${key}" must be a finite number.`,
          );
        }
        flat[key] = item;
        continue;
      }

      if (typeof item === 'string') {
        flat[key] = item;
        continue;
      }

      throw new Error(
        `JSON record at index ${index}, key "${key}" must be a string or number.`,
      );
    }

    return flat;
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      value != null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }

  function isNumberValue(value: string | number): boolean {
    if (typeof value === 'number') return true;
    return value.trim() !== '' && !Number.isNaN(Number(value));
  }

  function formatCell(
    value: string | number,
    type: 'string' | 'number',
    format: TableFormat,
  ): string {
    const text = String(value);

    if (format === 'csv') {
      if (type === 'number') return text;
      return escapeCsvCell(text);
    }

    if (type === 'number') return text;
    return escapeTsvCell(text);
  }

  function escapeCsvCell(value: string): string {
    if (!/[",\r\n]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }

  function escapeTsvCell(value: string): string {
    return value
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }

  function delimiter(format: TableFormat): string {
    return format === 'csv' ? ',' : '\t';
  }

  type PathToken = string | number;

  function getByPath(
    source: unknown,
    path: string,
  ): { found: boolean; value: unknown } {
    const tokens = parsePath(path);
    let cur: unknown = source;

    for (const token of tokens) {
      if (typeof token === 'number') {
        if (!Array.isArray(cur)) return { found: false, value: undefined };
        if (token < 0 || token >= cur.length)
          return { found: false, value: undefined };
        cur = cur[token];
        continue;
      }

      if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) {
        return { found: false, value: undefined };
      }
      const rec = cur as Record<string, unknown>;
      if (!(token in rec)) return { found: false, value: undefined };
      cur = rec[token];
    }
    return { found: true, value: cur };
  }

  function parsePath(path: string): PathToken[] {
    const src = path.trim();
    if (src === '') return [];

    const tokens: PathToken[] = [];
    let i = 0;
    let key = '';

    const pushKey = () => {
      if (key.length > 0) {
        tokens.push(key);
        key = '';
      }
    };

    while (i < src.length) {
      const ch = src[i];
      if (ch === '.') {
        pushKey();
        i++;
        continue;
      }
      if (ch === '[') {
        pushKey();
        const close = src.indexOf(']', i + 1);
        if (close === -1) {
          throw new Error(`Invalid JSON path (missing "]"): "${path}"`);
        }
        const idxText = src.slice(i + 1, close).trim();
        if (!/^\d+$/.test(idxText)) {
          throw new Error(`Invalid array index in JSON path: "${path}"`);
        }
        tokens.push(Number(idxText));
        i = close + 1;
        continue;
      }
      key += ch;
      i++;
    }
    pushKey();
    return tokens;
  }
}
export default JsonInspector;
