use std::collections::HashMap;
use std::sync::Mutex;

use crate::execution_io::{ExecutionIo, Operation};
use crate::parser::dom::DomStore;
use crate::stream::channel::ChannelStore;
use serde::{Deserialize, Serialize};

pub struct ExecutionContext {
    pub dom_store: DomStore,
    pub channel_store: ChannelStore,
    pub io: ExecutionIo,
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

impl AppState {
    fn init_execution(&self, execution_id: String) -> Result<(), String> {
        let mut executions = self.executions.lock().unwrap();
        if executions.contains_key(&execution_id) {
            return Err("Execution already initialized".into());
        }
        executions.insert(
            execution_id,
            ExecutionContext {
                dom_store: DomStore::new(),
                channel_store: ChannelStore::new(),
                io: ExecutionIo::new(),
            },
        );
        Ok(())
    }

    pub fn register_io(&self, execution_id: &str) -> Result<Operation, String> {
        let executions = self.executions.lock().unwrap();
        let execution = executions.get(execution_id).ok_or("Execution not found")?;
        execution.io.register()
    }

    async fn stop_io(&self, execution_id: &str) -> Result<(), String> {
        let io = self
            .executions
            .lock()
            .unwrap()
            .get(execution_id)
            .map(|e| e.io.clone());
        if let Some(io) = io {
            io.stop().await?;
        }
        Ok(())
    }

    async fn dispose_execution(&self, execution_id: &str) -> Result<(), String> {
        self.stop_io(execution_id).await?;
        self.executions.lock().unwrap().remove(execution_id);
        Ok(())
    }
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
pub fn worker_init(state: tauri::State<AppState>, execution_id: String) -> Result<(), String> {
    state.init_execution(execution_id)
}

#[tauri::command]
pub async fn worker_stop(
    state: tauri::State<'_, AppState>,
    execution_id: String,
) -> Result<(), String> {
    state.stop_io(&execution_id).await
}

#[tauri::command]
pub async fn worker_dispose(
    state: tauri::State<'_, AppState>,
    execution_id: String,
) -> Result<(), String> {
    state.dispose_execution(&execution_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn state() -> Arc<AppState> {
        Arc::new(AppState {
            executions: Mutex::new(HashMap::new()),
            recovery_snapshot: Mutex::new(None),
        })
    }

    #[tokio::test]
    async fn stopped_execution_keeps_output_but_rejects_new_io_and_reinitialization() {
        let state = state();
        state.init_execution("run".into()).unwrap();
        state
            .executions
            .lock()
            .unwrap()
            .get_mut("run")
            .unwrap()
            .channel_store
            .add_channel("output".into())
            .unwrap();
        state.stop_io("run").await.unwrap();
        assert!(state.executions.lock().unwrap().contains_key("run"));
        assert!(state.register_io("run").is_err());
        assert!(state.init_execution("run".into()).is_err());
        state.dispose_execution("run").await.unwrap();
        state.dispose_execution("run").await.unwrap();
        assert!(state.register_io("run").is_err());
        assert!(state.executions.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn dispose_waits_for_native_release_before_removing_context() {
        let state = state();
        state.init_execution("run".into()).unwrap();
        let mut operation = state.register_io("run").unwrap();
        let task = tokio::spawn({
            let state = state.clone();
            async move { state.dispose_execution("run").await }
        });
        operation.cancelled().await;
        assert!(state.executions.lock().unwrap().contains_key("run"));
        assert!(!task.is_finished());
        drop(operation);
        task.await.unwrap().unwrap();
        assert!(state.executions.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn failed_cleanup_keeps_context_and_reports_failure() {
        let state = state();
        state.init_execution("run".into()).unwrap();
        let operation = state.register_io("run").unwrap();
        operation.cleanup_failed("Cannot confirm process termination".into());
        drop(operation);
        assert!(state.dispose_execution("run").await.is_err());
        assert!(state.executions.lock().unwrap().contains_key("run"));
        assert!(state.register_io("run").is_err());
    }
}
