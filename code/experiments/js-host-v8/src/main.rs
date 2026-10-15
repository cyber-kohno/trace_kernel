#[path = "../../js-host-common/native-model.rs"]
mod native_model;

use deno_core::{op2, v8, JsRuntime, OpState, RuntimeOptions};
use deno_error::JsErrorBox;
use native_model::{decode, Host};
use serde_json::{json, Value};
use std::{
    cell::RefCell,
    future::{poll_fn, Future},
    io::{self, Read},
    rc::Rc,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    task::Poll,
    time::{Duration, Instant},
};
use trace_kernel_native_core::{execution_io::ExecutionIo, file_io_dispatch::FileIoRequest};
use trace_kernel_native_core::{
    http,
    parser::{dom::DomStore, dom_dispatch::DomRequest},
    process,
    stream::{channel::ChannelStore, dispatch::ChannelRequest},
};

struct WorkStarted(Arc<AtomicBool>);

#[derive(Clone)]
struct NativeExecution {
    io: ExecutionIo,
    real_files: bool,
    unfinished: Arc<AtomicBool>,
    failed_cleanup: Arc<AtomicBool>,
    scan_started: Arc<AtomicBool>,
    scan_delay: Duration,
    panic_scan: bool,
    call_delay: Duration,
    stop_wakeup: Arc<tokio::sync::Notify>,
}

struct HeapGuard {
    limit: usize,
    reached: Arc<AtomicBool>,
    interrupt_pending: AtomicBool,
    native_io: ExecutionIo,
    stop_wakeup: Arc<tokio::sync::Notify>,
}

impl HeapGuard {
    fn check(&self, isolate: &mut v8::Isolate) {
        let heap = isolate.get_heap_statistics();
        if heap.used_heap_size().saturating_add(heap.external_memory()) > self.limit {
            self.reached.store(true, Ordering::Relaxed);
            self.native_io.request_stop();
            self.stop_wakeup.notify_one();
            isolate.terminate_execution();
        }
    }
}

unsafe extern "C" fn check_heap_interrupt(
    mut raw: v8::UnsafeRawIsolatePtr,
    _data: *mut std::ffi::c_void,
) {
    // V8 calls interrupts on the isolate's own thread. The guard is owned by
    // the isolate slot, so no pointer outlives a queued interrupt or runtime.
    let isolate = unsafe { v8::Isolate::ref_from_raw_isolate_ptr_mut(&mut raw) };
    if let Some(guard) = isolate.get_slot::<Arc<HeapGuard>>().cloned() {
        guard.check(isolate);
        guard.interrupt_pending.store(false, Ordering::Relaxed);
    }
}

#[op2(fast)]
fn op_spike_checkpoint(scope: &mut v8::PinScope, state: &mut OpState) {
    state.borrow::<Arc<HeapGuard>>().check(scope);
}

#[op2(fast)]
fn op_spike_finish_native(scope: &mut v8::PinScope, state: &mut OpState) {
    let native = state.borrow::<NativeExecution>();
    if native.io.has_active_operations() || native.io.has_cleanup_failures() {
        native
            .unfinished
            .store(native.io.has_active_operations(), Ordering::Relaxed);
        native
            .failed_cleanup
            .store(native.io.has_cleanup_failures(), Ordering::Relaxed);
        native.io.request_stop();
        native.stop_wakeup.notify_one();
        scope.terminate_execution();
    }
}

#[op2]
#[string]
async fn op_spike_invoke(
    state: Rc<RefCell<OpState>>,
    #[string] command: String,
    #[string] payload: String,
) -> Result<String, JsErrorBox> {
    let host = state.borrow().borrow::<Rc<RefCell<Host>>>().clone();
    let native = state.borrow().borrow::<NativeExecution>().clone();
    let owned = FileIoRequest::supports(&command)
        || DomRequest::supports(&command)
        || ChannelRequest::supports(&command)
        || matches!(
            command.as_str(),
            "run_process" | "load_http" | "load_html_from_url"
        );
    // deno_core eagerly polls this async op when called, so admission precedes
    // the first await and unfinished calls remain visible at Work completion.
    let operation = if owned {
        Some(
            native
                .io
                .register()
                .map_err(|error| JsErrorBox::generic(error.to_string()))?,
        )
    } else {
        None
    };
    tokio::time::sleep(if command == "append_output" {
        Duration::from_millis(15)
    } else if owned {
        native.call_delay
    } else {
        Duration::from_millis(2)
    })
    .await;
    if state
        .borrow()
        .borrow::<Arc<HeapGuard>>()
        .reached
        .load(Ordering::Relaxed)
    {
        return Err(JsErrorBox::generic("JavaScript heap limit reached"));
    }
    let args: Value =
        serde_json::from_str(&payload).map_err(|e| JsErrorBox::generic(e.to_string()))?;
    if operation
        .as_ref()
        .is_some_and(|operation| operation.is_cancelled())
    {
        return Err(JsErrorBox::generic("Native I/O cancelled"));
    }
    let result = if native.real_files && FileIoRequest::supports(&command) {
        host.borrow_mut()
            .calls
            .push(json!({ "command": command, "args": args }));
        let request = FileIoRequest::decode(&command, args).map_err(JsErrorBox::generic)?;
        request
            .execute(operation.expect("file operation admitted"), move |_| {
                native.scan_started.store(true, Ordering::Relaxed);
                if native.panic_scan {
                    panic!("fixture scan progress panic");
                }
                if !native.scan_delay.is_zero() {
                    std::thread::sleep(native.scan_delay);
                }
            })
            .await
    } else if native.real_files && ChannelRequest::supports(&command) {
        host.borrow_mut()
            .calls
            .push(json!({ "command": command, "args": args }));
        let request = ChannelRequest::decode(&command, args).map_err(JsErrorBox::generic)?;
        let channels = state.borrow().borrow::<Rc<RefCell<ChannelStore>>>().clone();
        let result = request.execute(
            &mut channels.borrow_mut(),
            operation.expect("channel operation admitted"),
        );
        result
    } else if native.real_files && owned {
        host.borrow_mut()
            .calls
            .push(json!({ "command": command, "args": args }));
        let operation = operation.expect("native operation admitted");
        match command.as_str() {
            "run_process" => {
                let request =
                    serde_json::from_value::<process::RunProcessRequest>(args["req"].clone())
                        .map_err(|e| JsErrorBox::generic(e.to_string()))?;
                process::execute(request, operation).await.map(|v| json!(v))
            }
            "load_http" => {
                let request =
                    serde_json::from_value::<http::types::HttpRequest>(args["req"].clone())
                        .map_err(|e| JsErrorBox::generic(e.to_string()))?;
                http::api::load_http(request, operation)
                    .await
                    .map(|v| json!(v))
                    .map_err(|e| e.to_string())
            }
            "load_html_from_url" => {
                let url = args["url"]
                    .as_str()
                    .ok_or_else(|| JsErrorBox::generic("Missing URL"))?
                    .to_owned();
                http::api::load_html_from_url(url, operation)
                    .await
                    .map(|v| json!(v))
                    .map_err(|e| e.to_string())
            }
            _ => {
                let request = DomRequest::decode(&command, args).map_err(JsErrorBox::generic)?;
                let doms = state.borrow().borrow::<Rc<RefCell<DomStore>>>().clone();
                let result = request.execute(&mut doms.borrow_mut(), operation);
                result
            }
        }
    } else {
        host.borrow_mut().call(&command, args)
    };
    let response = match result {
        Ok(value) => json!({ "ok": true, "value": value }),
        Err(error) => json!({ "ok": false, "error": error }),
    };
    Ok(response.to_string())
}

#[op2(fast)]
fn op_spike_begin(state: &mut OpState) {
    state
        .borrow::<WorkStarted>()
        .0
        .store(true, Ordering::Relaxed);
}

#[op2]
async fn op_spike_sleep(ms: u32) {
    tokio::time::sleep(Duration::from_millis(u64::from(ms.min(10_000)))).await;
}

#[op2]
#[string]
fn op_spike_decode(
    #[string] payload: String,
    #[string] encoding: String,
) -> Result<String, JsErrorBox> {
    let bytes: Vec<u8> =
        serde_json::from_str(&payload).map_err(|e| JsErrorBox::generic(e.to_string()))?;
    decode(&bytes, &encoding).map_err(JsErrorBox::generic)
}

#[op2]
#[string]
fn op_spike_encode(#[string] text: String) -> String {
    json!(text.as_bytes()).to_string()
}

deno_core::extension!(
    spike_ops,
    ops = [
        op_spike_invoke,
        op_spike_checkpoint,
        op_spike_finish_native,
        op_spike_begin,
        op_spike_sleep,
        op_spike_decode,
        op_spike_encode
    ]
);

async fn execute(input: Value) -> Value {
    let started = Instant::now();
    let deadline_ms = input["deadlineMs"]
        .as_u64()
        .unwrap_or(2_000)
        .clamp(10, 10_000);
    let deadline = started + Duration::from_millis(deadline_ms);
    let work_started = Arc::new(AtomicBool::new(false));
    let cancelled = Arc::new(AtomicBool::new(false));
    let timed_out = Arc::new(AtomicBool::new(false));
    let memory_limited = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    let native = NativeExecution {
        io: ExecutionIo::new(),
        real_files: input["nativeFiles"].as_bool().unwrap_or(false),
        unfinished: Arc::new(AtomicBool::new(false)),
        failed_cleanup: Arc::new(AtomicBool::new(false)),
        panic_scan: input["scanProgressPanic"].as_bool().unwrap_or(false),
        scan_started: Arc::new(AtomicBool::new(false)),
        scan_delay: Duration::from_millis(
            input["scanProgressDelayMs"]
                .as_u64()
                .unwrap_or(0)
                .min(1_000),
        ),
        call_delay: Duration::from_millis(
            input["nativeCallDelayMs"].as_u64().unwrap_or(2).min(1_000),
        ),
        stop_wakeup: Arc::new(tokio::sync::Notify::new()),
    };
    let host = Rc::new(RefCell::new(Host {
        entries: input["entries"].as_object().cloned().unwrap_or_default(),
        scan_trees: input["scanTrees"].as_object().cloned().unwrap_or_default(),
        process_results: input["processResults"]
            .as_object()
            .cloned()
            .unwrap_or_default(),
        fail_command: input["failCommand"].as_str().unwrap_or("").into(),
        fail_at: input["failAt"].as_u64().unwrap_or(1) as usize,
        ..Host::default()
    }));
    let doms = Rc::new(RefCell::new(DomStore::new()));
    let channels = Rc::new(RefCell::new(ChannelStore::new()));
    let memory_limit = input["memoryLimitBytes"]
        .as_u64()
        .unwrap_or(32 * 1024 * 1024)
        .clamp(8 * 1024 * 1024, 512 * 1024 * 1024) as usize;
    let mut runtime = JsRuntime::new(RuntimeOptions {
        extensions: vec![
            deno_webidl::deno_webidl::init(),
            deno_web::deno_web::init(
                Arc::new(deno_web::BlobStore::default()),
                None,
                false,
                deno_web::InMemoryBroadcastChannel::default(),
            ),
            spike_ops::init(),
        ],
        create_params: Some(v8::Isolate::create_params().heap_limits(0, memory_limit)),
        // The Web structuredClone transfer path uses this backing-store table
        // even when both serialization and deserialization use one isolate.
        shared_array_buffer_store: Some(Default::default()),
        ..Default::default()
    });
    let guard = Arc::new(HeapGuard {
        limit: memory_limit,
        reached: memory_limited.clone(),
        interrupt_pending: AtomicBool::new(false),
        native_io: native.io.clone(),
        stop_wakeup: native.stop_wakeup.clone(),
    });
    runtime.v8_isolate().set_slot(guard.clone());
    {
        let state = runtime.op_state();
        let mut state = state.borrow_mut();
        state.put(host.clone());
        state.put(channels.clone());
        state.put(WorkStarted(work_started.clone()));
        state.put(guard.clone());
        state.put(native.clone());
        state.put(doms.clone());
    }
    let memory_stop = memory_limited.clone();
    let initial_heap = runtime.v8_isolate().get_heap_statistics();
    let memory_handle = runtime.v8_isolate().thread_safe_handle();
    let memory_native = native.io.clone();
    let memory_notice = native.stop_wakeup.clone();
    // A temporary reserve lets V8 observe termination instead of aborting on OOM.
    runtime.add_near_heap_limit_callback(move |current, _initial| {
        memory_stop.store(true, Ordering::Relaxed);
        memory_native.request_stop();
        memory_notice.notify_one();
        memory_handle.terminate_execution();
        current.saturating_add(128 * 1024 * 1024)
    });
    let stop_handle = runtime.v8_isolate().thread_safe_handle();
    let watchdog_finished = finished.clone();
    let watchdog_started = work_started.clone();
    let watchdog_cancelled = cancelled.clone();
    let watchdog_timeout = timed_out.clone();
    let watchdog_native = native.io.clone();
    let watchdog_notice = native.stop_wakeup.clone();
    let cancel_after = input["cancelAfterMs"].as_u64().map(Duration::from_millis);
    let watchdog = std::thread::spawn(move || {
        let mut began_at = None;
        while !watchdog_finished.load(Ordering::Relaxed) {
            let now = Instant::now();
            if began_at.is_none() && watchdog_started.load(Ordering::Relaxed) {
                began_at = Some(now);
            }
            if cancel_after
                .zip(began_at)
                .is_some_and(|(delay, began)| now >= began + delay)
            {
                watchdog_cancelled.store(true, Ordering::Relaxed);
                watchdog_native.request_stop();
                watchdog_notice.notify_one();
                stop_handle.terminate_execution();
                break;
            }
            if now >= deadline {
                watchdog_timeout.store(true, Ordering::Relaxed);
                watchdog_native.request_stop();
                watchdog_notice.notify_one();
                stop_handle.terminate_execution();
                break;
            }
            if !guard.interrupt_pending.swap(true, Ordering::Relaxed) {
                stop_handle.request_interrupt(check_heap_interrupt, std::ptr::null_mut());
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    });
    let outcome = async {
        runtime
            .execute_script("spike_bootstrap", include_str!("bootstrap.js"))
            .map_err(|e| e.to_string())?;
        let source = input["source"].as_str().ok_or("Missing source")?;
        let value = runtime
            .execute_script("spike_work", source.to_owned())
            .map_err(|e| e.to_string())?;
        let mut resolution = Box::pin(runtime.resolve(value));
        let mut stop_notice = Box::pin(native.stop_wakeup.notified());
        let stop_reason = || {
            if cancelled.load(Ordering::Relaxed) {
                Some("Execution cancelled")
            } else if memory_limited.load(Ordering::Relaxed) {
                Some("JavaScript heap limit reached")
            } else if native.unfinished.load(Ordering::Relaxed) {
                Some("Work finished with native I/O still running")
            } else if native.failed_cleanup.load(Ordering::Relaxed) {
                Some("Native I/O cleanup failed")
            } else if timed_out.load(Ordering::Relaxed) {
                Some("Execution deadline exceeded")
            } else {
                None
            }
        };
        let execution = poll_fn(|cx| {
            // A thread-side stop must wake this task while an async native op
            // is pending; V8 termination alone does not wake Tokio's waiter.
            let _ = stop_notice.as_mut().poll(cx);
            if let Some(reason) = stop_reason() {
                return Poll::Ready(Err(reason.to_string()));
            }
            if let Poll::Ready(result) = resolution.as_mut().poll(cx) {
                return Poll::Ready(result.map_err(|e| e.to_string()));
            }
            if let Poll::Ready(Err(error)) = runtime.poll_event_loop(cx, Default::default()) {
                return Poll::Ready(Err(error.to_string()));
            }
            // V8 termination can also leave the JS Promise unsettled.
            if let Some(reason) = stop_reason() {
                return Poll::Ready(Err(reason.to_string()));
            }
            resolution
                .as_mut()
                .poll(cx)
                .map(|result| result.map_err(|e| e.to_string()))
        });
        // An unresolved Promise remains pending until the host deadline, even if no ops are active.
        let value = tokio::time::timeout_at(tokio::time::Instant::from_std(deadline), execution)
            .await
            .map_err(|_| "Execution deadline exceeded".to_string())??;
        tokio::time::timeout_at(
            tokio::time::Instant::from_std(deadline),
            runtime.run_event_loop(Default::default()),
        )
        .await
        .map_err(|_| "Runtime did not become idle".to_string())?
        .map_err(|e| e.to_string())?;
        let guard = runtime
            .op_state()
            .borrow()
            .borrow::<Arc<HeapGuard>>()
            .clone();
        guard.check(runtime.v8_isolate());
        if memory_limited.load(Ordering::Relaxed) {
            return Err("JavaScript heap limit reached".to_string());
        }
        deno_core::scope!(scope, runtime);
        let local = v8::Local::new(scope, value);
        let report =
            deno_core::serde_v8::from_v8::<String>(scope, local).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&report).map_err(|e| e.to_string())
    }
    .await;
    finished.store(true, Ordering::Relaxed);
    let _ = watchdog.join();
    let final_heap = runtime.v8_isolate().get_heap_statistics();
    let heap_report = json!({ "configuredBytes": memory_limit, "initialLimitBytes": initial_heap.heap_size_limit(), "finalLimitBytes": final_heap.heap_size_limit(), "usedBytes": final_heap.used_heap_size(), "externalBytes": final_heap.external_memory() });
    let cleanup_started = Instant::now();
    native.io.request_stop();
    // Dropping V8 releases unpolled async futures. Blocking tasks retain their
    // own Operation, and stop waits for their actual completion afterward.
    drop(runtime);
    let cleanup_error = native.io.stop().await.err();
    doms.borrow_mut().clear();
    let retained_channels = channels.borrow().snapshot();
    channels.borrow_mut().clear();
    let kind = if cancelled.load(Ordering::Relaxed) {
        "cancelled"
    } else if memory_limited.load(Ordering::Relaxed)
        || native.unfinished.load(Ordering::Relaxed)
        || native.failed_cleanup.load(Ordering::Relaxed)
    {
        "host-error"
    } else if timed_out.load(Ordering::Relaxed) || Instant::now() >= deadline {
        "timed-out"
    } else if outcome.is_err() || cleanup_error.is_some() {
        "host-error"
    } else {
        "completed"
    };
    let host = host.borrow();
    json!({
        "kind": kind,
        "report": outcome.as_ref().ok(),
        "error": outcome.as_ref().err(),
        "stdout": host.output,
        "calls": host.calls,
        "entries": host.entries,
        "workStarted": work_started.load(Ordering::Relaxed),
        "memoryLimitReached": memory_limited.load(Ordering::Relaxed),
        "heap": heap_report,
        "nativeIo": { "realFiles": native.real_files, "activeAfterCleanup": native.io.has_active_operations(), "unfinishedAtBoundary": native.unfinished.load(Ordering::Relaxed), "scanStarted": native.scan_started.load(Ordering::Relaxed), "cleanupError": cleanup_error, "cleanupMs": cleanup_started.elapsed().as_millis() },
        "domDocumentsAfterCleanup": doms.borrow().doms.len(),
        "channels": retained_channels,
        "channelsAfterCleanup": channels.borrow().channel_count(),
        "engine": { "denoCore": "0.412.0", "v8": v8::V8::get_version() },
        "elapsedMs": started.elapsed().as_millis(),
    })
}

fn main() {
    let mut source = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut source) {
        eprintln!("{error}");
        std::process::exit(2);
    }
    let input: Value = match serde_json::from_str(&source) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };
    deno_core::v8_set_flags(vec!["spike".into(), "--stack-size=512".into()]);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("Tokio runtime");
    let report = runtime.block_on(execute(input));
    println!("{report}");
    if report["kind"] != "completed" {
        std::process::exit(1);
    }
}
