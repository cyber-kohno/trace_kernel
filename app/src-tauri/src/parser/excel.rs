use calamine::{open_workbook_auto_from_rs, Reader};
use serde::Serialize;
use std::io::Cursor;

#[derive(Debug, Serialize)]
pub struct Book {
    pub sheets: Vec<Sheet>,
}
#[derive(Debug, Serialize)]
pub struct Sheet {
    pub name: String,

    pub max_row: usize,
    pub max_col: usize,

    pub rows: Vec<Row>,
}
#[derive(Debug, Serialize)]
pub struct Row {
    pub index: usize, // 0-based
    pub cells: Vec<Cell>,
}
#[derive(Debug, Serialize)]
pub struct Cell {
    pub row: usize,
    pub col: usize,

    pub value: String, //CellValue,
}
#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum CellValue {
    Empty,

    String {
        value: String,
    },

    Number {
        value: f64,
    },

    Boolean {
        value: bool,
    },

    Date {
        /// ISO-8601 (UTC or local, 方針固定)
        value: String,
    },

    Formula {
        expr: String,

        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<Box<CellValue>>,
    },
}

#[tauri::command]
pub fn excel_parse(buffer: Vec<u8>) -> Result<Book, String> {
    let cursor = Cursor::new(buffer);
    let mut workbook: calamine::Sheets<Cursor<Vec<u8>>> =
        open_workbook_auto_from_rs(cursor).map_err(|e| format!("failed to open excel: {}", e))?;

    let mut sheets = Vec::new();

    for name in workbook.sheet_names().to_owned() {
        let Ok(range) = workbook.worksheet_range(&name) else {
            continue;
        };

        let Some((start_row, start_col)) = range.start() else {
            continue;
        };
        let Some((end_row, end_col)) = range.end() else {
            continue;
        };
        let start_row = start_row as usize;
        let start_col = start_col as usize;
        let end_row = end_row as usize;
        let end_col = end_col as usize;

        let mut rows = Vec::new();

        for (row_idx, row) in range.rows().enumerate() {
            let actual_row = start_row + row_idx;
            let mut cells = Vec::new();

            for (col_idx, cell) in row.iter().enumerate() {
                let actual_col = start_col + col_idx;

                let value = cell.to_string();

                // 完全空文字は捨てる（任意）
                if value.is_empty() {
                    continue;
                }

                cells.push(Cell {
                    row: actual_row,
                    col: actual_col,
                    value,
                });
            }

            if !cells.is_empty() {
                rows.push(Row {
                    index: actual_row,
                    cells,
                });
            }
        }

        sheets.push(Sheet {
            name,
            max_row: end_row,
            max_col: end_col,
            rows,
        });
    }

    Ok(Book { sheets })
}
