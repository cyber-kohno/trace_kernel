use crate::blocking_io;
use crate::parser::excel::{self, Book};
use crate::runtime::AppState;
use tauri::State;

async fn run<F>(state: &AppState, execution_id: Option<String>, task: F) -> Result<Book, String>
where
    F: FnOnce(&dyn Fn() -> Result<(), String>) -> Result<Book, String> + Send + 'static,
{
    let operation = state.register_native_io(execution_id.as_deref())?;
    blocking_io::run_checked(Some(operation), task).await
}

#[tauri::command]
pub async fn excel_parse_file(
    state: State<'_, AppState>,
    execution_id: Option<String>,
    file_path: String,
) -> Result<Book, String> {
    run(&state, execution_id, move |check| {
        excel::parse_file(&file_path, check)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    use crate::parser::dom::DomStore;
    use crate::parser::excel::test_support::{sample, xlsx, Fixture, DATA};
    use crate::runtime::ExecutionContext;
    use crate::stream::channel::ChannelStore;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tokio::sync::oneshot;

    fn state(io: &ExecutionIo) -> AppState {
        AppState {
            executions: Mutex::new(HashMap::from([(
                "work".into(),
                ExecutionContext {
                    dom_store: DomStore::new(),
                    channel_store: ChannelStore::new(),
                    io: io.clone(),
                },
            )])),
            recovery_snapshot: Mutex::new(None),
            ..AppState::default()
        }
    }

    #[tokio::test]
    async fn unknown_and_stopped_executions_cannot_start_excel_io() {
        let io = ExecutionIo::new();
        let state = state(&io);
        let missing = run(&state, Some("missing".into()), |_| {
            panic!("missing execution must not run")
        })
        .await;
        assert!(missing.unwrap_err().contains("Execution not found"));
        io.stop().await.unwrap();
        let stopped = run(&state, Some("work".into()), |_| {
            panic!("stopped execution must not run")
        })
        .await;
        assert!(stopped.unwrap_err().contains("stopped"));
    }

    #[tokio::test]
    async fn saturated_execution_rejects_before_excel_io_and_leaves_editor_reads_available() {
        let io = ExecutionIo::new();
        let state = state(&io);
        let held = (0..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
        let error = run(&state, Some("work".into()), |_| {
            panic!("overload must not parse Excel")
        })
        .await
        .unwrap_err();
        assert!(error.contains("concurrency limit exceeded (32)"), "{error}");
        let f = Fixture::new(&sample());
        let path = f.path();
        assert_eq!(
            run(&state, None, move |check| excel::parse_file(&path, check))
                .await
                .unwrap()
                .sheets
                .len(),
            1
        );
        drop(held);
        let path = f.path();
        assert_eq!(
            run(&state, Some("work".into()), move |check| excel::parse_file(
                &path, check
            ))
            .await
            .unwrap()
            .sheets
            .len(),
            1
        );
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn application_shutdown_rejects_editor_excel_before_parse() {
        let state = state(&ExecutionIo::new());
        state.shutdown_native_io().await.unwrap();
        let error = run(&state, None, |_| {
            panic!("closed application must not parse")
        })
        .await
        .unwrap_err();
        assert!(error.contains("shutting down"));
    }

    #[tokio::test]
    async fn unscoped_and_owned_excel_reads_preserve_the_public_result() {
        let f = Fixture::new(&sample());
        let io = ExecutionIo::new();
        let state = state(&io);
        let path = f.path();
        let owned = run(&state, Some("work".into()), move |check| {
            excel::parse_file(&path, check)
        })
        .await
        .unwrap();
        io.stop().await.unwrap();
        let path = f.path();
        let unscoped = run(&state, None, move |check| excel::parse_file(&path, check))
            .await
            .unwrap();
        let owned = serde_json::to_value(owned).unwrap();
        assert_eq!(owned, serde_json::to_value(unscoped).unwrap());
        assert_eq!(owned["sheets"][0]["maxRow"], 3);
        assert_eq!(owned["sheets"][0]["maxCol"], 2);
    }

    #[tokio::test]
    async fn native_excel_errors_are_rejected_without_retaining_an_operation() {
        let io = ExecutionIo::new();
        let state = state(&io);
        for (buffer, message) in [
            (b"invalid excel".to_vec(), "failed to open excel"),
            (
                xlsx(&[("Data", DATA), ("Broken", "<worksheet><sheetData>")]),
                "failed to read excel sheet \"Broken\"",
            ),
        ] {
            let f = Fixture::new(&buffer);
            let path = f.path();
            let error = run(&state, Some("work".into()), move |check| {
                excel::parse_file(&path, check)
            })
            .await
            .unwrap_err();
            assert!(error.contains(message), "{error}");
        }
        let f = Fixture::new(&sample());
        let missing = format!("{}.missing", f.path());
        let error = run(&state, Some("work".into()), move |check| {
            excel::parse_file(&missing, check)
        })
        .await
        .unwrap_err();
        assert!(error.contains("failed to read excel file"));
        tokio::time::timeout(Duration::from_secs(5), io.stop())
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn excel_range_limit_error_releases_owned_io_without_a_partial_book() {
        let io = ExecutionIo::new();
        let state = state(&io);
        let huge = r#"<worksheet><sheetData><row><c r="A1"><v>1</v></c></row><row><c r="XFD1048576"><v>2</v></c></row></sheetData></worksheet>"#;
        let f = Fixture::new(&xlsx(&[("Data", DATA), ("Huge", huge)]));
        let path = f.path();
        let error = run(&state, Some("work".into()), move |check| {
            excel::parse_file(&path, check)
        })
        .await
        .unwrap_err();
        assert!(error.contains("range cell limit"), "{error}");
        tokio::time::timeout(Duration::from_secs(5), io.stop())
            .await
            .unwrap()
            .unwrap();
    }

    async fn stop_during_excel_read(drop_caller: bool) {
        let f = Fixture::new(&sample());
        let path = f.path();
        let io = ExecutionIo::new();
        let state = Arc::new(state(&io));
        let mut observer = io.register().unwrap();
        let (started, ready) = oneshot::channel();
        let (release, gate) = std::sync::mpsc::channel();
        let caller = tokio::spawn({
            let state = state.clone();
            async move {
                run(&state, Some("work".into()), move |check| {
                    let started = Mutex::new(Some(started));
                    let checkpoints = std::cell::Cell::new(0);
                    excel::parse_file(&path, &|| {
                        check()?;
                        checkpoints.set(checkpoints.get() + 1);
                        // Gate immediately after the first bounded OS read returns.
                        if checkpoints.get() == 3 {
                            started.lock().unwrap().take().unwrap().send(()).unwrap();
                            gate.recv_timeout(Duration::from_secs(5)).unwrap();
                        }
                        check()
                    })
                })
                .await
            }
        });
        tokio::time::timeout(Duration::from_secs(5), ready)
            .await
            .unwrap()
            .unwrap();
        if drop_caller {
            caller.abort();
        }
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        observer.cancelled().await;
        drop(observer);
        // Registration only holds the State lock briefly, even while Excel is blocked.
        assert!(state
            .register_io("work")
            .err()
            .unwrap()
            .to_string()
            .contains("stopped"));
        let stopped_early = stop.is_finished();
        release.send(()).unwrap();
        let result = caller.await;
        if drop_caller {
            assert!(result.unwrap_err().is_cancelled());
        } else {
            assert!(result.unwrap().unwrap_err().contains("cancelled"));
        }
        tokio::time::timeout(Duration::from_secs(5), stop)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(!stopped_early);
    }

    #[tokio::test]
    async fn stop_waits_for_excel_blocking_task_completion_and_rejects_the_result() {
        stop_during_excel_read(false).await;
    }

    #[tokio::test]
    async fn dropped_excel_ipc_caller_does_not_release_the_blocking_operation() {
        stop_during_excel_read(true).await;
    }
}
