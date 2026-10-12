use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::execution_io::{ExecutionIo, Operation, RegisterError};
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
    // Access the shutdown gate while holding executions, like init/registration.
    pub shutdown_started: AtomicBool,
    pub unscoped_io: ExecutionIo,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
            recovery_snapshot: Mutex::new(None),
            shutdown_started: AtomicBool::new(false),
            unscoped_io: ExecutionIo::for_unscoped_io(),
        }
    }
}

impl AppState {
    fn init_execution(&self, execution_id: String) -> Result<(), String> {
        let mut executions = self.executions.lock().unwrap();
        if self.shutdown_started.load(Ordering::Relaxed) {
            return Err(RegisterError::ApplicationShuttingDown.into());
        }
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

    pub fn register_io(&self, execution_id: &str) -> Result<Operation, RegisterError> {
        self.register_native_io(Some(execution_id))
    }

    pub fn register_native_io(
        &self,
        execution_id: Option<&str>,
    ) -> Result<Operation, RegisterError> {
        let executions = self.executions.lock().unwrap();
        if self.shutdown_started.load(Ordering::Relaxed) {
            return Err(RegisterError::ApplicationShuttingDown);
        }
        let Some(execution_id) = execution_id else {
            return self.unscoped_io.register();
        };
        let execution = executions
            .get(execution_id)
            .ok_or(RegisterError::ExecutionNotFound)?;
        execution.io.register()
    }

    pub(crate) async fn shutdown_native_io(&self) -> Result<(), String> {
        let scopes = {
            let executions = self.executions.lock().unwrap();
            self.shutdown_started.store(true, Ordering::Relaxed);
            let mut scopes = vec![("editor I/O".to_owned(), self.unscoped_io.clone())];
            scopes.extend(
                executions
                    .iter()
                    .map(|(id, context)| (id.clone(), context.io.clone())),
            );
            // Notify EVERY scope before waiting for any one. Keep output/recovery state.
            for (_, io) in &scopes {
                io.request_stop();
            }
            scopes
        };
        let mut failures = Vec::new();
        for (id, io) in scopes {
            if let Err(error) = io.stop().await {
                failures.push(format!("{id}: {error}"));
            }
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(failures.join("; "))
        }
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

#[tauri::command]
pub async fn shutdown_native_io(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.shutdown_native_io().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn state() -> Arc<AppState> {
        Arc::new(AppState {
            executions: Mutex::new(HashMap::new()),
            recovery_snapshot: Mutex::new(None),
            ..AppState::default()
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

    #[tokio::test]
    async fn saturated_execution_can_be_disposed_and_keeps_context_until_release() {
        let state = state();
        state.init_execution("run".into()).unwrap();
        let mut operations = (0..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| state.register_io("run").unwrap())
            .collect::<Vec<_>>();
        assert!(matches!(
            state.register_io("run"),
            Err(RegisterError::ConcurrencyLimitExceeded { .. })
        ));
        let task = tokio::spawn({
            let state = state.clone();
            async move { state.dispose_execution("run").await }
        });
        operations[0].cancelled().await;
        assert!(!task.is_finished());
        assert!(state.executions.lock().unwrap().contains_key("run"));
        assert_eq!(
            state.register_io("run").err().unwrap(),
            RegisterError::Stopped
        );
        // No lock is held across the disposal wait; another execution can start normally.
        state.init_execution("another".into()).unwrap();
        drop(state.register_io("another").unwrap());
        drop(operations);
        tokio::time::timeout(std::time::Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(
            state.register_io("run").err().unwrap(),
            RegisterError::ExecutionNotFound
        );
        state.dispose_execution("another").await.unwrap();
    }

    #[tokio::test]
    async fn shutdown_cancels_every_execution_and_editor_scope_before_waiting() {
        let state = state();
        state.init_execution("first".into()).unwrap();
        state.init_execution("second".into()).unwrap();
        let mut first = state.register_io("first").unwrap();
        let mut second = state.register_io("second").unwrap();
        let mut editor = state.register_native_io(None).unwrap();
        let shutdown = tokio::spawn({
            let state = state.clone();
            async move { state.shutdown_native_io().await }
        });
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            editor.cancelled().await;
            first.cancelled().await;
            second.cancelled().await;
        })
        .await
        .unwrap();
        assert!(!shutdown.is_finished());
        assert!(state
            .init_execution("late".into())
            .unwrap_err()
            .contains("shutting down"));
        for id in [None, Some("first"), Some("unknown")] {
            assert_eq!(
                state.register_native_io(id).err().unwrap(),
                RegisterError::ApplicationShuttingDown
            );
        }
        drop(editor);
        drop(first);
        assert!(!shutdown.is_finished());
        drop(second);
        tokio::time::timeout(std::time::Duration::from_secs(5), shutdown)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(state.executions.lock().unwrap().len(), 2); // Preserve output until disposal.
        state.shutdown_native_io().await.unwrap();
        state.dispose_execution("first").await.unwrap();
        state.dispose_execution("second").await.unwrap();
        assert!(state.init_execution("late".into()).is_err());
    }

    #[tokio::test]
    async fn shutdown_failure_waits_for_other_scopes_and_preserves_recovery_and_failures() {
        let state = state();
        state.init_execution("failed".into()).unwrap();
        state.init_execution("healthy".into()).unwrap();
        *state.recovery_snapshot.lock().unwrap() = Some(RecoverySnapshot {
            reason: "test".into(),
            workspace_json: "saved workspace".into(),
            handle_path: None,
            saved_snapshot_json: None,
            started_at: 1.0,
        });
        let editor = state.register_native_io(None).unwrap();
        editor.cleanup_failed("editor failure".into());
        drop(editor);
        let failed = state.register_io("failed").unwrap();
        failed.cleanup_failed("child kill failed".into());
        drop(failed);
        let mut healthy = state.register_io("healthy").unwrap();
        let shutdown = tokio::spawn({
            let state = state.clone();
            async move { state.shutdown_native_io().await }
        });
        healthy.cancelled().await;
        assert!(!shutdown.is_finished()); // Even though the editor scope failed first.
        drop(healthy);
        let error = shutdown.await.unwrap().unwrap_err();
        assert!(error.contains("editor I/O: editor failure"), "{error}");
        assert!(error.contains("failed: child kill failed"), "{error}");
        assert_eq!(
            state
                .recovery_snapshot
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .workspace_json,
            "saved workspace"
        );
        assert!(state.executions.lock().unwrap().contains_key("failed"));
        assert_eq!(
            state
                .shutdown_native_io()
                .await
                .unwrap_err()
                .split("; ")
                .count(),
            2
        );
    }

    #[tokio::test]
    async fn concurrent_shutdown_callers_wait_without_reopening_admission() {
        let state = state();
        let mut operation = state.register_native_io(None).unwrap();
        let first = tokio::spawn({
            let state = state.clone();
            async move { state.shutdown_native_io().await }
        });
        operation.cancelled().await;
        let second = tokio::spawn({
            let state = state.clone();
            async move { state.shutdown_native_io().await }
        });
        assert!(!first.is_finished());
        assert!(!second.is_finished());
        drop(operation);
        first.await.unwrap().unwrap();
        second.await.unwrap().unwrap();
        assert!(state.register_native_io(None).is_err());
    }

    #[tokio::test]
    async fn aborted_shutdown_caller_leaves_admission_closed_and_can_be_waited_again() {
        let state = state();
        let mut operation = state.register_native_io(None).unwrap();
        let caller = tokio::spawn({
            let state = state.clone();
            async move { state.shutdown_native_io().await }
        });
        operation.cancelled().await;
        caller.abort();
        assert!(caller.await.unwrap_err().is_cancelled());
        assert!(state.register_native_io(None).is_err());
        assert!(state.init_execution("late".into()).is_err());
        drop(operation);
        state.shutdown_native_io().await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_late_initializations_cannot_escape_the_shutdown_snapshot() {
        let state = state();
        let start = Arc::new(std::sync::Barrier::new(17));
        let threads = (0..16)
            .map(|index| {
                let state = state.clone();
                let start = start.clone();
                std::thread::spawn(move || {
                    start.wait();
                    state.init_execution(format!("race-{index}"))
                })
            })
            .collect::<Vec<_>>();
        start.wait();
        state.shutdown_native_io().await.unwrap();
        for thread in threads {
            let _ = thread.join().unwrap();
        }
        assert!(state
            .executions
            .lock()
            .unwrap()
            .values()
            .all(|e| e.io.register().is_err()));
        assert!(state.init_execution("after".into()).is_err());
    }

    #[tokio::test]
    async fn editor_scope_is_tracked_without_the_work_concurrency_limit() {
        let state = state();
        let operations = (0..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS + 1)
            .map(|_| state.register_native_io(None).unwrap())
            .collect::<Vec<_>>();
        drop(operations);
        state.shutdown_native_io().await.unwrap();
    }
}
