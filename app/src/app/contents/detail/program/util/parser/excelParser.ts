import WorkerInvoke from "../workerInvoke";

namespace ExcelParser {

    export type Book = {
        sheets: Sheet[];
    };
    export type Sheet = {
        name: string;
        maxRow: number;
        maxCol: number;
        rows: Row[];
    };
    export type Row = {
        index: number;
        cells: Cell[];
    };
    export type Cell = {
        row: number;
        col: number;
        value: string;
    };

    export const parse = (buffer: ArrayBuffer) => {
        return WorkerInvoke.call<Book>('excel_parse', { buffer: new Uint8Array(buffer), });
    }
};
export default ExcelParser;