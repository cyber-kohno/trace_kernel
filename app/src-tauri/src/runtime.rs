use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser::dom::{DomStore};
use crate::stream::channel::{ChannelStore};

pub struct WorkerContext {
    pub dom_store: DomStore,
    pub channel_store: ChannelStore,
    // 今後追加
}

pub struct AppState {
    pub workers: Mutex<HashMap<String, WorkerContext>>,
}

#[tauri::command]
pub fn worker_init(state: tauri::State<AppState>, worker_id: String) {
    let mut workers = state.workers.lock().unwrap();
    workers.insert(
        worker_id,
        WorkerContext {
            dom_store: DomStore::new(),
            channel_store: ChannelStore::new(),
        },
    );
}

#[tauri::command]
pub fn worker_dispose(state: tauri::State<AppState>, worker_id: String) {
    let mut workers = state.workers.lock().unwrap();
    workers.remove(&worker_id);
    // → WorkerContext が drop
}
