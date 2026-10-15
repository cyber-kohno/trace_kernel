//! Isolated acceptance fixture, not a product mode or GUI substitute.
//! The real native HTTP bridge forwards events over stdio to the test harness.
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::Arc,
};
#[allow(dead_code)]
#[path = "../../../crates/native-core/src/mcp.rs"]
mod native;
#[path = "../src/product_info.rs"]
mod product_info;

fn output(value: Value) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &value).map_err(|_| "fixture output failed")?;
    writeln!(stdout).map_err(|_| "fixture output failed")?;
    stdout.flush().map_err(|_| "fixture output failed".into())
}

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err("Expected acceptance temp root and bridge generation".into());
    }
    let root = PathBuf::from(&args[0])
        .canonicalize()
        .map_err(|_| "Missing fixture root")?;
    let temp = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| "Missing temp root")?;
    if root.parent() != Some(temp.as_path())
        || !root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .starts_with("trace-kernel-mcp-acceptance-")
    {
        return Err("Fixture must use its dedicated direct child of the temp directory".into());
    }
    let mut identity = product_info::identity();
    identity.release_version = "9.9.9".into();
    identity.bridge_protocol_gen = args[1]
        .to_str()
        .ok_or("Invalid generation")?
        .parse()
        .map_err(|_| "Invalid generation")?;
    let state = native::McpState::default();
    let events: native::EventSink =
        Arc::new(|event, payload| output(json!({"event":event,"payload":payload})));
    let info = native::start_session(
        events.clone(),
        &state,
        &root.join("jp.hkdev.tk/mcp/sessions"),
        identity,
    )?;
    output(json!({"event":"ready","session":info}))?;
    let result = (|| -> Result<(), String> {
        for line in io::stdin().lock().lines() {
            let request: Value = serde_json::from_str(&line.map_err(|_| "fixture input failed")?)
                .map_err(|_| "Invalid fixture command")?;
            let result = match request["command"].as_str() {
                Some("respond") => native::respond(
                    &state,
                    serde_json::from_value(request["payload"].clone())
                        .map_err(|_| "Invalid fixture response")?,
                )
                .map(|_| json!(null)),
                Some("diagnostics") => native::session_diagnostics(&state).and_then(|value| {
                    serde_json::to_value(value).map_err(|_| "Cannot serialize diagnostics".into())
                }),
                Some("stop") => native::stop_session(&events, &state).map(|_| json!(null)),
                _ => Err("Unknown fixture command".into()),
            };
            let stop = request["command"] == "stop";
            output(match result {
                Ok(result) => json!({"id":request["id"],"result":result}),
                Err(_) => json!({"id":request["id"],"error":"Fixture command failed"}),
            })?;
            if stop {
                break;
            }
        }
        Ok(())
    })();
    let cleanup = native::stop_session(&events, &state);
    result.and(cleanup)
}
