namespace TableInspector {
  export type Instance = {
    rowCount(): number;
    colCount(): number;

    columns(): string[];

    row(index: number): Row;

    toObject<T = any>(): T[];
  };

  export type Row = {
    get(key: string): unknown;

    getString(key: string): string;
    getNumber(key: string): number;

    has(key: string): boolean;

    keys(): string[];
  };

  export const create = (data: any[]): Instance => {
    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    const inspector: Instance = {
      rowCount: () => data.length,

      colCount: () => columns.length,

      columns: () => [...columns],

      row: (index: number) => {
        if (index < 0 || index >= data.length) {
          throw new Error(`Row index out of range: ${index}`);
        }

        return createRow(data[index], columns, index);
      },
      toObject: <T = any>() => data as T[],
    };

    return inspector;
  };

  function createRow(
    record: Record<string, any>,
    columns: string[],
    rowIndex: number,
  ): Row {
    return {
      get: (key: string) => {
        assertColumn(key, columns);
        return record[key];
      },

      getString: (key: string) => {
        assertColumn(key, columns);

        const v = record[key];

        if (v == null) {
          throw new Error(`Row ${rowIndex}: "${key}" is null`);
        }

        if (typeof v !== 'string') {
          throw new Error(
            `Row ${rowIndex}: "${key}" is not string (actual: ${typeof v})`,
          );
        }

        return v;
      },

      getNumber: (key: string) => {
        assertColumn(key, columns);

        const v = record[key];

        if (v == null) {
          throw new Error(`Row ${rowIndex}: "${key}" is null`);
        }

        if (typeof v !== 'number') {
          throw new Error(
            `Row ${rowIndex}: "${key}" is not number (actual: ${typeof v})`,
          );
        }

        return v;
      },

      has: (key: string) => {
        return columns.includes(key);
      },

      keys: () => [...columns],
    };
  }

  function assertColumn(key: string, columns: string[]) {
    if (!columns.includes(key)) {
      throw new Error(`Column not found: "${key}"`);
    }
  }
}
export default TableInspector;
