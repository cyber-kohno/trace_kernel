import type RuntimeUtil from "../../runtime/runtimeUtil";
import DomParser from "./domParser";
import ExcelParser from "./excelParser";
import type Inspector from "./inspector";

namespace DclParser {

    type ParseerAPI = {
        xml: {
            inspector: (source: string) => Promise<DomParser.DomController>;
        };
        excel: {
            object: (buffer: ArrayBuffer) => Promise<ExcelParser.Book>;
        }
        csv: {
            object: <T = any>(text: string) => T[];
            inspector: (text: string) => Inspector.TableInspector;
        };
        tsv: {
            object: <T = any>(text: string) => T[];
            inspector: (text: string) => Inspector.TableInspector;
        };
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
            xml: {
                inspector: (source: string) => {
                    return DomParser.parse(rustCache, source);
                }
            },
            excel: {
                object: (buffer: ArrayBuffer) => {
                    return ExcelParser.parse(buffer);
                }
            },
            csv: {
                inspector: (text) => {

                },
                object: (text) => {

                }
            }
        };
    }
};
export default DclParser;