use crate::resource_limits::*;
use calamine::{DataType, Range, Xlsx};
use std::io::{Cursor, Read};

#[derive(Clone, Copy)]
pub(super) struct Limits {
    pub input: usize,
    pub zip_bytes: usize,
    pub zip_entry_bytes: usize,
    pub zip_entries: usize,
    pub sheets: usize,
    pub cells: usize,
    pub range_cells: usize,
    pub text_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            input: EXCEL_INPUT_MAX_BYTES,
            zip_bytes: EXCEL_ZIP_MAX_BYTES,
            zip_entry_bytes: EXCEL_ZIP_ENTRY_MAX_BYTES,
            zip_entries: EXCEL_ZIP_MAX_ENTRIES,
            sheets: EXCEL_MAX_SHEETS,
            cells: EXCEL_MAX_CELLS,
            range_cells: EXCEL_MAX_RANGE_CELLS,
            text_bytes: EXCEL_TEXT_MAX_BYTES,
        }
    }
}

pub(super) fn read_input(
    mut reader: impl Read,
    limit: usize,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Vec<u8>, String> {
    let mut buffer = LimitedBuffer::new(limit);
    let mut chunk = [0; 8192];
    loop {
        check()?;
        let size = reader
            .read(&mut chunk)
            .map_err(|e| format!("failed to read excel file: {e}"))?;
        check()?;
        if size == 0 {
            return Ok(buffer.into_bytes());
        }
        buffer.extend(&chunk[..size]).map_err(|e| match e {
            BufferError::LimitExceeded => format!("Excel input byte limit exceeded ({limit})"),
            BufferError::AllocationFailed => "Unable to allocate Excel input buffer".into(),
        })?;
    }
}

// Inspect actual decompressed bytes as well as the advertised sizes. Never extract to disk.
pub(super) fn check_archive(
    buffer: &[u8],
    limits: Limits,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<(), String> {
    let Ok(mut archive) = zip::ZipArchive::new(Cursor::new(buffer)) else {
        // Non-ZIP formats (and invalid workbooks) are still diagnosed by calamine.
        return Ok(());
    };
    if archive.len() > limits.zip_entries {
        return Err(format!(
            "Excel ZIP entry limit exceeded ({})",
            limits.zip_entries
        ));
    }
    let mut total = 0usize;
    let mut chunk = [0; 8192];
    for index in 0..archive.len() {
        check()?;
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("failed to inspect excel ZIP entry: {e}"))?;
        if entry.size() > limits.zip_entry_bytes as u64 {
            return Err(format!(
                "Excel ZIP entry byte limit exceeded ({})",
                limits.zip_entry_bytes
            ));
        }
        if entry.size() > (limits.zip_bytes - total) as u64 {
            return Err(format!(
                "Excel ZIP expanded byte limit exceeded ({})",
                limits.zip_bytes
            ));
        }
        let mut entry_bytes = 0usize;
        loop {
            check()?;
            let size = entry
                .read(&mut chunk)
                .map_err(|e| format!("failed to read excel ZIP entry: {e}"))?;
            check()?;
            if size == 0 {
                break;
            }
            if size > limits.zip_entry_bytes - entry_bytes {
                return Err(format!(
                    "Excel ZIP entry byte limit exceeded ({})",
                    limits.zip_entry_bytes
                ));
            }
            if size > limits.zip_bytes - total {
                return Err(format!(
                    "Excel ZIP expanded byte limit exceeded ({})",
                    limits.zip_bytes
                ));
            }
            entry_bytes += size;
            total += size;
        }
    }
    Ok(())
}

pub(super) struct Budget {
    pub limits: Limits,
    cells: usize,
    range_cells: usize,
    text_bytes: usize,
    source_text_bytes: usize,
}

impl Budget {
    pub fn new(limits: Limits) -> Self {
        Self {
            limits,
            cells: 0,
            range_cells: 0,
            text_bytes: 0,
            source_text_bytes: 0,
        }
    }
    pub fn cell(&mut self) -> Result<(), String> {
        if self.cells == self.limits.cells {
            return Err(format!("Excel cell limit exceeded ({})", self.limits.cells));
        }
        self.cells += 1;
        Ok(())
    }
    pub fn text(&mut self, bytes: usize) -> Result<(), String> {
        if bytes > self.limits.text_bytes - self.text_bytes {
            return Err(format!(
                "Excel text byte limit exceeded ({})",
                self.limits.text_bytes
            ));
        }
        self.text_bytes += bytes;
        Ok(())
    }
    fn source_text(&mut self, bytes: usize) -> Result<(), String> {
        if bytes > self.limits.text_bytes - self.source_text_bytes {
            return Err(format!(
                "Excel source text byte limit exceeded ({})",
                self.limits.text_bytes
            ));
        }
        self.source_text_bytes += bytes;
        Ok(())
    }
    fn check_area(&self, area: u64) -> Result<(), String> {
        if area > (self.limits.range_cells - self.range_cells) as u64 {
            return Err(format!(
                "Excel range cell limit exceeded ({})",
                self.limits.range_cells
            ));
        }
        Ok(())
    }
    pub fn range(&mut self, area: u64) -> Result<(), String> {
        self.check_area(area)?;
        self.range_cells += area as usize;
        Ok(())
    }
}

// Calamine's ordinary XLSX range reader builds a dense rectangle from sparse cells.
// Use its public streaming reader to validate that rectangle BEFORE allocating it.
pub(super) fn xlsx_range(
    workbook: &mut Xlsx<Cursor<Vec<u8>>>,
    name: &str,
    budget: &mut Budget,
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Range<DataType>, String> {
    let mut reader = workbook
        .worksheet_cells_reader(name)
        .map_err(|e| format!("failed to read excel sheet {name:?}: {e}"))?;
    let mut cells = Vec::new();
    let mut bounds: Option<(u32, u32, u32, u32)> = None;
    loop {
        check()?;
        let cell = reader
            .next_cell()
            .map_err(|e| format!("failed to read excel sheet {name:?}: {e}"))?;
        check()?;
        let Some(cell) = cell else {
            break;
        };
        budget.cell()?; // Count empty/duplicate source cells too.
        let (row, col) = cell.get_position();
        if row >= 1_048_576 || col >= 16_384 {
            return Err("Excel cell coordinates exceed XLSX worksheet bounds".into());
        }
        // This calamine version does not export DataTypeRef. Conversion may clone one
        // shared string, but it is checked before retaining it in the sparse vector.
        let value: DataType = cell.get_value().clone().into();
        match &value {
            DataType::Empty => continue,
            DataType::String(value)
            | DataType::DateTimeIso(value)
            | DataType::DurationIso(value) => budget.source_text(value.len())?,
            _ => (),
        }
        let (min_row, min_col, max_row, max_col) = bounds.unwrap_or((row, col, row, col));
        let next = (
            min_row.min(row),
            min_col.min(col),
            max_row.max(row),
            max_col.max(col),
        );
        let area = (u64::from(next.2) - u64::from(next.0) + 1)
            * (u64::from(next.3) - u64::from(next.1) + 1);
        budget.check_area(area)?;
        bounds = Some(next);
        cells.push(calamine::Cell::new((row, col), value));
    }
    // Range::from_sparse assumes row order; keep last-cell-wins for duplicate coordinates.
    cells.sort_by_key(|c| c.get_position());
    if let Some((min_row, min_col, max_row, max_col)) = bounds {
        budget.range(
            (u64::from(max_row) - u64::from(min_row) + 1)
                * (u64::from(max_col) - u64::from(min_col) + 1),
        )?;
    }
    check()?;
    Ok(Range::from_sparse(cells))
}
