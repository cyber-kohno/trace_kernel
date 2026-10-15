use serde_json::{json, Map, Value};

#[derive(Default)]
pub struct Host {
    pub entries: Map<String, Value>,
    pub scan_trees: Map<String, Value>,
    pub process_results: Map<String, Value>,
    pub calls: Vec<Value>,
    pub output: String,
    pub fail_command: String,
    pub fail_at: usize,
    pub matching_calls: usize,
}

impl Host {
    pub fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
        self.calls.push(json!({ "command": command, "args": args }));
        if command == self.fail_command {
            self.matching_calls += 1;
            if self.matching_calls == self.fail_at {
                return Err("Injected host failure".into());
            }
        }
        let field = |name: &str| -> Result<String, String> {
            args[name]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| format!("Missing {name}"))
        };
        let entry = |path: &str| -> Result<Value, String> {
            self.entries
                .get(path)
                .cloned()
                .ok_or_else(|| format!("Missing path: {path}"))
        };
        match command {
            "worker_init" | "add_channel" => Ok(Value::Null),
            "scan_directory" => {
                let root = args["req"]["rootPath"].as_str().ok_or("Missing rootPath")?;
                self.scan_trees
                    .get(root)
                    .cloned()
                    .map(|node| json!({ "node": node }))
                    .ok_or_else(|| format!("Missing scan fixture: {root}"))
            }
            "run_process" => {
                let program = args["req"]["program"].as_str().ok_or("Missing program")?;
                self.process_results
                    .get(program)
                    .cloned()
                    .ok_or_else(|| format!("Missing process fixture: {program}"))
            }
            "exists_path" => Ok(json!(self.entries.contains_key(&field("path")?))),
            "stat" => Ok(entry(&field("path")?)?["stat"].clone()),
            "read_binary" => Ok(entry(&field("filePath")?)?["bytes"].clone()),
            "read_dir" => Ok(entry(&field("dir")?)?["children"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into()),
            "read_file" => {
                let req = &args["req"];
                let path = req["filePath"].as_str().ok_or("Missing filePath")?;
                let bytes: Vec<u8> = serde_json::from_value(entry(path)?["bytes"].clone())
                    .map_err(|e| e.to_string())?;
                Ok(json!(decode(
                    &bytes,
                    req["encoding"].as_str().unwrap_or("utf8")
                )?))
            }
            "save_binary" | "save_text" => {
                let path = field("path")?;
                let bytes: Vec<u8> = if command == "save_binary" {
                    serde_json::from_value(args["bytes"].clone()).map_err(|e| e.to_string())?
                } else {
                    field("content")?.into_bytes()
                };
                self.entries.insert(path, json!({
                    "stat": { "isFile": true, "isDir": false, "readonly": false, "size": bytes.len(), "modifiedAt": 11 },
                    "bytes": bytes,
                }));
                Ok(Value::Null)
            }
            "make_dir" => {
                self.entries.insert(field("dirPath")?, json!({
                    "stat": { "isFile": false, "isDir": true, "readonly": false, "size": 0, "modifiedAt": 10 },
                    "children": [],
                }));
                Ok(Value::Null)
            }
            "delete_file" | "delete_dir" => {
                self.entries
                    .remove(&field("path")?)
                    .ok_or("Missing deletion target")?;
                Ok(Value::Null)
            }
            "rename" => {
                let value = entry(&field("from")?)?;
                self.entries.remove(&field("from")?);
                self.entries.insert(field("to")?, value);
                Ok(Value::Null)
            }
            "copy_file" => {
                let value = entry(&field("src")?)?;
                self.entries.insert(field("dest")?, value);
                Ok(Value::Null)
            }
            "append_output" => {
                self.output.push_str(&field("text")?);
                Ok(Value::Null)
            }
            _ => Err(format!("Unsupported spike command: {command}")),
        }
    }
}

pub fn decode(bytes: &[u8], encoding: &str) -> Result<String, String> {
    let encoding = match encoding {
        "utf8" | "utf-8" => encoding_rs::UTF_8,
        "sjis" | "shift_jis" => encoding_rs::SHIFT_JIS,
        _ => return Err("Unsupported spike encoding".into()),
    };
    Ok(encoding.decode(bytes).0.into_owned())
}
