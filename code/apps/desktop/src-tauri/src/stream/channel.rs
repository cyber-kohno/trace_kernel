use crate::runtime::AppState;
use tauri::State;
pub use trace_kernel_native_core::stream::channel::ChannelStore;
#[tauri::command]
pub fn add_channel(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
) -> Result<(), String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.channel_store.add_channel(channel_id)
    })
}
#[tauri::command]
pub fn append_lines(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
    batches: Vec<Vec<String>>,
) -> Result<(), String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.channel_store.append_lines(&channel_id, batches)
    })
}
#[tauri::command]
pub fn get_range_lines(
    state: State<AppState>,
    execution_id: String,
    channel_id: String,
    from: usize,
    to: usize,
) -> Vec<String> {
    state
        .executions
        .lock()
        .unwrap()
        .get(&execution_id)
        .map(|e| e.channel_store.range_lines(&channel_id, from, to))
        .unwrap_or_default()
}
#[tauri::command]
pub fn get_line_len(state: State<AppState>, execution_id: String, channel_id: String) -> usize {
    state
        .executions
        .lock()
        .unwrap()
        .get(&execution_id)
        .map(|e| e.channel_store.line_len(&channel_id))
        .unwrap_or(0)
}
