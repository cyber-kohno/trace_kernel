use crate::blocking_io;
use crate::file_system::{self as fs, DirBelong, FileRequest, FileStatDto, TailFileRequest};
use crate::runtime::AppState;
use serde_bytes::ByteBuf;
use tauri::State;

async fn run<T, F>(state: &AppState, execution_id: Option<String>, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let operation = execution_id.map(|id| state.register_io(&id)).transpose()?;
    blocking_io::run(operation, task).await
}

#[tauri::command]
pub async fn exists_path(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
) -> Result<bool, String> {
    run(&state, execution_id, move || fs::exists_path(path)).await
}

#[tauri::command]
pub async fn glob_path(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    pattern: String,
) -> Result<Vec<String>, String> {
    run(&state, execution_id, move || fs::glob_path(pattern)).await
}

#[tauri::command]
pub async fn read_binary(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    file_path: String,
) -> Result<ByteBuf, String> {
    run(&state, execution_id, move || fs::read_binary(file_path)).await
}

#[tauri::command]
pub async fn read_file(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    req: FileRequest,
) -> Result<String, String> {
    run(&state, execution_id, move || fs::read_file(req)).await
}

#[tauri::command]
pub async fn read_tail_file(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    req: TailFileRequest,
) -> Result<String, String> {
    run(&state, execution_id, move || fs::read_tail_file(req)).await
}

#[tauri::command]
pub async fn read_dir(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    dir: String,
) -> Result<Vec<DirBelong>, String> {
    run(&state, execution_id, move || fs::read_dir(dir)).await
}

#[tauri::command]
pub async fn stat(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
) -> Result<FileStatDto, String> {
    run(&state, execution_id, move || fs::stat(path)).await
}

#[tauri::command]
pub async fn save_text(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
    content: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::save_text(path, content)).await
}

#[tauri::command]
pub async fn save_binary(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::save_binary(path, bytes)).await
}

#[tauri::command]
pub async fn rename(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    from: String,
    to: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::rename(from, to)).await
}

#[tauri::command]
pub async fn copy_file(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    src: String,
    dest: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::copy_file(src, dest)).await
}

#[tauri::command]
pub async fn make_dir(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    dir_path: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::make_dir(dir_path)).await
}

#[tauri::command]
pub async fn delete_file(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::delete_file(path)).await
}

#[tauri::command]
pub async fn delete_dir(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::delete_dir(path)).await
}

#[tauri::command]
pub async fn delete_dir_all(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    path: String,
) -> Result<(), String> {
    run(&state, execution_id, move || fs::delete_dir_all(path)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };

    fn state() -> AppState {
        AppState {
            executions: Mutex::new(HashMap::new()),
            recovery_snapshot: Mutex::new(None),
        }
    }

    #[tokio::test]
    async fn unknown_execution_cannot_fall_back_to_unscoped_file_io() {
        let executed = Arc::new(AtomicBool::new(false));
        let result = run(&state(), Some("unknown".into()), {
            let executed = executed.clone();
            move || {
                executed.store(true, Ordering::SeqCst);
                Ok(())
            }
        })
        .await;
        assert!(result.is_err());
        assert!(!executed.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn editor_calls_without_an_execution_keep_working_and_reject_io_errors() {
        assert_eq!(run(&state(), None, || Ok(42)).await.unwrap(), 42);
        assert!(
            run(&state(), None, || fs::read_binary("invalid\0path".into()))
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn stopped_execution_rejects_file_io_but_does_not_disable_editor_io() {
        use crate::execution_io::ExecutionIo;
        use crate::parser::dom::DomStore;
        use crate::runtime::ExecutionContext;
        use crate::stream::channel::ChannelStore;
        let state = state();
        let io = ExecutionIo::new();
        state.executions.lock().unwrap().insert(
            "work".into(),
            ExecutionContext {
                dom_store: DomStore::new(),
                channel_store: ChannelStore::new(),
                io: io.clone(),
            },
        );
        assert_eq!(
            run(&state, Some("work".into()), || Ok(42)).await.unwrap(),
            42
        );
        io.stop().await.unwrap();
        let result = run(&state, Some("work".into()), || -> Result<(), String> {
            panic!("stopped execution must not start a file operation");
        })
        .await;
        assert!(result.unwrap_err().contains("stopped"));
        assert_eq!(run(&state, None, || Ok(7)).await.unwrap(), 7);
    }
}
