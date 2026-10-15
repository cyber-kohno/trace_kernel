use crate::execution_io::Operation;
use std::panic::{catch_unwind, AssertUnwindSafe};

pub async fn run<T, F>(operation: Option<Operation>, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    run_checked(operation, move |_| task()).await
}

pub async fn run_checked<T, F>(operation: Option<Operation>, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&dyn Fn() -> Result<(), String>) -> Result<T, String> + Send + 'static,
{
    // The guard belongs to the blocking task, not the caller's cancellable future.
    tokio::task::spawn_blocking(move || {
        let check = || {
            if operation.as_ref().is_some_and(Operation::is_cancelled) {
                Err("File I/O cancelled".to_string())
            } else {
                Ok(())
            }
        };
        check()?;
        let result = catch_unwind(AssertUnwindSafe(|| task(&check))).unwrap_or_else(|_| {
            let message = "Blocking file I/O panicked; effects may be incomplete".to_string();
            if let Some(operation) = &operation {
                operation.cleanup_failed(message.clone());
            }
            Err(message)
        });
        check()?;
        result
    })
    .await
    .map_err(|e| format!("Blocking file I/O task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn unscoped_editor_io_returns_success_and_errors_without_an_execution() {
        assert_eq!(run(None, || Ok(42)).await.unwrap(), 42);
        assert_eq!(
            run::<(), _>(None, || Err("read failed".into()))
                .await
                .unwrap_err(),
            "read failed"
        );
    }

    #[tokio::test]
    async fn cancellation_observed_before_start_skips_the_file_operation() {
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let mut observer = io.register().unwrap();
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        observer.cancelled().await;
        drop(observer);
        let executed = Arc::new(AtomicBool::new(false));
        let result = run(Some(operation), {
            let executed = executed.clone();
            move || {
                executed.store(true, Ordering::SeqCst);
                Ok(())
            }
        })
        .await;
        assert!(result.unwrap_err().contains("cancelled"));
        stop.await.unwrap().unwrap();
        assert!(!executed.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn stop_waits_for_real_completion_even_when_the_caller_is_dropped() {
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let mut observer = io.register().unwrap();
        let held = (2..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
        let (started, ready) = oneshot::channel();
        let (release, gate) = std::sync::mpsc::channel();
        let completed = Arc::new(AtomicBool::new(false));
        struct Output(std::path::PathBuf);
        impl Drop for Output {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.0);
            }
        }
        let output = Output(
            std::env::temp_dir().join(format!("trace-kernel-owned-file-{}", uuid::Uuid::new_v4())),
        );
        let caller = tokio::spawn(run(Some(operation), {
            let completed = completed.clone();
            let path = output.0.clone();
            move || {
                started.send(()).unwrap();
                gate.recv().unwrap();
                crate::file_system::save_text(
                    path.to_string_lossy().into_owned(),
                    "complete".into(),
                )?;
                completed.store(true, Ordering::SeqCst);
                Ok(())
            }
        }));
        ready.await.unwrap();
        caller.abort();
        assert!(caller.await.unwrap_err().is_cancelled());
        assert!(matches!(
            io.register(),
            Err(crate::execution_io::RegisterError::ConcurrencyLimitExceeded { .. })
        ));
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        observer.cancelled().await;
        drop(observer);
        drop(held);
        let stopped_early = stop.is_finished();
        release.send(()).unwrap();
        stop.await.unwrap().unwrap();
        assert!(!stopped_early);
        assert!(completed.load(Ordering::SeqCst));
        assert_eq!(std::fs::read(&output.0).unwrap(), b"complete");
        assert!(io.register().is_err());
    }

    #[test]
    fn queued_operations_are_skipped_after_stop_and_remain_owned_until_dequeued() {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .max_blocking_threads(1)
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let (started, ready) = oneshot::channel();
            let (release, gate) = std::sync::mpsc::channel();
            let blocker = tokio::task::spawn_blocking(move || {
                started.send(()).unwrap();
                gate.recv().unwrap();
            });
            ready.await.unwrap();
            let io = ExecutionIo::new();
            let operation = io.register().unwrap();
            let mut observer = io.register().unwrap();
            let held = (2..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
                .map(|_| io.register().unwrap())
                .collect::<Vec<_>>();
            let executed = Arc::new(AtomicBool::new(false));
            let request = run(Some(operation), {
                let executed = executed.clone();
                move || {
                    executed.store(true, Ordering::SeqCst);
                    Ok(())
                }
            });
            tokio::pin!(request);
            tokio::select! {
                biased;
                _ = &mut request => panic!("blocking pool is occupied"),
                _ = tokio::task::yield_now() => {}
            }
            assert!(matches!(
                io.register(),
                Err(crate::execution_io::RegisterError::ConcurrencyLimitExceeded { .. })
            ));
            let stop = tokio::spawn({
                let io = io.clone();
                async move { io.stop().await }
            });
            observer.cancelled().await;
            drop(observer);
            drop(held);
            let stopped_early = stop.is_finished();
            release.send(()).unwrap();
            assert!(request.await.unwrap_err().contains("cancelled"));
            blocker.await.unwrap();
            stop.await.unwrap().unwrap();
            assert!(!stopped_early);
            assert!(!executed.load(Ordering::SeqCst));
        });
    }

    #[tokio::test]
    async fn panicked_operations_keep_cleanup_failed_instead_of_claiming_safety() {
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let result = run::<(), _>(Some(operation), || panic!("fixture panic")).await;
        assert!(result.unwrap_err().contains("panicked"));
        assert!(io
            .stop()
            .await
            .unwrap_err()
            .contains("effects may be incomplete"));
    }
}
