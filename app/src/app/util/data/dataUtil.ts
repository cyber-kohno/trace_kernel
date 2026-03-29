import type StoreEnv from "../../store/storeEnv";
import type StoreResource from "../../store/StoreResource";
import Encoding from "encoding-japanese";
import type { TextEncoding } from "../../store/types";

namespace DataUtil {

    export type ColumnDef = {
        name: string;
        type: 'string' | 'number';
    };

    /**
     * CSV/TSVテキストから型推定付きオブジェクト配列を生成
     */
    // export const convertTableToJson = (
    //     source: string,
    //     parseMethod: StoreResource.ParseMethod
    // ): Record<string, any>[] => {
    //     if (!source) return [];

    //     const rows = source.split('\n').filter(r => r.trim() !== '');
    //     if (rows.length === 0) return [];

    //     const header = parseMethod === 'csv'
    //         ? rows[0].split(',').map(c => c.trim().replaceAll('"', ''))
    //         : rows[0].split('\t').map(c => c.trim());

    //     const dataRows = rows.slice(1);
    //     const columns = inferColumnTypes(header, dataRows, parseMethod);

    //     // データを型に従って変換
    //     return dataRows.map(row => {
    //         const cols = parseMethod === 'csv'
    //             ? row.split(',').map(c => c.trim())
    //             : row.split('\t');

    //         const obj: Record<string, any> = {};
    //         columns.forEach((col, i) => {
    //             let val = cols[i]?.trim() ?? '';

    //             if (parseMethod === 'csv') {
    //                 if (val.startsWith('"') && val.endsWith('"')) {
    //                     val = val.slice(1, -1).replace(/""/g, '"');
    //                     obj[col.name] = val;
    //                 } else if (col.type === 'number') {
    //                     obj[col.name] = Number(val);
    //                 } else {
    //                     obj[col.name] = val;
    //                 }
    //             } else {
    //                 obj[col.name] = val;
    //             }
    //         });

    //         return obj;
    //     });
    // };
    export const convertTableToJson = (
        source: string,
        parseMethod: StoreResource.ParseMethod
    ): Record<string, any>[] => {
        if (!source) return [];

        const rows =
            parseMethod === 'csv'
                ? splitCsvRows(source)
                : splitTsvRows(source);

        if (rows.length === 0) return [];

        const header = parseRow(rows[0], parseMethod);

        if (header.length === 0) {
            throw new Error('Header is empty');
        }

        const dataRows = rows.slice(1);

        const columns = inferColumnTypes(header, dataRows, parseMethod);

        return dataRows.map((row, rowIndex) => {
            const cols = parseRow(row, parseMethod);

            if (cols.length !== header.length) {
                throw new Error(
                    `Column mismatch at row ${rowIndex + 1}: expected ${header.length}, got ${cols.length}`
                );
            }

            const obj: Record<string, any> = {};

            columns.forEach((col, i) => {
                const raw = cols[i];

                if (raw === '') {
                    obj[col.name] = null;
                    return;
                }

                if (col.type === 'number') {
                    const n = Number(raw);
                    if (isNaN(n)) {
                        throw new Error(
                            `Invalid number at row ${rowIndex + 1}, column "${col.name}": "${raw}"`
                        );
                    }
                    obj[col.name] = n;
                } else {
                    obj[col.name] = raw;
                }
            });

            return obj;
        });
    };

    function splitCsvRows(text: string): string[] {
        const rows: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];

            if (c === '"') {
                if (inQuotes && text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                    current += c;
                }
            } else if ((c === '\n' || c === '\r') && !inQuotes) {
                if (current.trim() !== '') rows.push(current);
                current = '';

                // CRLF対応
                if (c === '\r' && text[i + 1] === '\n') i++;
            } else {
                current += c;
            }
        }

        if (current.trim() !== '') rows.push(current);

        return rows;
    }

    function parseCsvRow(row: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < row.length; i++) {
            const c = row[i];

            if (c === '"') {
                if (inQuotes && row[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += c;
            }
        }

        result.push(current);

        return result.map(v => v.trim());
    }

    function splitTsvRows(text: string): string[] {
        return text
            .split(/\r?\n/)
            .filter(r => r.trim() !== '');
    }

    function parseTsvRow(row: string): string[] {
        return row.split('\t');
    }
    function parseRow(row: string, method: StoreResource.ParseMethod): string[] {
        return method === 'csv'
            ? parseCsvRow(row)
            : parseTsvRow(row);
    }

    /**
     * CSV/TSVテキストから列型定義を生成
     */
    export const convertTableToColDefs = (
        source: string,
        parseMethod: StoreResource.ParseMethod
    ): ColumnDef[] => {
        if (!source) return [];

        const rows = source.split('\n').filter(r => r.trim() !== '');
        if (rows.length === 0) return [];

        const header = parseMethod === 'csv'
            ? rows[0].split(',').map(c => c.trim().replaceAll('"', ''))
            : rows[0].split('\t').map(c => c.trim());

        const dataRows = rows.slice(1);

        return inferColumnTypes(header, dataRows, parseMethod);
    };

    /**
     * ヘッダー + データ行から列型を推定する内部ユーティリティ
     */
    const inferColumnTypes = (
        header: string[],
        dataRows: string[],
        parseMethod: StoreResource.ParseMethod
    ): ColumnDef[] => {
        return header.map((name, colIdx) => {
            if (parseMethod === 'tsv' || dataRows.length === 0) {
                return { name, type: 'string' };
            }

            let isNumber = true;

            for (const row of dataRows) {
                const cols = parseMethod === 'csv' ? row.split(',') : row.split('\t');
                if (colIdx >= cols.length) {
                    isNumber = false;
                    break;
                }

                let val = cols[colIdx].trim();

                // クォート付き文字列は string
                if (parseMethod === 'csv' && val.startsWith('"') && val.endsWith('"')) {
                    isNumber = false;
                    break;
                }

                // NULL は string
                if (val.toUpperCase() === 'NULL') {
                    isNumber = false;
                    break;
                }

                if (parseMethod === 'csv' && (val === '' || isNaN(Number(val)))) {
                    isNumber = false;
                    break;
                }
            }

            return { name, type: isNumber ? 'number' : 'string' };
        });
    };

    export const convertJsonToTable = (
        obj: any[],
        parseMethod: StoreResource.ParseMethod
    ): string => {
        if (!obj.length) return '';

        // 1つ目のオブジェクトのキー順をヘッダーに採用
        const headers = Object.keys(obj[0]);

        // 他のオブジェクトに不足キーがあれば例外
        for (let i = 1; i < obj.length; i++) {
            const keys = Object.keys(obj[i]);
            if (keys.length !== headers.length || !headers.every(h => keys.includes(h))) {
                throw new Error(`Record at index ${i} does not match header keys.`);
            }
        }

        const lines: string[] = [];

        // ヘッダー行作成
        if (parseMethod === 'csv') {
            lines.push(headers.map(h => `"${h}"`).join(','));
        } else if (parseMethod === 'tsv') {
            lines.push(headers.join('\t'));
        } else {
            throw new Error(`${parseMethod} is undefined.`);
        }

        // レコード行作成
        for (const record of obj) {
            const row = headers.map(h => {
                const val = record[h];

                if (val === undefined) throw new Error(`Missing value for column "${h}".`);

                if (parseMethod === 'csv') {
                    // CSV: 文字列だけクォート、" を "" にエスケープ
                    if (typeof val === 'string') {
                        const escaped = val.replace(/"/g, '""');
                        return `"${escaped}"`;
                    } else {
                        return String(val);
                    }
                } else if (parseMethod === 'tsv') {
                    // TSV: 文字列中のタブ/改行/復帰をエスケープ
                    return String(val)
                        .replace(/\t/g, '\\t')
                        .replace(/\n/g, '\\n')
                        .replace(/\r/g, '\\r');
                } else {
                    throw new Error(`${parseMethod} is undefined.`);
                }
            });

            lines.push(row.join(parseMethod === 'csv' ? ',' : '\t'));
        }

        return lines.join('\n');
    };

    /** 環境変数を適用した値を返す */
    export const getAppliedEnvValue = (base: string, envs: StoreEnv.Props[]) => {
        return envs.reduce(
            (ret, cur) => ret.replaceAll(`%${cur.varName}%`, cur.value),
            base,
        );
    }

    export const decodeBinary = (
        binary: Uint8Array,
        encoding: TextEncoding
    ): string => {

        const decoder = new TextDecoder(
            encoding === "utf8" ? "utf-8" : "shift_jis"
        );
        return decoder.decode(binary);
    };

    export const encodeText = (
        text: string,
        encoding: TextEncoding
    ): Uint8Array => {

        if (encoding === "utf8") {
            return new TextEncoder().encode(text);
        }

        if (encoding === "sjis") {
            const arr = Encoding.convert(text, {
                to: "SJIS",
                type: "array"
            });
            return new Uint8Array(arr);
        }

        throw new Error("Unsupported encoding");
    };
}
export default DataUtil;