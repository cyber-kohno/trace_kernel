namespace Inspector {

    type Base = {
        kind: string;

        // データの存在確認
        isEmpty(): boolean;

        // デバッグ・可視化用
        toJSON(): unknown;

        // エラー位置など（Trace Kernel的に重要）
        context(): {
            format: string;
            sourceInfo?: string;
        };
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
        getBoolean(key: string): boolean;

        has(key: string): boolean;

        keys(): string[];
    };

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