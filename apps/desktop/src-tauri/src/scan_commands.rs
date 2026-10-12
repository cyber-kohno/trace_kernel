use crate::blocking_io;
use crate::runtime::AppState;
use crate::scan::{self, Progress, ScanRequest, ScanResponse};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress<'a> {
    scan_id: &'a str,
    #[serde(flatten)]
    progress: &'a Progress,
}

async fn run(
    state: &AppState,
    execution_id: Option<String>,
    req: ScanRequest,
    mut report: impl FnMut(&Progress) + Send + 'static,
) -> Result<ScanResponse, String> {
    let operation = execution_id.map(|id| state.register_io(&id)).transpose()?;
    blocking_io::run_checked(operation, move |check| {
        scan::scan_directory(req, &mut report, check)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    use crate::parser::dom::DomStore;
    use crate::runtime::ExecutionContext;
    use crate::stream::channel::ChannelStore;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use tokio::sync::oneshot;

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir()
                .join(format!("trace-kernel-owned-scan-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn req(&self) -> ScanRequest {
            serde_json::from_value(
                serde_json::json!({ "rootPath": self.0, "dirConds": [], "fileConds": [] }),
            )
            .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir(&self.0);
        }
    }

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
        }
    }

    #[test]
    fn progress_payload_has_scan_id_and_preserves_existing_fields() {
        let progress = Progress {
            path: "C:\\data".into(),
            name: "data".into(),
            depth: 0,
            counter: 1,
        };
        assert_eq!(
            serde_json::to_value(ScanProgress {
                scan_id: "scan-1",
                progress: &progress
            })
            .unwrap(),
            serde_json::json!({ "scanId": "scan-1", "path": "C:\\data", "name": "data", "depth": 0, "counter": 1 })
        );
    }

    #[tokio::test]
    async fn unknown_and_stopped_executions_cannot_start_a_scan() {
        let f = Fixture::new();
        let io = ExecutionIo::new();
        let state = state(&io);
        let missing = run(&state, Some("missing".into()), f.req(), |_| {
            panic!("missing execution")
        })
        .await;
        assert!(missing.unwrap_err().contains("Execution not found"));
        io.stop().await.unwrap();
        let stopped = run(&state, Some("work".into()), f.req(), |_| {
            panic!("stopped execution")
        })
        .await;
        assert!(stopped.unwrap_err().contains("stopped"));
    }

    #[tokio::test]
    async fn editor_and_owned_scans_return_the_same_result() {
        let f = Fixture::new();
        let io = ExecutionIo::new();
        let state = state(&io);
        let editor = run(&state, None, f.req(), |_| {}).await.unwrap();
        let owned = run(&state, Some("work".into()), f.req(), |_| {})
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(editor).unwrap(),
            serde_json::to_value(owned).unwrap()
        );
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn stopping_a_started_scan_waits_for_the_blocking_task_to_exit() {
        let f = Fixture::new();
        let io = ExecutionIo::new();
        let state = Arc::new(state(&io));
        let mut observer = io.register().unwrap();
        let (started, ready) = oneshot::channel();
        let (release, gate) = std::sync::mpsc::channel();
        let req = f.req();
        let scan = tokio::spawn({
            let state = state.clone();
            async move {
                let mut started = Some(started);
                run(&state, Some("work".into()), req, move |_| {
                    if let Some(started) = started.take() {
                        started.send(()).unwrap();
                        gate.recv().unwrap();
                    }
                })
                .await
            }
        });
        ready.await.unwrap();
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        observer.cancelled().await;
        drop(observer);
        let stopped_early = stop.is_finished();
        release.send(()).unwrap();
        assert!(scan.await.unwrap().unwrap_err().contains("cancelled"));
        stop.await.unwrap().unwrap();
        assert!(!stopped_early);
    }
}

#[tauri::command]
pub async fn scan_directory(
    app: AppHandle,
    state: State<'_, AppState>,
    req: ScanRequest,
    execution_id: Option<String>,
    scan_id: Option<String>,
) -> Result<ScanResponse, String> {
    run(&state, execution_id, req, move |progress| {
        if let Some(scan_id) = &scan_id {
            // Progress is advisory. A missing view must not fail the scan.
            let _ = app.emit("progress", ScanProgress { scan_id, progress });
        }
    })
    .await
}
