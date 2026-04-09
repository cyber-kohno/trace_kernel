import WorkerInvoke from "../workerInvoke";

namespace ExcelParser {
    type RawBook = {
        sheets: RawSheet[];
    };
    type RawSheet = {
        name: string;
        maxRow: number;
        maxCol: number;
        rows: RawRow[];
    };
    type RawRow = {
        index: number;
        cells: RawCell[];
    };
    type RawCell = {
        row: number;
        col: number;
        value: string;
    };

    export type Book = {
        sheets: Sheet[];
        sheet(name: string): Sheet | null;
    };
    export type Sheet = {
        name: string;
        maxRow: number;
        maxCol: number;
        rows: Row[];
        row(index: number): Row | null;
        toTable(headerRow?: number): Record<string, string>[];
    };
    export type Row = {
        index: number;
        cells: Cell[];
        cell(col: number): Cell | null;
    };
    export type Cell = {
        row: number;
        col: number;
        value: string;
    };

    const createCell = (raw: RawCell): Cell => ({
        row: raw.row,
        col: raw.col,
        value: raw.value,
    });

    const createRow = (raw: RawRow): Row => {
        const cells = raw.cells.map(createCell);
        return {
            index: raw.index,
            cells,
            cell(col: number) {
                return cells.find(c => c.col === col) ?? null;
            },
        };
    };

    const createSheet = (raw: RawSheet): Sheet => {
        const rows = raw.rows.map(createRow);
        return {
            name: raw.name,
            maxRow: raw.maxRow,
            maxCol: raw.maxCol,
            rows,
            row(index: number) {
                return rows.find(r => r.index === index) ?? null;
            },
            toTable(headerRow = 0) {
                const header = rows.find(r => r.index === headerRow);
                if (!header) {
                    throw new Error(`Header row not found: ${headerRow}`);
                }

                const headerCells = [...header.cells].sort((a, b) => a.col - b.col);
                const columns = headerCells.map(c => c.value);

                if (columns.length === 0) {
                    return [];
                }

                const dup = columns.find((name, idx) => columns.indexOf(name) !== idx);
                if (dup != null) {
                    throw new Error(`Duplicate header column: "${dup}"`);
                }

                return rows
                    .filter(r => r.index > headerRow)
                    .map(r => {
                        const record: Record<string, string> = {};
                        headerCells.forEach((cell, idx) => {
                            record[columns[idx]] = r.cell(cell.col)?.value ?? "";
                        });
                        return record;
                    });
            },
        };
    };

    const createBook = (raw: RawBook): Book => {
        const sheets = raw.sheets.map(createSheet);
        return {
            sheets,
            sheet(name: string) {
                return sheets.find(s => s.name === name) ?? null;
            },
        };
    };

    export const parse = async (buffer: ArrayBuffer): Promise<Book> => {
        const raw = await WorkerInvoke.call<RawBook>("excel_parse", {
            buffer: new Uint8Array(buffer),
        });
        return createBook(raw);
    };
}
export default ExcelParser;
