import type RuntimeUtil from "../../runtime/runtimeUtil";
import DomParser from "./domParser";
import ExcelParser from "./excelParser";

namespace DclParser {

    type ParseerAPI = {
        xml: (source: string) => Promise<DomParser.DomController>;
        excel: (buffer: ArrayBuffer) => Promise<ExcelParser.Book>;
    }

    export const getTypeDeclare = () => `
        type Book = {
            sheets: Sheet[];
        };
        type Sheet = {
            name: string;
            maxRow: number;
            maxCol: number;
            rows: Row[];
        };
        type Row = {
            index: number;
            cells: Cell[];
        };
        type Cell = {
            row: number;
            col: number;
            value: string;
        };
        type ParseerAPI = {
            xml: (source: string) => Promise<DomController>;
            excel: (buffer: ArrayBuffer) => Promise<Book>;
        };
    `;

    export const getValueDeclare = () => 'ParseerAPI';

    export const getObject = (rustCache: RuntimeUtil.RustCache): ParseerAPI => {

        return {
            xml: (source: string) => {
                return DomParser.parse(rustCache, source);
            },
            excel: (buffer: ArrayBuffer) => {
                return ExcelParser.parse(buffer);
            }
        };
    }
};
export default DclParser;