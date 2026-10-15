use crate::output::Output;
use deno_core::{op2, v8, JsRuntime, OpState, RuntimeOptions};
use deno_error::JsErrorBox;
use serde_json::{json, Value};
use std::{
    cell::RefCell,
    future::{poll_fn, Future},
    rc::Rc,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    task::Poll,
    time::{Duration, Instant},
};
use trace_kernel_native_core::{
    execution_io::ExecutionIo,
    file_io_dispatch::FileIoRequest,
    http,
    parser::{dom::DomStore, dom_dispatch::DomRequest},
    process,
    stream::{channel::ChannelStore, dispatch::ChannelRequest},
};

#[derive(Clone)]
pub struct Control {
    pub io: ExecutionIo,
    pub cancelled: Arc<AtomicBool>,
    memory: Arc<AtomicBool>,
    pub finished: Arc<AtomicBool>,
    wake: Arc<tokio::sync::Notify>,
    deadline: Option<Instant>,
    failure: Arc<Mutex<Option<String>>>,
    transaction: Arc<Mutex<(String, u64)>>,
}
impl Control {
    pub fn new(timeout: u64) -> Self {
        Self {
            io: ExecutionIo::new(),
            cancelled: Arc::new(AtomicBool::new(false)),
            memory: Arc::new(AtomicBool::new(false)),
            finished: Arc::new(AtomicBool::new(false)),
            wake: Arc::new(tokio::sync::Notify::new()),
            deadline: if timeout == 0 {
                None
            } else {
                Instant::now().checked_add(Duration::from_secs(timeout))
            },
            failure: Arc::new(Mutex::new(None)),
            transaction: Arc::new(Mutex::new((String::new(), 0))),
        }
    }
    pub fn check(&self) -> Result<(), (i32, String)> {
        if self.cancelled.load(Ordering::Relaxed) {
            Err((130, "Execution cancelled".into()))
        } else if self.deadline.is_some_and(|d| Instant::now() >= d) {
            Err((124, "Execution deadline exceeded".into()))
        } else if self.memory.load(Ordering::Relaxed) {
            Err((1, "JavaScript memory limit reached".into()))
        } else if let Some(error) = self.failure.lock().unwrap().clone() {
            Err((1, error))
        } else {
            Ok(())
        }
    }
    fn stop(&self) {
        self.io.request_stop();
        self.wake.notify_one();
    }
    pub fn transaction_error(&self, (code, error): (i32, String)) -> (i32, String) {
        let (state, completed) = &*self.transaction.lock().unwrap();
        if state == "committing" {
            (code, format!("{error}\nTransaction interrupted; {completed} completed operations confirmed. An in-flight operation may also have changed files. Applied changes are not rolled back."))
        } else {
            (code, error)
        }
    }
    fn fail(&self, error: &str) {
        *self.failure.lock().unwrap() = Some(error.into());
        self.stop();
    }
    pub fn signal_thread(&self) -> std::thread::JoinHandle<()> {
        let control = self.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Signal runtime");
            runtime.block_on(async move {
                let mut signal=Box::pin(tokio::signal::ctrl_c());let mut ready=Some(ready_tx);
                let registered=poll_fn(|cx|{let result=signal.as_mut().poll(cx);if let Some(tx)=ready.take(){let _=tx.send(());}result});
                tokio::pin!(registered);
                loop {tokio::select! {
                    result=&mut registered=>{if result.is_ok(){control.cancelled.store(true,Ordering::Relaxed);control.stop();}break;},
                    _=tokio::time::sleep(Duration::from_millis(25))=>{if control.finished.load(Ordering::Relaxed){break;}}
                }}
            });
        });
        let _ = ready_rx.recv();
        thread
    }
}

struct HeapGuard {
    limit: usize,
    control: Control,
    pending: AtomicBool,
}
impl HeapGuard {
    fn check(&self, isolate: &mut v8::Isolate) {
        let heap = isolate.get_heap_statistics();
        if heap.used_heap_size().saturating_add(heap.external_memory()) > self.limit {
            self.control.memory.store(true, Ordering::Relaxed);
            self.control.stop();
            isolate.terminate_execution();
        }
    }
}
unsafe extern "C" fn heap_interrupt(
    mut raw: v8::UnsafeRawIsolatePtr,
    _data: *mut std::ffi::c_void,
) {
    let isolate = unsafe { v8::Isolate::ref_from_raw_isolate_ptr_mut(&mut raw) };
    if let Some(guard) = isolate.get_slot::<Arc<HeapGuard>>().cloned() {
        guard.check(isolate);
        guard.pending.store(false, Ordering::Relaxed);
    }
}
#[op2(fast)]
fn op_cli_checkpoint(scope: &mut v8::PinScope, state: &mut OpState) {
    state.borrow::<Arc<HeapGuard>>().check(scope);
}
#[op2(fast)]
fn op_cli_finish_native(scope: &mut v8::PinScope, state: &mut OpState) {
    let control = state.borrow::<Control>();
    let failed = state.borrow::<Rc<RefCell<Output>>>().borrow().failed;
    if failed || control.io.has_active_operations() || control.io.has_cleanup_failures() {
        control.fail(if failed {
            "Output failed"
        } else {
            "Work completed with unfinished or failed native I/O"
        });
        scope.terminate_execution();
    }
}
#[op2(fast)]
fn op_cli_emit(
    state: &mut OpState,
    #[string] kind: String,
    #[string] payload: String,
) -> Result<(), JsErrorBox> {
    if kind == "transaction" {
        let data: Value =
            serde_json::from_str(&payload).map_err(|e| JsErrorBox::generic(e.to_string()))?;
        *state.borrow::<Control>().transaction.lock().unwrap() = (
            data["state"].as_str().unwrap_or_default().into(),
            data["completedCount"].as_u64().unwrap_or_default(),
        );
        return Ok(());
    }
    state
        .borrow::<Control>()
        .check()
        .map_err(|(_, e)| JsErrorBox::generic(e))?;
    let data: Value =
        serde_json::from_str(&payload).map_err(|e| JsErrorBox::generic(e.to_string()))?;
    let output = state.borrow::<Rc<RefCell<Output>>>();
    let mut output = output.borrow_mut();
    match kind.as_str() {
        "mode" => output.set_method(
            data.as_str()
                .ok_or_else(|| JsErrorBox::generic("Invalid output mode"))?,
        ),
        "state" => output.state(data),
        "list" => output.list(data),
        _ => Err("Unknown output event".into()),
    }
    .map_err(JsErrorBox::generic)
}
#[op2]
#[string]
async fn op_cli_invoke(
    state: Rc<RefCell<OpState>>,
    #[string] command: String,
    #[string] payload: String,
) -> Result<String, JsErrorBox> {
    let control = state.borrow().borrow::<Control>().clone();
    control.check().map_err(|(_, e)| JsErrorBox::generic(e))?;
    if command == "worker_init" {
        return Ok("{\"ok\":true,\"value\":null}".into());
    }
    if !(FileIoRequest::supports(&command)
        || DomRequest::supports(&command)
        || ChannelRequest::supports(&command)
        || matches!(
            command.as_str(),
            "run_process" | "load_http" | "load_html_from_url"
        ))
    {
        return Err(JsErrorBox::generic(format!(
            "Unsupported native command: {command}"
        )));
    }
    let operation = control
        .io
        .register()
        .map_err(|e| JsErrorBox::generic(e.to_string()))?;
    let args: Value =
        serde_json::from_str(&payload).map_err(|e| JsErrorBox::generic(e.to_string()))?;
    let result = if FileIoRequest::supports(&command) {
        FileIoRequest::decode(&command, args)
            .map_err(JsErrorBox::generic)?
            .execute(operation, |_| {})
            .await
    } else if ChannelRequest::supports(&command) {
        let channels = state.borrow().borrow::<Rc<RefCell<ChannelStore>>>().clone();
        let output = state.borrow().borrow::<Rc<RefCell<Output>>>().clone();
        let request =
            ChannelRequest::decode(&command, args.clone()).map_err(JsErrorBox::generic)?;
        let result = request.execute(&mut channels.borrow_mut(), operation);
        match result {
            Ok(value) => {
                let write = match command.as_str() {
                    "add_channel" => output.borrow_mut().register(
                        args["channelId"].as_str().unwrap(),
                        args["definition"].clone(),
                    ),
                    "append_lines" => {
                        let batches: Vec<Vec<String>> =
                            serde_json::from_value(args["batches"].clone())
                                .map_err(|e| JsErrorBox::generic(e.to_string()))?;
                        output
                            .borrow_mut()
                            .append(args["channelId"].as_str().unwrap(), &batches)
                    }
                    _ => Ok(()),
                };
                write.map(|_| value)
            }
            Err(error) => Err(error),
        }
    } else if command == "run_process" {
        process::execute(
            serde_json::from_value(args["req"].clone())
                .map_err(|e| JsErrorBox::generic(e.to_string()))?,
            operation,
        )
        .await
        .map(|r| json!(r))
    } else if command == "load_http" {
        http::api::load_http(
            serde_json::from_value(args["req"].clone())
                .map_err(|e| JsErrorBox::generic(e.to_string()))?,
            operation,
        )
        .await
        .map(|r| json!(r))
        .map_err(|e| e.to_string())
    } else if command == "load_html_from_url" {
        http::api::load_html_from_url(
            args["url"]
                .as_str()
                .ok_or_else(|| JsErrorBox::generic("Missing URL"))?
                .to_string(),
            operation,
        )
        .await
        .map(|r| json!(r))
        .map_err(|e| e.to_string())
    } else {
        let doms = state.borrow().borrow::<Rc<RefCell<DomStore>>>().clone();
        let request = DomRequest::decode(&command, args).map_err(JsErrorBox::generic)?;
        let result = request.execute(&mut doms.borrow_mut(), operation);
        result
    };
    Ok(match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error}),
    }
    .to_string())
}
deno_core::extension!(
    cli_ops,
    ops = [
        op_cli_checkpoint,
        op_cli_finish_native,
        op_cli_emit,
        op_cli_invoke
    ]
);

pub async fn execute(
    control: Control,
    input: Value,
    memory_limit: usize,
) -> Result<Value, (i32, String)> {
    let output = Rc::new(RefCell::new(Output::default()));
    let doms = Rc::new(RefCell::new(DomStore::new()));
    let channels = Rc::new(RefCell::new(ChannelStore::new()));
    let mut runtime = JsRuntime::new(RuntimeOptions {
        extensions: vec![
            deno_webidl::deno_webidl::init(),
            deno_web::deno_web::init(
                Arc::new(deno_web::BlobStore::default()),
                None,
                false,
                deno_web::InMemoryBroadcastChannel::default(),
            ),
            cli_ops::init(),
        ],
        create_params: Some(v8::Isolate::create_params().heap_limits(0, memory_limit)),
        shared_array_buffer_store: Some(Default::default()),
        ..Default::default()
    });
    let guard = Arc::new(HeapGuard {
        limit: memory_limit,
        control: control.clone(),
        pending: AtomicBool::new(false),
    });
    runtime.v8_isolate().set_slot(guard.clone());
    {
        let state = runtime.op_state();
        let mut state = state.borrow_mut();
        state.put(control.clone());
        state.put(guard.clone());
        state.put(output.clone());
        state.put(doms.clone());
        state.put(channels.clone());
    }
    let memory_control = control.clone();
    let memory_handle = runtime.v8_isolate().thread_safe_handle();
    runtime.add_near_heap_limit_callback(move |current, _| {
        memory_control.memory.store(true, Ordering::Relaxed);
        memory_control.stop();
        memory_handle.terminate_execution();
        current.saturating_add(128 * 1024 * 1024)
    });
    let handle = runtime.v8_isolate().thread_safe_handle();
    let watchdog_control = control.clone();
    let done = Arc::new(AtomicBool::new(false));
    let watchdog_done = done.clone();
    let watchdog = std::thread::spawn(move || {
        while !watchdog_done.load(Ordering::Relaxed) {
            if watchdog_control.check().is_err() {
                watchdog_control.stop();
                handle.terminate_execution();
                break;
            }
            if !guard.pending.swap(true, Ordering::Relaxed) {
                handle.request_interrupt(heap_interrupt, std::ptr::null_mut());
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    });
    let outcome = async {
        runtime
            .execute_script("cli_bootstrap", include_str!("bootstrap.js"))
            .map_err(|e| e.to_string())?;
        let source = format!(
            "(async()=>{{\n{}\n{}\nconst input={};\nconst libs={};\n{}\nreturn await runCli(input,libs,RuntimeCore,CompilerCore);\n}})()",
            include_str!("../../../packages/runtime-core/generated/runtime-assets/runtime.js"),
            include_str!("../../../packages/runtime-core/generated/runtime-assets/compiler.js"),
            input,
            include_str!(
                "../../../packages/runtime-core/generated/runtime-assets/typescript-libs.json"
            ),
            include_str!("runner.js")
        );
        let value = runtime
            .execute_script("cli_main", source)
            .map_err(|e| e.to_string())?;
        let mut resolution = Box::pin(runtime.resolve(value));
        let mut notice = Box::pin(control.wake.notified());
        let value = poll_fn(|cx| {
            let _ = notice.as_mut().poll(cx);
            if let Err((_, error)) = control.check() {
                return Poll::Ready(Err(error));
            }
            if let Poll::Ready(result) = resolution.as_mut().poll(cx) {
                return Poll::Ready(result.map_err(|e| e.to_string()));
            }
            if let Poll::Ready(Err(error)) = runtime.poll_event_loop(cx, Default::default()) {
                return Poll::Ready(Err(error.to_string()));
            }
            if let Err((_, error)) = control.check() {
                return Poll::Ready(Err(error));
            }
            resolution
                .as_mut()
                .poll(cx)
                .map(|r| r.map_err(|e| e.to_string()))
        })
        .await?;
        runtime
            .run_event_loop(Default::default())
            .await
            .map_err(|e| e.to_string())?;
        deno_core::scope!(scope, runtime);
        let local = v8::Local::new(scope, value);
        let result =
            deno_core::serde_v8::from_v8::<String>(scope, local).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&result).map_err(|e| e.to_string())
    }
    .await;
    done.store(true, Ordering::Relaxed);
    let _ = watchdog.join();
    control.io.request_stop();
    drop(runtime);
    let cleanup = control.io.stop().await;
    doms.borrow_mut().clear();
    channels.borrow_mut().clear();
    control.check().map_err(|e| control.transaction_error(e))?;
    cleanup.map_err(|e| control.transaction_error((1, e)))?;
    if output.borrow().failed {
        return Err((1, "Output failed".into()));
    }
    outcome.map_err(|e| control.transaction_error((1, e)))
}
