import WorkerInvoke from '../worker-invoke';

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
    rowAt(index: number): Row | null;
    cellAt(rowIndex: number, colIndex: number): Cell | null;
    cellAt(address: string): Cell | null;
    toTable(headerRowIndex?: number): Record<string, string>[];
  };
  export type Row = {
    rowIndex: number;
    cells: Cell[];
    cellAt(colIndex: number): Cell | null;
  };
  export type Cell = {
    rowIndex: number;
    colIndex: number;
    address: string;
    value: string;
  };

  const toColumnName = (colIndex: number): string => {
    let value = colIndex + 1;
    let name = '';
    while (value > 0) {
      const rem = (value - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  };

  const toCellAddress = (rowIndex: number, colIndex: number): string =>
    `${toColumnName(colIndex)}${rowIndex + 1}`;

  const parseCellAddress = (
    address: string,
  ): { rowIndex: number; colIndex: number } | null => {
    const match = address.trim().match(/^\$?([A-Za-z]+)\$?([1-9][0-9]*)$/);
    if (!match) {
      return null;
    }

    const [, colPart, rowPart] = match;
    let colIndex = 0;
    for (const char of colPart.toUpperCase()) {
      colIndex = colIndex * 26 + (char.charCodeAt(0) - 64);
    }

    return {
      rowIndex: Number(rowPart) - 1,
      colIndex: colIndex - 1,
    };
  };

  const createCell = (raw: RawCell): Cell => ({
    rowIndex: raw.row,
    colIndex: raw.col,
    address: toCellAddress(raw.row, raw.col),
    value: raw.value,
  });

  const createRow = (raw: RawRow): Row => {
    const cells = raw.cells.map(createCell);
    return {
      rowIndex: raw.index,
      cells,
      cellAt(colIndex: number) {
        return cells.find((c) => c.colIndex === colIndex) ?? null;
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
      rowAt(index: number) {
        return rows.find((r) => r.rowIndex === index) ?? null;
      },
      cellAt(
        rowIndexOrAddress: number | string,
        colIndex?: number,
      ): Cell | null {
        if (typeof rowIndexOrAddress === 'string') {
          const index = parseCellAddress(rowIndexOrAddress);
          if (!index) {
            return null;
          }
          return this.rowAt(index.rowIndex)?.cellAt(index.colIndex) ?? null;
        }

        if (colIndex == null) {
          return null;
        }
        return this.rowAt(rowIndexOrAddress)?.cellAt(colIndex) ?? null;
      },
      toTable(headerRowIndex = 0) {
        const header = rows.find((r) => r.rowIndex === headerRowIndex);
        if (!header) {
          throw new Error(`Header row not found: ${headerRowIndex}`);
        }

        const headerCells = [...header.cells].sort(
          (a, b) => a.colIndex - b.colIndex,
        );
        const columns = headerCells.map((c) => c.value);

        if (columns.length === 0) {
          return [];
        }

        const dup = columns.find((name, idx) => columns.indexOf(name) !== idx);
        if (dup != null) {
          throw new Error(`Duplicate header column: "${dup}"`);
        }

        return rows
          .filter((r) => r.rowIndex > headerRowIndex)
          .map((r) => {
            const record: Record<string, string> = {};
            headerCells.forEach((cell, idx) => {
              record[columns[idx]] = r.cellAt(cell.colIndex)?.value ?? '';
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
        return sheets.find((s) => s.name === name) ?? null;
      },
    };
  };

  export const parse = async (filePath: string): Promise<Book> => {
    const raw = await WorkerInvoke.call<RawBook>('excel_parse_file', {
      filePath,
    });
    return createBook(raw);
  };
}
export default ExcelParser;
