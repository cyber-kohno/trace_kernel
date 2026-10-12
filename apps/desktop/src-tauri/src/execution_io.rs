use std::sync::{Arc, Mutex};
use tokio::sync::watch;

struct State {
    closed: bool,
    active: usize,
    failures: Vec<String>,
}

struct Inner {
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
        Self(Arc::new(Inner {
            state: Mutex::new(State {
                closed: false,
                active: 0,
                failures: Vec::new(),
            }),
            cancelled: watch::channel(false).0,
            active: watch::channel(0).0,
        }))
    }

    pub fn register(&self) -> Result<Operation, String> {
        let mut state = self.0.state.lock().unwrap();
        if state.closed {
            return Err("Execution I/O is stopped".into());
        }
        state.active += 1;
        self.0.active.send_replace(state.active);
        Ok(Operation {
            inner: self.0.clone(),
            cancellation: self.0.cancelled.subscribe(),
        })
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut active = {
            let mut state = self.0.state.lock().unwrap();
            state.closed = true;
            self.0.cancelled.send_replace(true);
            self.0.active.subscribe()
        };
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
}
