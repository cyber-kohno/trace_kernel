import Core from '../../../../../../../../../packages/runtime-core/src/api/parser/excel-parser';
import WorkerInvoke from '../worker-invoke';
namespace ExcelParser {
  export type Book = Core.Book;
  export type Sheet = Core.Sheet;
  export type Row = Core.Row;
  export type Cell = Core.Cell;
  export const parse = (filePath: string) => Core.parse(filePath, WorkerInvoke);
}
export default ExcelParser;
