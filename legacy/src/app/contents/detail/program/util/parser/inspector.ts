namespace Inspector {

    type Base = {
        kind: string;

        // // データの存在確認
        // isEmpty(): boolean;

        // // デバッグ・可視化用
        // toJSON(): unknown;

        // // エラー位置など（Trace Kernel的に重要）
        // context(): {
        //     format: string;
        //     sourceInfo?: string;
        // };
    };

    export type TableInspector = Base & {
        kind: "table";

        rowCount(): number;
        colCount(): number;

        columns(): string[];

        row(index: number): TableRow;

        toObject<T = any>(): T[]
    };

    export type TableRow = {
        get(key: string): unknown;

        getString(key: string): string;
        getNumber(key: string): number;

        has(key: string): boolean;

        keys(): string[];
    };

    export const createTableInspector = (data: any[]): TableInspector => {

        const columns = data.length > 0
            ? Object.keys(data[0])
            : [];

        const inspector: TableInspector = {
            kind: "table",

            rowCount: () => data.length,

            colCount: () => columns.length,

            columns: () => [...columns],

            row: (index: number) => {
                if (index < 0 || index >= data.length) {
                    throw new Error(`Row index out of range: ${index}`);
                }

                return createRow(data[index], columns, index);
            },
            toObject: <T = any>() => data as T[]
        };

        return inspector;
    }

    function createRow(
        record: Record<string, any>,
        columns: string[],
        rowIndex: number
    ): TableRow {
        return {
            get: (key: string) => {
                assertColumn(key, columns);
                return record[key];
            },

            getString: (key: string) => {
                assertColumn(key, columns);

                const v = record[key];

                if (v == null) {
                    throw new Error(`Row ${rowIndex}: "${key}" is null`);
                }

                if (typeof v !== "string") {
                    throw new Error(
                        `Row ${rowIndex}: "${key}" is not string (actual: ${typeof v})`
                    );
                }

                return v;
            },

            getNumber: (key: string) => {
                assertColumn(key, columns);

                const v = record[key];

                if (v == null) {
                    throw new Error(`Row ${rowIndex}: "${key}" is null`);
                }

                if (typeof v !== "number") {
                    throw new Error(
                        `Row ${rowIndex}: "${key}" is not number (actual: ${typeof v})`
                    );
                }

                return v;
            },

            has: (key: string) => {
                return columns.includes(key);
            },

            keys: () => [...columns]
        };
    }

    function assertColumn(key: string, columns: string[]) {
        if (!columns.includes(key)) {
            throw new Error(`Column not found: "${key}"`);
        }
    }

    export type TreeInspector = Base & {
        kind: "tree";

        root(): TreeNode;
    };

    export type TreeNode = {
        name(): string;

        get(path: string): TreeNode | null;

        getString(path: string): string;
        getNumber(path: string): number;

        children(): TreeNode[];

        has(path: string): boolean;
    };

    export type JsonInspector = Base & {
        kind: "json";

        root(): unknown;
        query(path: string): unknown;
        queryString(path: string): string;
        queryNumber(path: string): number;
        queryBoolean(path: string): boolean;
        exists(path: string): boolean;
        keys(path?: string): string[];
        length(path?: string): number;
        toObject<T = any>(): T;
    };

    export const createJsonInspector = (data: unknown): JsonInspector => {
        const read = (path: string) => {
            const hit = getByPath(data, path);
            if (!hit.found) {
                throw new Error(`Path not found: "${path}"`);
            }
            return hit.value;
        };

        return {
            kind: "json",
            root: () => data,
            query: (path: string) => read(path),
            queryString: (path: string) => {
                const v = read(path);
                if (typeof v !== "string") {
                    throw new Error(`Path "${path}" is not string (actual: ${typeof v})`);
                }
                return v;
            },
            queryNumber: (path: string) => {
                const v = read(path);
                if (typeof v !== "number") {
                    throw new Error(`Path "${path}" is not number (actual: ${typeof v})`);
                }
                return v;
            },
            queryBoolean: (path: string) => {
                const v = read(path);
                if (typeof v !== "boolean") {
                    throw new Error(`Path "${path}" is not boolean (actual: ${typeof v})`);
                }
                return v;
            },
            exists: (path: string) => getByPath(data, path).found,
            keys: (path?: string) => {
                const target = path == undefined || path === "" ? data : read(path);
                if (target == null || Array.isArray(target) || typeof target !== "object") {
                    return [];
                }
                return Object.keys(target as Record<string, unknown>);
            },
            length: (path?: string) => {
                const target = path == undefined || path === "" ? data : read(path);
                if (Array.isArray(target)) return target.length;
                if (target == null || typeof target !== "object") return 0;
                return Object.keys(target as Record<string, unknown>).length;
            },
            toObject: <T = any>() => data as T,
        };
    };

    type PathToken = string | number;

    function getByPath(source: unknown, path: string): { found: boolean; value: unknown } {
        const tokens = parsePath(path);
        let cur: unknown = source;

        for (const token of tokens) {
            if (typeof token === "number") {
                if (!Array.isArray(cur)) return { found: false, value: undefined };
                if (token < 0 || token >= cur.length) return { found: false, value: undefined };
                cur = cur[token];
                continue;
            }

            if (cur == null || typeof cur !== "object" || Array.isArray(cur)) {
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
        if (src === "") return [];

        const tokens: PathToken[] = [];
        let i = 0;
        let key = "";

        const pushKey = () => {
            if (key.length > 0) {
                tokens.push(key);
                key = "";
            }
        };

        while (i < src.length) {
            const ch = src[i];
            if (ch === ".") {
                pushKey();
                i++;
                continue;
            }
            if (ch === "[") {
                pushKey();
                const close = src.indexOf("]", i + 1);
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
export default Inspector;
