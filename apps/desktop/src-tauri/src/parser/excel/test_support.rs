use std::io::{Cursor, Write};
use std::path::PathBuf;
use zip::write::FileOptions;

pub const DATA: &str = r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="3"><c r="B3" t="inlineStr"><is><t>name</t></is></c><c r="C3" t="inlineStr"><is><t>count</t></is></c></row>
<row r="4"><c r="B4" t="inlineStr"><is><t>alpha</t></is></c><c r="C4"><v>3</v></c></row>
</sheetData></worksheet>"#;
pub const EMPTY: &str = r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>"#;

pub fn sample() -> Vec<u8> {
    xlsx(&[("Data", DATA), ("Empty", EMPTY)])
}

pub fn xlsx(sheets: &[(&str, &str)]) -> Vec<u8> {
    let mut workbook = String::from(
        r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>"#,
    );
    let mut relations = String::from(
        r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#,
    );
    let mut types = String::from(
        r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>"#,
    );
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = FileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (i, (name, xml)) in sheets.iter().enumerate() {
        let id = i + 1;
        workbook.push_str(&format!(
            r#"<sheet name="{name}" sheetId="{id}" r:id="rId{id}"/>"#
        ));
        relations.push_str(&format!(
            r#"<Relationship Id="rId{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{id}.xml"/>"#
        ));
        types.push_str(&format!(
            r#"<Override PartName="/xl/worksheets/sheet{id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>"#
        ));
        archive
            .start_file(format!("xl/worksheets/sheet{id}.xml"), options)
            .unwrap();
        archive.write_all(xml.as_bytes()).unwrap();
    }
    workbook.push_str("</sheets></workbook>");
    relations.push_str("</Relationships>");
    types.push_str("</Types>");
    for (name, contents) in [
        ("xl/workbook.xml", workbook.as_str()),
        ("xl/_rels/workbook.xml.rels", relations.as_str()),
        ("[Content_Types].xml", types.as_str()),
        (
            "_rels/.rels",
            r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#,
        ),
    ] {
        archive.start_file(name, options).unwrap();
        archive.write_all(contents.as_bytes()).unwrap();
    }
    archive.finish().unwrap().into_inner()
}

pub struct Fixture(PathBuf);
impl Fixture {
    pub fn new(buffer: &[u8]) -> Self {
        let path =
            std::env::temp_dir().join(format!("trace-kernel-excel-{}.xlsx", uuid::Uuid::new_v4()));
        std::fs::write(&path, buffer).unwrap();
        Self(path)
    }

    pub fn path(&self) -> String {
        self.0.to_str().unwrap().to_owned()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
