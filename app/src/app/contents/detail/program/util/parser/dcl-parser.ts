import DataUtil from '../../../../../util/data/data-util';
import type RuntimeUtil from '../../runtime/runtime-util';
import DomParser from './dom-parser';
import ExcelParser from './excel-parser';
import Inspector from './inspector';

namespace DclParser {
  type ParserAPI = {
    xml: (source: string) => Promise<DomParser.DomController>;
    html: (source: string) => Promise<DomParser.DomController>;
    excel: (filePath: string) => Promise<ExcelParser.Book>;
    csv: (source: string) => Inspector.TableInspector;
    tsv: (source: string) => Inspector.TableInspector;
    json: (source: string) => Inspector.JsonInspector;
  };

  export const getTypeDeclare = () => `
        type XmlNode = {
            name(): Promise<string | null>;
            text(): Promise<string>;
            attr(name: string): Promise<string | null>;
            children(): Promise<XmlNode[]>;
            parent(): Promise<XmlNode | null>;
            query(xpath: string): Promise<XmlNode[]>;
        };
        type DomController = {
            root(): Promise<XmlNode | null>;
            query(xpath: string): Promise<XmlNode[]>;
            debug(): Promise<{ domId: number; nodeCount: number }>;
            dispose(): Promise<void>;
        };
        type Book = {
            sheets: Sheet[];
            sheet(name: string): Sheet | null;
        };
        type Sheet = {
            name: string;
            maxRow: number;
            maxCol: number;
            rows: Row[];
            rowAt(index: number): Row | null;
            cellAt(rowIndex: number, colIndex: number): Cell | null;
            cellAt(address: string): Cell | null;
            toTable(headerRowIndex?: number): Record<string, string>[];
        };
        type Row = {
            rowIndex: number;
            cells: Cell[];
            cellAt(colIndex: number): Cell | null;
        };
        type Cell = {
            rowIndex: number;
            colIndex: number;
            address: string;
            value: string;
        };
        type JsonInspector = {
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
        type ParserAPI = {
            xml: (source: string) => Promise<DomController>;
            html: (source: string) => Promise<DomController>;
            excel: (filePath: string) => Promise<Book>;
            csv: (source: string) => Inspector.TableInspector;
            tsv: (source: string) => Inspector.TableInspector;
            json: (source: string) => JsonInspector;
        };
    `;

  export const getValueDeclare = () => 'ParserAPI';

  export const getObject = (rustCache: RuntimeUtil.RustCache): ParserAPI => {
    return {
      xml: (source: string) => DomParser.parse(rustCache, source),
      html: (source: string) => DomParser.parseHtml(rustCache, source),
      excel: (filePath: string) => ExcelParser.parse(filePath),
      csv: (source: string) => {
        const data = DataUtil.convertTableToJson(source, 'csv');
        return Inspector.createTableInspector(data);
      },
      tsv: (source: string) => {
        const data = DataUtil.convertTableToJson(source, 'tsv');
        return Inspector.createTableInspector(data);
      },
      json: (source: string) => {
        const data = JSON.parse(source);
        return Inspector.createJsonInspector(data);
      },
    };
  };
}
export default DclParser;
