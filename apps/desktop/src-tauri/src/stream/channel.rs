use std::collections::HashMap;

use tauri::State;

use crate::{runtime::AppState, stream::line_buffer::LineBuffer};

pub struct ChannelStore {
    channels: HashMap<String, LineBuffer>,
}

impl ChannelStore {
    pub fn new() -> Self {
        Self {
            channels: HashMap::new(),
        }
    }

    /// 明示的に追加（重複はエラーにしたい場合）
    pub fn add_channel(&mut self, channel_id: String) -> Result<(), String> {
        if self.channels.contains_key(&channel_id) {
            return Err(format!("channel already exists: {}", channel_id));
        }

        self.channels.insert(channel_id, LineBuffer::new());
        Ok(())
    }
    pub fn append_lines(
        &mut self,
        channel_id: &str,
        batches: Vec<Vec<String>>,
    ) -> Result<(), String> {
        let buffer = self
            .channels
            .get_mut(channel_id)
            .ok_or("channel not found")?;

        for lines in batches {
            buffer.push_lines(lines);
        }

        Ok(())
    }
}
#[tauri::command]
pub fn add_channel(state: State<AppState>, execution_id: String, channel_id: String) {
    let mut executions = state.executions.lock().unwrap();

    if let Some(execution) = executions.get_mut(&execution_id) {
        let _ = execution.channel_store.add_channel(channel_id);
    }
}

#[tauri::command]
pub fn append_lines(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
    batches: Vec<Vec<String>>,
) {
    let mut executions = state.executions.lock().unwrap();

    if let Some(w) = executions.get_mut(&execution_id) {
        let _ = w.channel_store.append_lines(&channel_id, batches);
    }
}

#[tauri::command]
pub fn get_range_lines(
    state: tauri::State<AppState>,
    execution_id: String,
    channel_id: String,
    from: usize,
    to: usize,
) -> Vec<String> {
    let executions = state.executions.lock().unwrap();
    let Some(execution) = executions.get(&execution_id) else {
        return Vec::new();
    };
    let store = &execution.channel_store;

    let Some(buf) = store.channels.get(&channel_id) else {
        return Vec::new();
    };
    let len = buf.lines.len();
    if from >= len {
        return Vec::new();
    }

    let end = to.min(len);
    buf.lines[from..end].to_vec()
}

#[tauri::command]
pub fn get_line_len(
    state: tauri::State<AppState>,
    execution_id: String,
    channel_id: String,
) -> usize {
    let executions = state.executions.lock().unwrap();

    executions
        .get(&execution_id)
        .map(|w| {
            let Some(buf) = w.channel_store.channels.get(&channel_id) else {
                return 0;
            };
            let lines = &buf.lines;
            match lines.last() {
                Some(last) if last.is_empty() => lines.len().saturating_sub(1),
                _ => lines.len(),
            }
        })
        .unwrap_or(0)
}
