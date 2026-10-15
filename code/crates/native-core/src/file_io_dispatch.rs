//! Typed command decoding for non-Tauri hosts. Execution ownership is supplied
//! by the host as a guard, never obtained from a JavaScript execution ID.
use crate::{blocking_io, execution_io::Operation, file_system as fs, scan};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "command",
    content = "args",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum FileIoRequest {
    ExcelParseFile { file_path: String },
    ExistsPath { path: String },
    GlobPath { pattern: String },
    ReadBinary { file_path: String },
    ReadFile { req: fs::FileRequest },
    ReadTailFile { req: fs::TailFileRequest },
    ReadDir { dir: String },
    Stat { path: String },
    SaveText { path: String, content: String },
    SaveBinary { path: String, bytes: Vec<u8> },
    Rename { from: String, to: String },
    CopyFile { src: String, dest: String },
    MakeDir { dir_path: String },
    DeleteFile { path: String },
    DeleteDir { path: String },
    DeleteDirAll { path: String },
    ScanDirectory { req: scan::ScanRequest },
}

impl FileIoRequest {
    pub fn supports(command: &str) -> bool {
        matches!(
            command,
            "excel_parse_file"
                | "exists_path"
                | "glob_path"
                | "read_binary"
                | "read_file"
                | "read_tail_file"
                | "read_dir"
                | "stat"
                | "save_text"
                | "save_binary"
                | "rename"
                | "copy_file"
                | "make_dir"
                | "delete_file"
                | "delete_dir"
                | "delete_dir_all"
                | "scan_directory"
        )
    }

    pub fn decode(command: &str, args: Value) -> Result<Self, String> {
        serde_json::from_value(json!({ "command": command, "args": args }))
            .map_err(|error| format!("Invalid native file request: {error}"))
    }

    pub async fn execute(
        self,
        operation: Operation,
        mut progress: impl FnMut(&scan::Progress) + Send + 'static,
    ) -> Result<Value, String> {
        blocking_io::run_checked(Some(operation), move |check| match self {
            Self::ExcelParseFile { file_path } => {
                Ok(json!(crate::parser::excel::parse_file(&file_path, check)?))
            }
            Self::ExistsPath { path } => Ok(json!(fs::exists_path(path)?)),
            Self::GlobPath { pattern } => Ok(json!(fs::glob_path(pattern)?)),
            Self::ReadBinary { file_path } => Ok(json!(fs::read_binary(file_path)?)),
            Self::ReadFile { req } => Ok(json!(fs::read_file(req)?)),
            Self::ReadTailFile { req } => Ok(json!(fs::read_tail_file(req)?)),
            Self::ReadDir { dir } => Ok(json!(fs::read_dir(dir)?)),
            Self::Stat { path } => Ok(json!(fs::stat(path)?)),
            Self::ScanDirectory { req } => Ok(json!(scan::scan_directory(
                req,
                |value| progress(value),
                check
            )?)),
            Self::SaveText { path, content } => {
                fs::save_text(path, content)?;
                Ok(Value::Null)
            }
            Self::SaveBinary { path, bytes } => {
                fs::save_binary(path, bytes)?;
                Ok(Value::Null)
            }
            Self::Rename { from, to } => {
                fs::rename(from, to)?;
                Ok(Value::Null)
            }
            Self::CopyFile { src, dest } => {
                fs::copy_file(src, dest)?;
                Ok(Value::Null)
            }
            Self::MakeDir { dir_path } => {
                fs::make_dir(dir_path)?;
                Ok(Value::Null)
            }
            Self::DeleteFile { path } => {
                fs::delete_file(path)?;
                Ok(Value::Null)
            }
            Self::DeleteDir { path } => {
                fs::delete_dir(path)?;
                Ok(Value::Null)
            }
            Self::DeleteDirAll { path } => {
                fs::delete_dir_all(path)?;
                Ok(Value::Null)
            }
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;

    #[tokio::test]
    async fn stopped_guard_prevents_a_decoded_file_effect() {
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        io.request_stop();
        let request =
            FileIoRequest::decode("save_text", json!({"path":"unreachable","content":"never"}))
                .unwrap();
        assert!(request
            .execute(operation, |_| {})
            .await
            .unwrap_err()
            .contains("cancelled"));
        assert!(!io.has_active_operations());
        io.stop().await.unwrap();
    }

    #[test]
    fn malformed_arguments_and_unavailable_commands_are_rejected() {
        assert!(FileIoRequest::decode("save_binary", json!({"path":"x","bytes":[-1]})).is_err());
        assert!(FileIoRequest::decode("save_text", json!({"path":3,"content":"x"})).is_err());
        assert!(FileIoRequest::decode("run_process", json!({})).is_err());
        assert!(!FileIoRequest::supports("run_process"));
    }

    #[tokio::test]
    async fn real_file_dispatch_preserves_bytes_metadata_and_scan_shapes() {
        let root =
            std::env::temp_dir().join(format!("trace-kernel-dispatch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let file = root.join("日本語.txt");
        let io = ExecutionIo::new();
        let run = |command, args| {
            let request = FileIoRequest::decode(command, args).unwrap();
            request.execute(io.register().unwrap(), |_| {})
        };
        run("save_binary", json!({"path":file,"bytes":[0x82,0xa0]}))
            .await
            .unwrap();
        assert_eq!(
            run(
                "read_file",
                json!({"req":{"filePath":file,"encoding":"sjis"}})
            )
            .await
            .unwrap(),
            json!("あ")
        );
        assert_eq!(
            run("read_binary", json!({"filePath":file})).await.unwrap(),
            json!([0x82, 0xa0])
        );
        let stat = run("stat", json!({"path":file})).await.unwrap();
        assert_eq!(stat["isFile"], true);
        assert_eq!(stat["size"], 2);
        let scan = run(
            "scan_directory",
            json!({"req":{"rootPath":root,"dirConds":[],"fileConds":[]}}),
        )
        .await
        .unwrap();
        assert_eq!(scan["node"]["children"][0]["name"], "日本語.txt");
        run("delete_file", json!({"path":file})).await.unwrap();
        run("delete_dir", json!({"path":root})).await.unwrap();
        assert!(!io.has_active_operations());
        io.stop().await.unwrap();
    }
}
