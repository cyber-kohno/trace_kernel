use regex::Regex;
use serde::Deserialize;
use serde::Serialize;
use std::fs;
use std::io;
use std::path::Path;
use tauri::{command, AppHandle, Emitter};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // ここでキャメルケースに変換
pub struct ScanRequest {
    root_path: String,
    limit_depth: Option<u32>,
    dir_conds: Vec<DirCond>,
    file_conds: Vec<FileCond>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct BaseCond {
    pattern: String,
    is_exclude: bool,

    #[serde(skip)]
    compiled_pattern: Option<Regex>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
/// ディレクトリ検索条件
struct DirCond {
    #[serde(flatten)]
    base: BaseCond,
    depth: Option<u32>,
}
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
/// ファイル検索条件
struct FileCond {
    #[serde(flatten)]
    base: BaseCond,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanResponse {
    result: String,
    node: Node,
}
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Node {
    name: String,
    children: Option<Vec<Node>>,
}

#[command]
pub fn scan_directory(app: AppHandle, req: ScanRequest) -> Result<ScanResponse, String> {
    let mut counter: u32 = 0;

    let mut req = req;
    prepare_patterns(&mut req);

    let root = Path::new(&req.root_path);

    // ✅ ① 存在チェック
    if !root.exists() {
        return Err(format!(
            "The specified path does not exist: {}",
            req.root_path
        ));
    }

    // ✅ ② ディレクトリかチェック
    if !root.is_dir() {
        return Err(format!(
            "The specified path is not a directory: {}",
            req.root_path
        ));
    }

    // ✅ ③ read_dir できるかチェック（権限）
    if let Err(e) = fs::read_dir(root) {
        return Err(format!("Unable to read directory: {}", e));
    }
    let node = search_file_rec(root.to_str().unwrap(), &app, 0, &mut counter, &req)
        .map_err(|e| e.to_string())?; // ← ここで String に変換

    let res = ScanResponse {
        result: String::new(),
        node: node.unwrap_or(Node {
            name: "root".to_string(),
            children: None,
        }),
    };
    // // 完了通知
    app.emit("progress_done", true).unwrap();

    Ok(res)
}

fn prepare_patterns(scan_req: &mut ScanRequest) {
    for dir_cond in &mut scan_req.dir_conds {
        dir_cond.base.compiled_pattern = Some(compile_wildcard_pattern(&dir_cond.base.pattern));
    }
    for file_cond in &mut scan_req.file_conds {
        file_cond.base.compiled_pattern = Some(compile_wildcard_pattern(&file_cond.base.pattern));
    }
}

#[derive(Serialize)]
struct Progress {
    path: String,
    name: String,
    depth: u32,
    counter: u32,
}
/// 再帰的にディレクトリを検索する
fn search_file_rec(
    dir: &str,
    app: &AppHandle,
    depth: u32,
    counter: &mut u32,
    req: &ScanRequest,
) -> Result<Option<Node>, io::Error> {
    *counter += 1;

    let name = Path::new(dir).file_name().unwrap().to_str().unwrap();

    let applicable: Vec<&DirCond> = req
        .dir_conds
        .iter()
        .filter(|cond| cond.depth.map_or(true, |d| d == depth))
        .collect();

    let include_ok = applicable
        .iter()
        .filter(|c| !c.base.is_exclude)
        .all(|c| wildcard_match(c.base.compiled_pattern.as_ref().unwrap(), name));

    let exclude_hit = applicable
        .iter()
        .filter(|c| c.base.is_exclude)
        .any(|c| wildcard_match(c.base.compiled_pattern.as_ref().unwrap(), name));

    let is_accept = include_ok && !exclude_hit;

    if !is_accept {
        return Ok(Option::None);
    }
    let mut children: Vec<Node> = Vec::new();
    let mut node: Node = Node {
        name: name.to_string(),
        children: None,
    };
    let data = Progress {
        path: dir.to_string(),
        name: name.to_string(),
        depth,
        counter: *counter,
    };
    // フロントにイベント送信
    app.emit("progress", &data).unwrap();

    let dir_entries = fs::read_dir(dir)?;
    for file in dir_entries {
        let file = file.ok().unwrap();
        let path = file.path();

        if path.is_dir() {
            let meta = fs::symlink_metadata(&path)?;
            if meta.file_type().is_symlink() {
                continue;
            }
            // リミットが設定されている場合に限り、リミットに達していたらそれ以上深く走査しない
            if let Some(limit) = req.limit_depth {
                if depth == limit {
                    return Ok(Option::None);
                }
            }
            let child = search_file_rec(&path.display().to_string(), app, depth + 1, counter, req)?;
            match child {
                Some(n) => children.push(n),
                None => {}
            };
        } else {
            let file_applicable: Vec<&DirCond> = req
                .dir_conds
                .iter()
                .filter(|cond| cond.depth.map_or(true, |d| d == depth + 1))
                .collect();
            let has_dir_include = file_applicable.iter().any(|c| !c.base.is_exclude);
            if has_dir_include {
                continue;
            }

            let name = path.file_name().unwrap().to_str().unwrap().to_string();

            let include_conds: Vec<_> = req
                .file_conds
                .iter()
                .filter(|c| !c.base.is_exclude)
                .collect();

            let exclude_conds: Vec<_> = req
                .file_conds
                .iter()
                .filter(|c| c.base.is_exclude)
                .collect();

            let include_ok = include_conds.is_empty()
                || include_conds.iter().any(|cond| {
                    wildcard_match(cond.base.compiled_pattern.as_ref().unwrap(), &name)
                });

            let exclude_hit = exclude_conds
                .iter()
                .any(|cond| wildcard_match(cond.base.compiled_pattern.as_ref().unwrap(), &name));

            let is_accept = include_ok && !exclude_hit;

            if is_accept {
                children.push(Node {
                    name,
                    children: None,
                });
            }
        }
    }
    node.children = Some(children);
    Ok(Option::Some(node))
}

/// ワイルドカードパターンで文字列を判定
fn wildcard_match(compiled_pattern: &Regex, text: &str) -> bool {
    compiled_pattern.is_match(text)
}

/// ワイルドカード文字列 (「*」のみ) を正規表現に変換してコンパイルした Regex を返す
fn compile_wildcard_pattern(pattern: &str) -> Regex {
    // 1. 正規表現特殊文字をエスケープ
    // 2. `*` を `.*` に置換
    let mut regex_str = String::from("^"); // 先頭固定
    for ch in pattern.chars() {
        match ch {
            // `*` は任意文字列にマッチ
            '*' => regex_str.push_str(".*"),
            // それ以外はエスケープして追加
            '.' | '+' | '?' | '^' | '$' | '(' | ')' | '[' | ']' | '{' | '}' | '|' | '\\' => {
                regex_str.push('\\');
                regex_str.push(ch);
            }
            _ => regex_str.push(ch),
        }
    }
    regex_str.push('$'); // 終端固定
    Regex::new(&regex_str).expect("正規表現のコンパイルに失敗")
}
