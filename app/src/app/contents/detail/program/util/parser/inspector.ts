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
            }
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
}
export default Inspector;