use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser::dom::DomStore;
use crate::stream::channel::ChannelStore;
use serde::{Deserialize, Serialize};

pub struct ExecutionContext {
    pub dom_store: DomStore,
    pub channel_store: ChannelStore,
    // 今後追加
}

#[tauri::command]
pub fn set_recovery_snapshot(state: tauri::State<AppState>, snapshot: RecoverySnapshot) {
    let mut recovery_snapshot = state.recovery_snapshot.lock().unwrap();
    *recovery_snapshot = Some(snapshot);
}

#[tauri::command]
pub fn get_recovery_snapshot(state: tauri::State<AppState>) -> Option<RecoverySnapshot> {
    let recovery_snapshot = state.recovery_snapshot.lock().unwrap();
    recovery_snapshot.clone()
}

#[tauri::command]
pub fn clear_recovery_snapshot(state: tauri::State<AppState>) {
    let mut recovery_snapshot = state.recovery_snapshot.lock().unwrap();
    *recovery_snapshot = None;
}

pub struct AppState {
    pub executions: Mutex<HashMap<String, ExecutionContext>>,
    pub recovery_snapshot: Mutex<Option<RecoverySnapshot>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub reason: String,
    pub workspace_json: String,
    pub handle_path: Option<String>,
    #[serde(default)]
    pub saved_snapshot_json: Option<String>,
    pub started_at: f64,
}

#[tauri::command]
pub fn worker_init(state: tauri::State<AppState>, execution_id: String) {
    let mut executions = state.executions.lock().unwrap();
    executions.insert(
        execution_id,
        ExecutionContext {
            dom_store: DomStore::new(),
            channel_store: ChannelStore::new(),
        },
    );
}

#[tauri::command]
pub fn worker_dispose(state: tauri::State<AppState>, execution_id: String) {
    let mut executions = state.executions.lock().unwrap();
    executions.remove(&execution_id);
    // → ExecutionContext が drop
}
