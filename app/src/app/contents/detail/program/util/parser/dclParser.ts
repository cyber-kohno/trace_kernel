import DataUtil from "../../../../../util/data/dataUtil";
import type RuntimeUtil from "../../runtime/runtimeUtil";
import DomParser from "./domParser";
import ExcelParser from "./excelParser";
import Inspector from "./inspector";

namespace DclParser {

    type ParserAPI = {
        xml: (source: string) => Promise<DomParser.DomController>;
        excel: (buffer: ArrayBuffer) => Promise<ExcelParser.Book>
        csv: (source: string) => Inspector.TableInspector;
        tsv: (source: string) => Inspector.TableInspector;
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
            xml: (source: string) => Promise<DomParser.DomController>;
            excel: (buffer: ArrayBuffer) => Promise<ExcelParser.Book>
            csv: (source: string) => Inspector.TableInspector;
            tsv: (source: string) => Inspector.TableInspector;
        };
    `;

    export const getValueDeclare = () => 'ParserAPI';

    export const getObject = (rustCache: RuntimeUtil.RustCache): ParserAPI => {

        return {
            xml: (source: string) => DomParser.parse(rustCache, source),
            excel: (buffer: ArrayBuffer) => ExcelParser.parse(buffer),
            csv: (source: string) => {
                const data = DataUtil.convertTableToJson(source, 'csv');
                return Inspector.createTableInspector(data);
            },
            tsv: (source: string) => {
                const data = DataUtil.convertTableToJson(source, 'tsv');
                return Inspector.createTableInspector(data);
            },
        };
    }
};
export default DclParser;