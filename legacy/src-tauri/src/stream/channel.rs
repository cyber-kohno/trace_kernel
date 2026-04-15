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
pub fn add_channel(state: State<AppState>, worker_id: String, channel_id: String) {
    let mut workers = state.workers.lock().unwrap();

    if let Some(worker) = workers.get_mut(&worker_id) {
        worker.channel_store.add_channel(channel_id);
    }
}

#[tauri::command]
pub fn append_lines(
    state: State<AppState>,
    worker_id: String,
    channel_id: String,
    batches: Vec<Vec<String>>,
) {
    let mut workers = state.workers.lock().unwrap();

    if let Some(w) = workers.get_mut(&worker_id) {
        w.channel_store
            .append_lines(&channel_id, batches)
            .expect("There is no buffer corresponding to the channel ID.");
    }
}

#[tauri::command]
pub fn get_range_lines(
    state: tauri::State<AppState>,
    worker_id: String,
    channel_id: String,
    from: usize,
    to: usize,
) -> Vec<String> {
    let workers = state.workers.lock().unwrap();
    let worker = workers.get(&worker_id).unwrap();
    let store = &worker.channel_store;

    let buf: &LineBuffer = store
        .channels
        .get(&channel_id)
        .expect("here is no buffer corresponding to the channel ID.");
    let len = buf.lines.len();
    if from >= len {
        return Vec::new();
    }

    let end = to.min(len);
    buf.lines[from..end].to_vec()
}

#[tauri::command]
pub fn get_line_len(state: tauri::State<AppState>, worker_id: String, channel_id: String) -> usize {
    let workers = state.workers.lock().unwrap();

    workers
        .get(&worker_id)
        .map(|w| {
            let buf = w
                .channel_store
                .channels
                .get(&channel_id)
                .expect("here is no buffer corresponding to the channel ID.");
            let lines = &buf.lines;
            match lines.last() {
                Some(last) if last.is_empty() => lines.len().saturating_sub(1),
                _ => lines.len(),
            }
        })
        .unwrap_or(0)
}
