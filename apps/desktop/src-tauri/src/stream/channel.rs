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
pub fn add_channel(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
) -> Result<(), String> {
    let mut executions = state.executions.lock().unwrap();

    let execution = executions
        .get_mut(&execution_id)
        .ok_or("execution not found")?;
    execution.channel_store.add_channel(channel_id)
}

#[tauri::command]
pub fn append_lines(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
    batches: Vec<Vec<String>>,
) -> Result<(), String> {
    let mut executions = state.executions.lock().unwrap();

    let execution = executions
        .get_mut(&execution_id)
        .ok_or("execution not found")?;
    execution.channel_store.append_lines(&channel_id, batches)
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

#[cfg(test)]
mod tests {
    use super::ChannelStore;

    #[test]
    fn duplicate_channel_is_an_error() {
        let mut store = ChannelStore::new();
        store.add_channel("output".into()).unwrap();
        assert!(store.add_channel("output".into()).is_err());
    }

    #[test]
    fn missing_channel_append_is_an_error_without_creating_channel() {
        let mut store = ChannelStore::new();
        assert!(store
            .append_lines("missing", vec![vec!["line".into()]])
            .is_err());
        assert!(store.channels.is_empty());
    }

    #[test]
    fn batches_are_saved_in_order() {
        let mut store = ChannelStore::new();
        store.add_channel("output".into()).unwrap();
        store
            .append_lines(
                "output",
                vec![
                    vec!["first".into(), "".into()],
                    vec!["second".into(), "".into()],
                ],
            )
            .unwrap();
        assert_eq!(store.channels["output"].lines, vec!["first", "second", ""]);
    }
}
