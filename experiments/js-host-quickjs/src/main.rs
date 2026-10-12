use rquickjs::{prelude::Async, AsyncContext, AsyncRuntime, CatchResultExt, Function, Promise};
use serde_json::{json, Map, Value};
use std::{
    cell::RefCell,
    io::{self, Read},
    rc::Rc,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

#[derive(Default)]
struct Host {
    entries: Map<String, Value>,
    calls: Vec<Value>,
    output: String,
    fail_command: String,
    fail_at: usize,
    matching_calls: usize,
}

impl Host {
    fn call(&mut self, command: &str, args: Value) -> Result<Value, String> {
        self.calls.push(json!({ "command": command, "args": args }));
        if command == self.fail_command {
            self.matching_calls += 1;
            if self.matching_calls == self.fail_at {
                return Err("Injected host failure".into());
            }
        }
        let field = |name: &str| -> Result<String, String> {
            args[name]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| format!("Missing {name}"))
        };
        let entry = |path: &str| -> Result<Value, String> {
            self.entries
                .get(path)
                .cloned()
                .ok_or_else(|| format!("Missing path: {path}"))
        };
        match command {
            "exists_path" => Ok(json!(self.entries.contains_key(&field("path")?))),
            "stat" => Ok(entry(&field("path")?)?["stat"].clone()),
            "read_binary" => Ok(entry(&field("filePath")?)?["bytes"].clone()),
            "read_dir" => Ok(entry(&field("dir")?)?["children"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into()),
            "read_file" => {
                let req = &args["req"];
                let path = req["filePath"].as_str().ok_or("Missing filePath")?;
                let bytes: Vec<u8> = serde_json::from_value(entry(path)?["bytes"].clone())
                    .map_err(|e| e.to_string())?;
                Ok(json!(decode(
                    &bytes,
                    req["encoding"].as_str().unwrap_or("utf8")
                )?))
            }
            "save_binary" | "save_text" => {
                let path = field("path")?;
                let bytes: Vec<u8> = if command == "save_binary" {
                    serde_json::from_value(args["bytes"].clone()).map_err(|e| e.to_string())?
                } else {
                    field("content")?.into_bytes()
                };
                self.entries.insert(path, json!({
                    "stat": { "isFile": true, "isDir": false, "readonly": false, "size": bytes.len(), "modifiedAt": 11 },
                    "bytes": bytes,
                }));
                Ok(Value::Null)
            }
            "make_dir" => {
                self.entries.insert(field("dirPath")?, json!({
                    "stat": { "isFile": false, "isDir": true, "readonly": false, "size": 0, "modifiedAt": 10 },
                    "children": [],
                }));
                Ok(Value::Null)
            }
            "delete_file" | "delete_dir" => {
                self.entries
                    .remove(&field("path")?)
                    .ok_or("Missing deletion target")?;
                Ok(Value::Null)
            }
            "rename" => {
                let value = entry(&field("from")?)?;
                self.entries.remove(&field("from")?);
                self.entries.insert(field("to")?, value);
                Ok(Value::Null)
            }
            "copy_file" => {
                let value = entry(&field("src")?)?;
                self.entries.insert(field("dest")?, value);
                Ok(Value::Null)
            }
            "append_output" => {
                self.output.push_str(&field("text")?);
                Ok(Value::Null)
            }
            _ => Err(format!("Unsupported spike command: {command}")),
        }
    }
}

fn decode(bytes: &[u8], encoding: &str) -> Result<String, String> {
    let encoding = match encoding {
        "utf8" | "utf-8" => encoding_rs::UTF_8,
        "sjis" | "shift_jis" => encoding_rs::SHIFT_JIS,
        _ => return Err("Unsupported spike encoding".into()),
    };
    Ok(encoding.decode(bytes).0.into_owned())
}

fn js_error(message: impl ToString) -> rquickjs::Error {
    rquickjs::Error::new_from_js_message("host", "value", message.to_string())
}

async fn execute(input: Value) -> Value {
    let started = Instant::now();
    let deadline_ms = input["deadlineMs"]
        .as_u64()
        .unwrap_or(2_000)
        .clamp(10, 10_000);
    let deadline = started + Duration::from_millis(deadline_ms);
    let cancelled = Arc::new(AtomicBool::new(false));
    let work_started = Arc::new(AtomicBool::new(false));
    let cancel_thread = input["cancelAfterMs"].as_u64().map(|delay| {
        let cancelled = cancelled.clone();
        let work_started = work_started.clone();
        std::thread::spawn(move || {
            while !work_started.load(Ordering::Relaxed) && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(1));
            }
            std::thread::sleep(Duration::from_millis(delay.min(deadline_ms)));
            cancelled.store(true, Ordering::Relaxed);
        })
    });
    let host = Rc::new(RefCell::new(Host {
        entries: input["entries"].as_object().cloned().unwrap_or_default(),
        fail_command: input["failCommand"].as_str().unwrap_or("").into(),
        fail_at: input["failAt"].as_u64().unwrap_or(1) as usize,
        ..Host::default()
    }));
    let outcome = async {
        let runtime = AsyncRuntime::new().map_err(|e| e.to_string())?;
        let memory_limit = input["memoryLimitBytes"]
            .as_u64()
            .unwrap_or(32 * 1024 * 1024)
            .clamp(8 * 1024 * 1024, 512 * 1024 * 1024);
        runtime.set_memory_limit(memory_limit as usize).await;
        runtime.set_max_stack_size(512 * 1024).await;
        let stop = cancelled.clone();
        runtime
            .set_interrupt_handler(Some(Box::new(move || {
                stop.load(Ordering::Relaxed) || Instant::now() >= deadline
            })))
            .await;
        let context = AsyncContext::full(&runtime)
            .await
            .map_err(|e| e.to_string())?;
        let source = input["source"].as_str().ok_or("Missing source")?;
        let execution = context.async_with(async |ctx| {
            let boundary = host.clone();
            (|| -> rquickjs::Result<()> {
                let work_started = work_started.clone();
                ctx.globals().set(
                    "__beginWork",
                    Function::new(ctx.clone(), move || {
                        work_started.store(true, Ordering::Relaxed);
                    })?,
                )?;
                ctx.globals().set(
                    "__invoke",
                    Function::new(
                        ctx.clone(),
                        Async(move |command: String, payload: String| {
                            let boundary = boundary.clone();
                            async move {
                                tokio::time::sleep(Duration::from_millis(
                                    if command == "append_output" { 15 } else { 2 },
                                ))
                                .await;
                                let args: Value =
                                    serde_json::from_str(&payload).map_err(js_error)?;
                                let value = match boundary.borrow_mut().call(&command, args) {
                                    Ok(value) => json!({ "ok": true, "value": value }),
                                    Err(error) => json!({ "ok": false, "error": error }),
                                };
                                Ok::<String, rquickjs::Error>(value.to_string())
                            }
                        }),
                    )?,
                )?;
                ctx.globals().set(
                    "__sleep",
                    Function::new(
                        ctx.clone(),
                        Async(|ms: u64| async move {
                            tokio::time::sleep(Duration::from_millis(ms.min(10_000))).await;
                            Ok::<(), rquickjs::Error>(())
                        }),
                    )?,
                )?;
                ctx.globals().set(
                    "__decode",
                    Function::new(ctx.clone(), |payload: String, encoding: String| {
                        let bytes: Vec<u8> = serde_json::from_str(&payload).map_err(js_error)?;
                        decode(&bytes, &encoding).map_err(js_error)
                    })?,
                )?;
                ctx.globals().set(
                    "__encode",
                    Function::new(ctx.clone(), |text: String| {
                        Ok::<String, rquickjs::Error>(json!(text.as_bytes()).to_string())
                    })?,
                )?;
                Ok(())
            })()
            .catch(&ctx)
            .map_err(|e| e.to_string())?;
            let promise = ctx
                .eval::<Promise, _>(source)
                .catch(&ctx)
                .map_err(|e| e.to_string())?;
            promise
                .into_future::<String>()
                .await
                .catch(&ctx)
                .map_err(|e| e.to_string())
        });
        let report = tokio::time::timeout(Duration::from_millis(deadline_ms), execution)
            .await
            .map_err(|_| "Execution deadline exceeded".to_string())?
            .map_err(|e| e.to_string())?;
        // The fixture explicitly drains tracked work; idle checks the engine job queue too.
        tokio::time::timeout(Duration::from_millis(deadline_ms), runtime.idle())
            .await
            .map_err(|_| "Runtime did not become idle".to_string())?;
        serde_json::from_str::<Value>(&report).map_err(|e| e.to_string())
    }
    .await;
    let kind = if cancelled.load(Ordering::Relaxed) {
        "cancelled"
    } else if Instant::now() >= deadline {
        "timed-out"
    } else if outcome.is_ok() {
        "completed"
    } else {
        "host-error"
    };
    if let Some(thread) = cancel_thread {
        let _ = thread.join();
    }
    let host = host.borrow();
    json!({
        "kind": kind,
        "report": outcome.as_ref().ok(),
        "error": outcome.as_ref().err(),
        "stdout": host.output,
        "calls": host.calls,
        "entries": host.entries,
        "workStarted": work_started.load(Ordering::Relaxed),
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
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .expect("Tokio runtime");
    let report = runtime.block_on(execute(input));
    println!("{report}");
    if report["kind"] != "completed" {
        std::process::exit(1);
    }
}
