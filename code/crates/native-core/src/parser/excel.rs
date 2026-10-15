use calamine::{open_workbook_auto_from_rs, Reader};
use serde::Serialize;
use std::io::Cursor;
mod limits;
use limits::{Budget, Limits};

#[derive(Debug, Serialize)]
pub struct Book {
    pub sheets: Vec<Sheet>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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

    pub value: String,
}
fn parse_excel_buffer(
    buffer: Vec<u8>,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Book, String> {
    parse_excel_buffer_with_limits(buffer, Limits::default(), check)
}

fn parse_excel_buffer_with_limits(
    buffer: Vec<u8>,
    limits: Limits,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Book, String> {
    check()?;
    if buffer.len() > limits.input {
        return Err(format!(
            "Excel input byte limit exceeded ({})",
            limits.input
        ));
    }
    limits::check_archive(&buffer, limits, check)?;
    check()?;
    let cursor = Cursor::new(buffer);
    let mut workbook: calamine::Sheets<Cursor<Vec<u8>>> =
        open_workbook_auto_from_rs(cursor).map_err(|e| format!("failed to open excel: {}", e))?;
    check()?;

    let mut sheets = Vec::new();
    let mut budget = Budget::new(limits);
    if workbook.sheet_names().len() > limits.sheets {
        return Err(format!("Excel sheet limit exceeded ({})", limits.sheets));
    }

    for name in workbook.sheet_names().to_owned() {
        check()?;
        budget.text(name.len())?;
        let range = if let calamine::Sheets::Xlsx(xlsx) = &mut workbook {
            limits::xlsx_range(xlsx, &name, &mut budget, check)?
        } else {
            // Other formats may allocate inside calamine before this check; see the handoff.
            let range = workbook
                .worksheet_range(&name)
                .map_err(|e| format!("failed to read excel sheet {name:?}: {e}"))?;
            let (height, width) = range.get_size();
            budget.range((height as u64) * (width as u64))?;
            for _ in range.used_cells() {
                check()?;
                budget.cell()?;
            }
            range
        };
        check()?;

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
            check()?;
            let actual_row = start_row + row_idx;
            let mut cells = Vec::new();

            for (col_idx, cell) in row.iter().enumerate() {
                check()?;
                let actual_col = start_col + col_idx;

                let value = cell.to_string();
                budget.text(value.len())?;

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

    check()?;
    Ok(Book { sheets })
}

pub fn parse_file(file_path: &str, check: &dyn Fn() -> Result<(), String>) -> Result<Book, String> {
    check()?;
    // A single OS read or calamine call still cannot be forcibly interrupted.
    let file =
        std::fs::File::open(file_path).map_err(|e| format!("failed to read excel file: {e}"))?;
    let buffer = limits::read_input(file, Limits::default().input, check)?;
    parse_excel_buffer(buffer, check)
}

#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;
