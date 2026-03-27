import type RuntimeUtil from "../../runtime/runtimeUtil";
import DomParser from "./domParser";
import ExcelParser from "./excelParser";
import type Inspector from "./inspector";

namespace DclParser {

<<<<<<< HEAD
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
=======
    type ParserAPI = {
        xml: (source: string) => Promise<DomParser.DomController>;
        excel: (buffer: ArrayBuffer) => Promise<ExcelParser.Book>;
>>>>>>> 45b58faa9b0da2e34e6cc17f76bc9b8993579d5a
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
                inspector: (text) => {

                },
                object: (text) => {

                }
            }
        };
    }
};
export default DclParser;