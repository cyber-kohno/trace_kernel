use crate::runtime::AppState;
pub use trace_kernel_native_core::process::{RunProcessRequest, RunProcessResult};
#[tauri::command]
pub async fn run_process(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    req: RunProcessRequest,
) -> Result<RunProcessResult, String> {
    run(&state, &execution_id, req).await
}
async fn run(
    state: &AppState,
    execution_id: &str,
    req: RunProcessRequest,
) -> Result<RunProcessResult, String> {
    let operation = state.register_io(execution_id)?;
    trace_kernel_native_core::process::execute(req, operation).await
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    #[tokio::test]
    async fn saturated_process_admission_does_not_spawn_and_reuses_a_released_slot() {
        let state = AppState::default();
        state.executions.lock().unwrap().insert(
            "work".into(),
            crate::runtime::ExecutionContext {
                dom_store: crate::parser::dom::DomStore::new(),
                channel_store: crate::stream::channel::ChannelStore::new(),
                io: ExecutionIo::new(),
            },
        );
        let mut held = (0..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| state.register_io("work").unwrap())
            .collect::<Vec<_>>();
        let request = || RunProcessRequest {
            program: String::new(),
            args: vec![],
            cwd: None,
            stdin: None,
            stdin_encoding: crate::file_system::Encoding::Utf8,
            timeout_ms: 5000,
        };
        assert!(run(&state, "work", request())
            .await
            .unwrap_err()
            .contains("concurrency limit exceeded"));
        drop(held.pop());
        assert_eq!(
            run(&state, "work", request()).await.unwrap_err(),
            "Program not found"
        );
        drop(held);
        state.shutdown_native_io().await.unwrap();
    }
}
