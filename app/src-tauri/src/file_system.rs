use encoding_rs::{Encoding as RsEncoding, SHIFT_JIS, UTF_8};
use encoding_rs_io::DecodeReaderBytesBuilder;
use glob::glob;
use serde::Deserialize;
use serde::Serialize;
use serde_bytes::ByteBuf;
use std::fs;
use std::fs::File;
use std::io;
use std::io::BufReader;
use std::io::Read;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // ここでキャメルケースに変換
pub struct FileRequest {
    file_path: String,
    encoding: Encoding,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Encoding {
    Utf8,
    Sjis,
}
impl Encoding {
    pub fn to_rs_encoding(&self) -> &'static RsEncoding {
        match self {
            Encoding::Utf8 => UTF_8,
            Encoding::Sjis => SHIFT_JIS,
        }
    }
}

#[tauri::command]
pub fn exists_path(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn glob_path(pattern: String) -> Result<Vec<String>, String> {
    // ① 絶対パスチェック
    if !Path::new(&pattern).is_absolute() {
        return Err("glob pattern must be absolute path".into());
    }

    let mut results = Vec::new();

    for entry in glob(&pattern).map_err(|e| e.msg)? {
        match entry {
            Ok(path) => {
                results.push(path.to_string_lossy().to_string());
            }
            Err(e) => {
                // 個別エラーは無視（UNIX glob 的挙動）
            }
        }
    }

    Ok(results)
}

#[command]
pub fn read_binary(file_path: String) -> Result<ByteBuf, String> {
    std::fs::read(&file_path)
        .map(ByteBuf::from)
        .map_err(|e| e.to_string())
}

#[command]
pub fn read_file(req: FileRequest) -> String {
    // println!("{}", req.file_path);
    let content = match read_file_to_string(req.file_path, req.encoding) {
        Ok(text) => text,
        Err(err) => err.to_string(),
    };
    content
}

pub fn read_file_to_string<P: AsRef<std::path::Path>>(
    path: P,
    encoding: Encoding,
) -> Result<String, io::Error> {
    let file: File = File::open(path)?;
    let mut buf_reader = BufReader::new(file);

    // デフォルトでは UTF‑8 が前提です。別エンコーディングなら `DecodeReaderBytesBuilder::new().encoding(Some(Encoding::for_label(b"shift_jis").unwrap()))` で指定できます
    // let mut decoder = DecodeReaderBytesBuilder::new().build(&mut buf_reader);
    let mut decoder: encoding_rs_io::DecodeReaderBytes<&mut BufReader<File>, Vec<u8>> =
        DecodeReaderBytesBuilder::new()
            .encoding(Some(encoding.to_rs_encoding())) // ← ここで SJIS を指定
            .build(&mut buf_reader); // ← デコーダを作成

    let mut s = String::new();
    decoder.read_to_string(&mut s)?;
    Ok(s)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirBelong {
    name: String,
    is_dir: bool,
}

#[command]
pub fn read_dir(dir: String) -> Result<Vec<DirBelong>, String> {
    let mut result = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        result.push(DirBelong {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: path.is_dir(),
        });
    }

    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatDto {
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    pub readonly: bool,
    pub created_at: Option<u128>,
    pub modified_at: Option<u128>,
}

fn to_epoch_millis(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[tauri::command]
pub fn stat(path: String) -> Result<FileStatDto, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;

    Ok(FileStatDto {
        size: meta.len(),
        is_file: meta.is_file(),
        is_dir: meta.is_dir(),
        readonly: meta.permissions().readonly(),
        created_at: meta.created().ok().map(to_epoch_millis),
        modified_at: meta.modified().ok().map(to_epoch_millis),
    })
}

#[tauri::command]
pub fn save_text(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename(from: String, to: String) -> Result<(), String> {
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(src: String, dest: String) -> Result<(), String> {
    std::fs::copy(&src, &dest)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn make_dir(dir_path: String) -> Result<(), String> {
    std::fs::create_dir_all(&dir_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(path: String, target: String) -> Result<(), String> {
    let p = Path::new(&path);

    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;

    let is_dir = metadata.is_dir();
    let expected_is_dir = target == "directory";

    if is_dir != expected_is_dir {
        return Err(format!("Target is not a {}", target));
    }

    if is_dir {
        std::fs::remove_dir(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}
