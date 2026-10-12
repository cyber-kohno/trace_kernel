use crate::resource_limits::NATIVE_IO_MAX_OPERATIONS;
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum RegisterError {
    #[error("Execution not found")]
    ExecutionNotFound,
    #[error("Execution I/O is stopped")]
    Stopped,
    #[error("Application native I/O is shutting down")]
    ApplicationShuttingDown,
    #[error("Execution native I/O concurrency limit exceeded ({limit})")]
    ConcurrencyLimitExceeded { limit: usize },
}

// Existing file/process/scan commands expose a String error over IPC.
impl From<RegisterError> for String {
    fn from(error: RegisterError) -> Self {
        error.to_string()
    }
}

struct State {
    closed: bool,
    active: usize,
    failures: Vec<String>,
}

struct Inner {
    limit: usize,
    state: Mutex<State>,
    cancelled: watch::Sender<bool>,
    active: watch::Sender<usize>,
}

#[derive(Clone)]
pub struct ExecutionIo(Arc<Inner>);

pub struct Operation {
    inner: Arc<Inner>,
    cancellation: watch::Receiver<bool>,
}

impl ExecutionIo {
    pub fn new() -> Self {
        Self::with_limit(NATIVE_IO_MAX_OPERATIONS)
    }

    pub fn for_unscoped_io() -> Self {
        // Track editor I/O for shutdown without introducing a per-execution limit.
        Self::with_limit(usize::MAX)
    }

    fn with_limit(limit: usize) -> Self {
        Self(Arc::new(Inner {
            limit,
            state: Mutex::new(State {
                closed: false,
                active: 0,
                failures: Vec::new(),
            }),
            cancelled: watch::channel(false).0,
            active: watch::channel(0).0,
        }))
    }

    pub fn register(&self) -> Result<Operation, RegisterError> {
        let mut state = self.0.state.lock().unwrap();
        if state.closed {
            return Err(RegisterError::Stopped);
        }
        // Check and claim atomically under the same lock as stop/release.
        // Reject overload without allocating a new wait queue or Operation.
        if state.active >= self.0.limit {
            return Err(RegisterError::ConcurrencyLimitExceeded {
                limit: self.0.limit,
            });
        }
        state.active += 1;
        self.0.active.send_replace(state.active);
        Ok(Operation {
            inner: self.0.clone(),
            cancellation: self.0.cancelled.subscribe(),
        })
    }

    pub fn request_stop(&self) {
        let mut state = self.0.state.lock().unwrap();
        state.closed = true;
        self.0.cancelled.send_replace(true);
    }

    pub async fn stop(&self) -> Result<(), String> {
        self.request_stop();
        let mut active = self.0.active.subscribe();
        while *active.borrow_and_update() != 0 {
            active.changed().await.map_err(|e| e.to_string())?;
        }
        let state = self.0.state.lock().unwrap();
        if state.failures.is_empty() {
            Ok(())
        } else {
            Err(state.failures.join("; "))
        }
    }
}

impl Operation {
    pub fn is_cancelled(&self) -> bool {
        *self.cancellation.borrow()
    }

    pub async fn cancelled(&mut self) {
        while !*self.cancellation.borrow_and_update() {
            if self.cancellation.changed().await.is_err() {
                break;
            }
        }
    }

    pub fn cleanup_failed(&self, message: String) {
        self.inner.state.lock().unwrap().failures.push(message);
    }
}

impl Drop for Operation {
    fn drop(&mut self) {
        let mut state = self.inner.state.lock().unwrap();
        state.active -= 1;
        self.inner.active.send_replace(state.active);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stop_cancels_every_operation_and_waits_for_release() {
        let io = ExecutionIo::new();
        let mut first = io.register().unwrap();
        let mut second = io.register().unwrap();
        let stopped = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        first.cancelled().await;
        second.cancelled().await;
        assert!(io.register().is_err());
        assert!(!stopped.is_finished());
        drop(first);
        assert!(!stopped.is_finished());
        drop(second);
        stopped.await.unwrap().unwrap();
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn cancellation_is_retained_for_an_operation_not_yet_polled() {
        let io = ExecutionIo::new();
        let mut operation = io.register().unwrap();
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        tokio::task::yield_now().await;
        operation.cancelled().await;
        assert!(operation.is_cancelled());
        drop(operation);
        stop.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn cleanup_failure_is_not_reported_as_success() {
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        operation.cleanup_failed("kill failed".into());
        drop(operation);
        assert_eq!(io.stop().await.unwrap_err(), "kill failed");
    }

    #[tokio::test]
    async fn stopping_one_execution_does_not_cancel_another() {
        let first = ExecutionIo::new();
        let second = ExecutionIo::new();
        first.stop().await.unwrap();
        assert!(!second.register().unwrap().is_cancelled());
        second.stop().await.unwrap();
    }

    #[tokio::test]
    async fn default_capacity_is_exact_and_released_slots_can_be_reused() {
        let io = ExecutionIo::new();
        let mut operations = (0..NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
        let expected = RegisterError::ConcurrencyLimitExceeded {
            limit: NATIVE_IO_MAX_OPERATIONS,
        };
        for _ in 0..10 {
            assert_eq!(io.register().err().unwrap(), expected);
        }
        assert_eq!(io.0.state.lock().unwrap().active, NATIVE_IO_MAX_OPERATIONS);
        drop(operations.pop());
        operations.push(io.register().unwrap());
        assert_eq!(io.register().err().unwrap(), expected);
        drop(operations);
        for _ in 0..NATIVE_IO_MAX_OPERATIONS * 2 {
            drop(io.register().unwrap()); // Limit concurrent requests, not lifetime request count.
        }
        io.stop().await.unwrap(); // Rejections do not record cleanup failures.
    }

    #[tokio::test]
    async fn zero_capacity_rejects_without_ownership_or_a_wait_queue() {
        let io = ExecutionIo::with_limit(0);
        assert_eq!(
            io.register().err().unwrap(),
            RegisterError::ConcurrencyLimitExceeded { limit: 0 }
        );
        assert_eq!(io.0.state.lock().unwrap().active, 0);
        io.stop().await.unwrap();
        assert_eq!(io.register().err().unwrap(), RegisterError::Stopped);
    }

    #[test]
    fn concurrent_registrations_cannot_oversubscribe_the_shared_capacity() {
        use std::sync::Barrier;
        let io = ExecutionIo::new();
        let count = NATIVE_IO_MAX_OPERATIONS * 2;
        let start = Arc::new(Barrier::new(count + 1));
        let release = Arc::new(Barrier::new(count + 1));
        let (result, results) = std::sync::mpsc::channel();
        std::thread::scope(|scope| {
            for _ in 0..count {
                let io = io.clone();
                let start = start.clone();
                let release = release.clone();
                let result = result.clone();
                scope.spawn(move || {
                    start.wait();
                    let operation = io.register();
                    result
                        .send(operation.as_ref().map(|_| ()).map_err(|e| e.to_string()))
                        .unwrap();
                    release.wait();
                    drop(operation);
                });
            }
            start.wait();
            let results = (0..count)
                .map(|_| results.recv_timeout(std::time::Duration::from_secs(5)))
                .collect::<Result<Vec<_>, _>>();
            // Release all threads before assertions so an assertion failure cannot strand them.
            let active = io.0.state.lock().unwrap().active;
            release.wait();
            let results = results.unwrap();
            assert_eq!(active, NATIVE_IO_MAX_OPERATIONS);
            assert_eq!(
                results.iter().filter(|r| r.is_ok()).count(),
                NATIVE_IO_MAX_OPERATIONS
            );
            assert!(results
                .iter()
                .filter_map(|r| r.as_ref().err())
                .all(|e| e.contains("concurrency limit")));
        });
        assert_eq!(io.0.state.lock().unwrap().active, 0);
    }

    #[tokio::test]
    async fn saturated_execution_stops_without_a_slot_and_waits_for_all_releases() {
        let io = ExecutionIo::new();
        let mut operations = (0..NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
        let first_stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        operations[0].cancelled().await;
        let second_stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        assert!(operations.iter().all(Operation::is_cancelled));
        assert_eq!(io.register().err().unwrap(), RegisterError::Stopped);
        assert!(!first_stop.is_finished());
        assert!(!second_stop.is_finished());
        let last = operations.pop().unwrap();
        drop(operations);
        assert!(!first_stop.is_finished());
        drop(last);
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            first_stop.await.unwrap().unwrap();
            second_stop.await.unwrap().unwrap();
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn capacity_is_per_execution_and_another_execution_is_not_blocked() {
        let first = ExecutionIo::new();
        let second = ExecutionIo::new();
        let operations = (0..NATIVE_IO_MAX_OPERATIONS)
            .map(|_| first.register().unwrap())
            .collect::<Vec<_>>();
        assert!(first.register().is_err());
        let other = second.register().unwrap();
        assert!(!other.is_cancelled());
        drop(operations);
        first.stop().await.unwrap();
        assert!(!other.is_cancelled());
        drop(other);
        second.stop().await.unwrap();
    }
}
