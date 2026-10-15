use super::test_support::{sample, xlsx, Fixture, DATA, EMPTY};
use super::*;
use std::cell::Cell as Counter;

#[test]
fn real_xlsx_preserves_offsets_values_and_the_ts_response_shape() {
    let f = Fixture::new(&sample());
    let book = parse_file(&f.path(), &|| Ok(())).unwrap();
    assert_eq!(
        serde_json::to_value(book).unwrap(),
        serde_json::json!({"sheets": [{
            "name": "Data", "maxRow": 3, "maxCol": 2,
            "rows": [
                {"index": 2, "cells": [
                    {"row": 2, "col": 1, "value": "name"},
                    {"row": 2, "col": 2, "value": "count"}
                ]},
                {"index": 3, "cells": [
                    {"row": 3, "col": 1, "value": "alpha"},
                    {"row": 3, "col": 2, "value": "3"}
                ]}
            ]
        }]})
    );
}

#[test]
fn empty_workbooks_and_empty_sheets_keep_the_existing_empty_book_behavior() {
    for buffer in [xlsx(&[]), xlsx(&[("Empty", EMPTY)])] {
        let book = parse_excel_buffer(buffer, &|| Ok(())).unwrap();
        assert!(book.sheets.is_empty());
    }
}

#[test]
fn file_and_workbook_failures_are_errors() {
    let f = Fixture::new(b"not a workbook");
    assert!(parse_file(&f.path(), &|| Ok(()))
        .unwrap_err()
        .contains("failed to open excel"));
    assert!(parse_file(&format!("{}.missing", f.path()), &|| Ok(()))
        .unwrap_err()
        .contains("failed to read excel file"));
}

#[test]
fn a_broken_sheet_rejects_the_book_instead_of_returning_earlier_sheets() {
    let buffer = xlsx(&[("Data", DATA), ("Broken", "<worksheet><sheetData>")]);
    let error = parse_excel_buffer(buffer, &|| Ok(())).unwrap_err();
    assert!(
        error.contains("failed to read excel sheet \"Broken\""),
        "{error}"
    );
}

#[test]
fn cancellation_before_read_does_not_attempt_to_open_a_missing_file() {
    let f = Fixture::new(&sample());
    assert_eq!(
        parse_file(
            &format!("{}.missing", f.path()),
            &|| Err("cancelled".into())
        )
        .unwrap_err(),
        "cancelled"
    );
}

#[test]
fn cancellation_after_read_prevents_workbook_detection() {
    let f = Fixture::new(b"not a workbook");
    let calls = Counter::new(0);
    let error = parse_file(&f.path(), &|| {
        calls.set(calls.get() + 1);
        if calls.get() < 3 {
            Ok(())
        } else {
            Err("cancelled after read".into())
        }
    })
    .unwrap_err();
    assert_eq!(error, "cancelled after read");
}

#[test]
fn cancellation_after_calamine_open_prevents_sheet_conversion() {
    let before_open = archive_check_count(&sample()) + 2;
    let calls = Counter::new(0);
    let error = parse_excel_buffer(sample(), &|| {
        calls.set(calls.get() + 1);
        if calls.get() <= before_open {
            Ok(())
        } else {
            Err("cancelled after open".into())
        }
    })
    .unwrap_err();
    assert_eq!(error, "cancelled after open");
}

#[test]
fn cancellation_inside_sparse_row_and_cell_conversion_never_returns_partial_books() {
    // Sparse endpoints force conversion of empty cells and empty rows as well.
    for last in ["Z1", "A64"] {
        let xml = format!(
            r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row><c r="{last}"><v>2</v></c></row></sheetData></worksheet>"#
        );
        let calls = Counter::new(0);
        let buffer = xlsx(&[("Sparse", &xml)]);
        let cancel_at = archive_check_count(&buffer) + 20;
        let error = parse_excel_buffer(buffer, &|| {
            calls.set(calls.get() + 1);
            if calls.get() < cancel_at {
                Ok(())
            } else {
                Err("cancelled during conversion".into())
            }
        })
        .unwrap_err();
        assert_eq!(error, "cancelled during conversion");
        assert_eq!(calls.get(), cancel_at);
    }
}

fn archive_check_count(buffer: &[u8]) -> usize {
    let checks = Counter::new(0);
    limits::check_archive(buffer, Limits::default(), &|| {
        checks.set(checks.get() + 1);
        Ok(())
    })
    .unwrap();
    checks.get()
}

fn with_limits(buffer: Vec<u8>, limits: Limits) -> Result<Book, String> {
    parse_excel_buffer_with_limits(buffer, limits, &|| Ok(()))
}

#[test]
fn bounded_input_accepts_exact_bytes_and_rejects_excess_and_read_errors() {
    assert_eq!(
        limits::read_input(Cursor::new(b"abc"), 3, &|| Ok(())).unwrap(),
        b"abc"
    );
    assert!(limits::read_input(Cursor::new(b"abcd"), 3, &|| Ok(()))
        .unwrap_err()
        .contains("input byte limit"));
    struct FailedRead;
    impl std::io::Read for FailedRead {
        fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::other("test read failure"))
        }
    }
    assert!(limits::read_input(FailedRead, 3, &|| Ok(()))
        .unwrap_err()
        .contains("test read failure"));
    let buffer = sample();
    let exact = Limits {
        input: buffer.len(),
        ..Limits::default()
    };
    assert!(with_limits(buffer.clone(), exact).is_ok());
    assert!(with_limits(
        buffer,
        Limits {
            input: exact.input - 1,
            ..exact
        }
    )
    .unwrap_err()
    .contains("input byte limit"));
}

#[test]
fn production_file_entry_rejects_the_default_input_overflow() {
    let f = Fixture::new(&[]);
    let file = std::fs::OpenOptions::new()
        .write(true)
        .open(f.path())
        .unwrap();
    file.set_len(crate::resource_limits::EXCEL_INPUT_MAX_BYTES as u64 + 1)
        .unwrap();
    let error = parse_file(&f.path(), &|| Ok(())).unwrap_err();
    assert!(
        error.contains("Excel input byte limit exceeded (33554432)"),
        "{error}"
    );
}

fn archive(parts: &[&[u8]]) -> Vec<u8> {
    use std::io::Write;
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (index, part) in parts.iter().enumerate() {
        zip.start_file(
            format!("entry-{index}"),
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
        zip.write_all(part).unwrap();
    }
    zip.finish().unwrap().into_inner()
}

#[test]
fn archive_limits_measure_expansion_entries_and_workbook_wide_total() {
    let data = vec![b'x'; 10_000];
    let zip = archive(&[&data, &data]);
    assert!(zip.len() < 1000); // Compressed size alone cannot establish this budget.
    let exact = Limits {
        zip_bytes: 20_000,
        zip_entry_bytes: 10_000,
        zip_entries: 2,
        ..Limits::default()
    };
    assert!(limits::check_archive(&zip, exact, &|| Ok(())).is_ok());
    for (limits, message) in [
        (
            Limits {
                zip_entry_bytes: 9999,
                ..exact
            },
            "ZIP entry byte limit",
        ),
        (
            Limits {
                zip_bytes: 19_999,
                ..exact
            },
            "ZIP expanded byte limit",
        ),
        (
            Limits {
                zip_entries: 1,
                ..exact
            },
            "ZIP entry limit",
        ),
    ] {
        assert!(limits::check_archive(&zip, limits, &|| Ok(()))
            .unwrap_err()
            .contains(message));
    }
}

#[test]
fn dishonest_zip_sizes_do_not_bypass_actual_expanded_byte_limits() {
    let data = vec![b'x'; 10_000];
    let mut zip = archive(&[&data]);
    // Reduce only the central-directory uncompressed size; the stream still expands fully.
    let central = zip.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    zip[central + 24..central + 28].copy_from_slice(&1u32.to_le_bytes());
    for (limits, message) in [
        (
            Limits {
                zip_entry_bytes: 100,
                ..Limits::default()
            },
            "ZIP entry byte limit",
        ),
        (
            Limits {
                zip_bytes: 100,
                ..Limits::default()
            },
            "ZIP expanded byte limit",
        ),
    ] {
        let error = limits::check_archive(&zip, limits, &|| Ok(())).unwrap_err();
        assert!(error.contains(message), "{error}");
    }
}

#[test]
fn cancellation_during_archive_expansion_prevents_workbook_open() {
    let zip = archive(&[&vec![b'x'; 32_768]]);
    let checks = Counter::new(0);
    let error = parse_excel_buffer(zip, &|| {
        checks.set(checks.get() + 1);
        if checks.get() == 5 {
            Err("cancelled during ZIP expansion".into())
        } else {
            Ok(())
        }
    })
    .unwrap_err();
    assert_eq!(error, "cancelled during ZIP expansion");
}

#[test]
fn exact_workbook_wide_sheet_cell_range_and_text_budgets_are_accepted() {
    let data_only = xlsx(&[("Data", DATA)]);
    let exact = Limits {
        sheets: 1,
        cells: 4,
        range_cells: 4,
        text_bytes: 19,
        ..Limits::default()
    };
    assert!(with_limits(data_only.clone(), exact).is_ok()); // Data + name/count/alpha/3 = 19 bytes.
    for (limits, message) in [
        (Limits { sheets: 0, ..exact }, "sheet limit"),
        (Limits { cells: 3, ..exact }, "cell limit"),
        (
            Limits {
                range_cells: 3,
                ..exact
            },
            "range cell limit",
        ),
        (
            Limits {
                text_bytes: 18,
                ..exact
            },
            "text byte limit",
        ),
    ] {
        assert!(with_limits(data_only.clone(), limits)
            .unwrap_err()
            .contains(message));
    }
    let buffer = xlsx(&[("One", DATA), ("Two", DATA)]);
    for (limits, message) in [
        (
            Limits {
                sheets: 1,
                ..Limits::default()
            },
            "sheet limit",
        ),
        (
            Limits {
                cells: 7,
                ..Limits::default()
            },
            "cell limit",
        ),
        (
            Limits {
                range_cells: 7,
                ..Limits::default()
            },
            "range cell limit",
        ),
        (
            Limits {
                text_bytes: 35,
                ..Limits::default()
            },
            "text byte limit",
        ),
    ] {
        assert!(with_limits(buffer.clone(), limits)
            .unwrap_err()
            .contains(message));
    }
}

#[test]
fn sparse_xlsx_endpoints_are_rejected_before_dense_range_allocation() {
    let xml = r#"<worksheet><sheetData><row><c r="A1"><v>1</v></c></row><row><c r="XFD1048576"><v>2</v></c></row></sheetData></worksheet>"#;
    let error = parse_excel_buffer(xlsx(&[("Huge", xml)]), &|| Ok(())).unwrap_err();
    assert!(error.contains("range cell limit"), "{error}");
}

#[test]
fn empty_and_duplicate_source_cells_cannot_bypass_the_cell_budget() {
    for xml in [
        r#"<worksheet><sheetData><row><c r="A1"></c><c r="A2"></c><c r="A3"></c></row></sheetData></worksheet>"#,
        r#"<worksheet><sheetData><row><c r="A1"><v>1</v></c><c r="A1"><v>2</v></c><c r="A1"><v>3</v></c></row></sheetData></worksheet>"#,
    ] {
        let error = with_limits(
            xlsx(&[("Cells", xml)]),
            Limits {
                cells: 2,
                ..Limits::default()
            },
        )
        .unwrap_err();
        assert!(error.contains("cell limit"), "{error}");
    }
}

#[test]
fn source_text_copies_are_bounded_even_when_duplicate_cells_overwrite_each_other() {
    let xml = r#"<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>abc</t></is></c><c r="A1" t="inlineStr"><is><t>def</t></is></c></row></sheetData></worksheet>"#;
    let error = with_limits(
        xlsx(&[("S", xml)]),
        Limits {
            text_bytes: 5,
            ..Limits::default()
        },
    )
    .unwrap_err();
    assert!(error.contains("source text byte limit"), "{error}");
}

#[test]
fn out_of_order_cells_are_sorted_and_duplicate_coordinates_keep_the_last_value() {
    let xml = r#"<worksheet><sheetData><row><c r="B4"><v>1</v></c></row><row><c r="A1"><v>2</v></c><c r="A1"><v>3</v></c></row></sheetData></worksheet>"#;
    let book = parse_excel_buffer(xlsx(&[("S", xml)]), &|| Ok(())).unwrap();
    assert_eq!(book.sheets[0].rows[0].cells[0].value, "3");
    assert_eq!(book.sheets[0].max_row, 3);
    assert_eq!(book.sheets[0].max_col, 1);
}

#[test]
fn xlsx_bounds_use_actual_cells_not_a_large_advertised_dimension() {
    let xml = r#"<worksheet><dimension ref="A1:XFD1048576"/><sheetData><row><c r="C3"><v>1</v></c></row></sheetData></worksheet>"#;
    let book = with_limits(
        xlsx(&[("S", xml)]),
        Limits {
            range_cells: 1,
            ..Limits::default()
        },
    )
    .unwrap();
    assert_eq!(book.sheets[0].max_row, 2);
    assert_eq!(book.sheets[0].max_col, 2);
    let xml =
        r#"<worksheet><sheetData><row><c r="XFE1"><v>1</v></c></row></sheetData></worksheet>"#;
    assert!(parse_excel_buffer(xlsx(&[("S", xml)]), &|| Ok(()))
        .unwrap_err()
        .contains("worksheet bounds"));
}
