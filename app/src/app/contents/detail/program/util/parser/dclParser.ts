import DataUtil from "../../../../../util/data/dataUtil";
import type RuntimeUtil from "../../runtime/runtimeUtil";
import DomParser from "./domParser";
import ExcelParser from "./excelParser";
import Inspector from "./inspector";

namespace DclParser {

    type ParserAPI = {
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
        type ParserAPI = {
            xml: (source: string) => Promise<DomController>;
            excel: (buffer: ArrayBuffer) => Promise<Book>;
        };
    `;

    export const getValueDeclare = () => 'ParseerAPI';

    export const getObject = (rustCache: RuntimeUtil.RustCache): ParserAPI => {

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
                object: <T = any>(text: string) => {
                    return DataUtil.convertTableToJson(text, 'csv') as T[];
                },
                inspector: (text: string) => {
                    const data = DataUtil.convertTableToJson(text, 'csv');
                    return Inspector.createTableInspector(data);
                }
            },
            tsv: {
                object: <T = any>(text: string) => {
                    return DataUtil.convertTableToJson(text, 'tsv') as T[];
                },
                inspector: (text: string) => {
                    const data = DataUtil.convertTableToJson(text, 'tsv');
                    return Inspector.createTableInspector(data);
                }
            }
        };
    }
};
export default DclParser;