use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{self, Write},
};

const MAX_WIRE_BYTES: usize = 8 * 1024 * 1024;
#[derive(Default)]
pub struct Output {
    method: String,
    definitions: HashMap<String, Value>,
    pending: HashMap<String, String>,
    out_bytes: usize,
    state_bytes: usize,
    pub failed: bool,
}
impl Output {
    fn write(&mut self, text: &str, stderr: bool) -> Result<(), String> {
        let count = if stderr {
            &mut self.state_bytes
        } else {
            &mut self.out_bytes
        };
        let result = if count
            .checked_add(text.len())
            .is_none_or(|n| n > MAX_WIRE_BYTES)
        {
            Err("CLI output exceeds 8 MiB wire budget".into())
        } else {
            *count += text.len();
            let result = if stderr {
                let mut w = io::stderr().lock();
                w.write_all(text.as_bytes()).and_then(|_| w.flush())
            } else {
                let mut w = io::stdout().lock();
                w.write_all(text.as_bytes()).and_then(|_| w.flush())
            };
            result.map_err(|e| format!("CLI output failed: {e}"))
        };
        if result.is_err() {
            self.failed = true;
        }
        result
    }
    pub fn set_method(&mut self, method: &str) -> Result<(), String> {
        if !matches!(method, "plain" | "channel") {
            return Err("Unsupported output method".into());
        }
        self.method = method.into();
        Ok(())
    }
    pub fn register(&mut self, id: &str, definition: Value) -> Result<(), String> {
        if self.method == "channel" {
            if !matches!(definition["view"].as_str(), Some("text" | "table")) {
                return Err("Unsupported channel view".into());
            }
            self.write(&(json!({"type":"channel","channelId":id,"view":definition["view"],"detail":definition["detail"]}).to_string()+"\n"),false)?;
        }
        self.definitions.insert(id.into(), definition);
        Ok(())
    }
    pub fn append(&mut self, id: &str, batches: &[Vec<String>]) -> Result<(), String> {
        let text = batches.iter().map(|b| b.join("\n")).collect::<String>();
        if self.method == "plain" {
            return self.write(&text, false);
        }
        let view = self
            .definitions
            .get(id)
            .and_then(|v| v["view"].as_str())
            .ok_or("Missing channel definition")?
            .to_string();
        if view == "text" {
            return self.write(
                &(json!({"type":"text","channelId":id,"text":text}).to_string() + "\n"),
                false,
            );
        }
        let pending = self.pending.entry(id.into()).or_default();
        pending.push_str(&text);
        let mut records = Vec::new();
        while let Some(end) = pending.find('\n') {
            let row: String = pending.drain(..=end).collect();
            let record: Value = serde_json::from_str(row.trim_end_matches('\n'))
                .map_err(|_| "Invalid table JSON record")?;
            records
                .push(json!({"type":"record","channelId":id,"record":record}).to_string() + "\n");
        }
        for record in records {
            self.write(&record, false)?;
        }
        Ok(())
    }
    pub fn state(&mut self, event: Value) -> Result<(), String> {
        self.write(&(event.to_string() + "\n"), true)
    }
    pub fn list(&mut self, list: Value) -> Result<(), String> {
        self.write(&(list.to_string() + "\n"), false)
    }
}
