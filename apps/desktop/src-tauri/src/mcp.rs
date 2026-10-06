use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const WORK_PROPOSAL_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct McpState {
    active: Mutex<Option<ActiveSession>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>>,
}

#[derive(Clone)]
pub struct BridgeResponse {
    pub result: serde_json::Value,
    pub error: Option<serde_json::Value>,
}

struct ActiveSession {
    descriptor_path: std::path::PathBuf,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSessionInfo {
    pub session_id: String,
    pub endpoint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionDescriptor {
    session_id: String,
    endpoint: String,
    token: String,
}

#[derive(Deserialize)]
struct BridgeRequest {
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

fn response(stream: &mut TcpStream, status: &str, value: serde_json::Value) {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    let header = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(&body);
}

fn handle(
    mut stream: TcpStream,
    app: &AppHandle,
    session_id: &str,
    token: &str,
    pending: &Arc<Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut data = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        let Ok(count) = stream.read(&mut buf) else {
            return;
        };
        if count == 0 {
            return;
        }
        data.extend_from_slice(&buf[..count]);
        if data.len() > MAX_BODY_BYTES {
            response(
                &mut stream,
                "413 Payload Too Large",
                json!({"error":"request too large"}),
            );
            return;
        }
        if data.windows(4).any(|v| v == b"\r\n\r\n") {
            break;
        }
    }
    let Some(header_end) = data
        .windows(4)
        .position(|v| v == b"\r\n\r\n")
        .map(|v| v + 4)
    else {
        return;
    };
    let headers = String::from_utf8_lossy(&data[..header_end]).into_owned();
    let mut content_length = 0usize;
    let mut authorization = None;
    for line in headers.lines() {
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value.trim().parse().unwrap_or(0);
            }
            if name.eq_ignore_ascii_case("authorization") {
                authorization = Some(value.trim().to_string());
            }
        }
    }
    while data.len() < header_end + content_length {
        let Ok(count) = stream.read(&mut buf) else {
            return;
        };
        if count == 0 {
            return;
        }
        data.extend_from_slice(&buf[..count]);
    }
    if authorization.as_deref() != Some(&format!("Bearer {token}")) {
        response(
            &mut stream,
            "401 Unauthorized",
            json!({"error":"unauthorized"}),
        );
        return;
    }
    let request_line = headers.lines().next().unwrap_or_default();
    if request_line.starts_with("GET /health") {
        response(
            &mut stream,
            "200 OK",
            json!({"ok":true,"sessionId":session_id}),
        );
        return;
    }
    if !request_line.starts_with("POST /bridge") {
        response(&mut stream, "404 Not Found", json!({"error":"not found"}));
        return;
    }
    let Ok(request) =
        serde_json::from_slice::<BridgeRequest>(&data[header_end..header_end + content_length])
    else {
        response(
            &mut stream,
            "400 Bad Request",
            json!({"error":"invalid json"}),
        );
        return;
    };
    let request_id = Uuid::new_v4().to_string();
    let is_work_proposal = request.method == "proposeWorkUpdate";
    let (sender, receiver) = mpsc::channel();
    if let Ok(mut requests) = pending.lock() {
        requests.insert(request_id.clone(), sender);
    } else {
        response(
            &mut stream,
            "503 Service Unavailable",
            json!({"error":"bridge unavailable"}),
        );
        return;
    }
    let payload = json!({"id":request_id,"method":request.method,"params":request.params});
    if app.emit("trace-kernel://mcp/request", payload).is_err() {
        if let Ok(mut requests) = pending.lock() {
            requests.remove(&request_id);
        }
        response(
            &mut stream,
            "503 Service Unavailable",
            json!({"error":"webview unavailable"}),
        );
        return;
    }
    let timeout = if is_work_proposal {
        WORK_PROPOSAL_TIMEOUT
    } else {
        DEFAULT_REQUEST_TIMEOUT
    };
    let _ = stream.set_read_timeout(Some(timeout));
    match receiver.recv_timeout(timeout) {
        Ok(value) => response(
            &mut stream,
            "200 OK",
            json!({"ok":value.error.is_none(),"result":value.result,"error":value.error}),
        ),
        Err(_) => {
            if let Ok(mut requests) = pending.lock() {
                requests.remove(&request_id);
            }
            let _ = app.emit(
                "trace-kernel://mcp/cancel",
                json!({"id":request_id,"reason":"timeout_or_disconnect"}),
            );
            response(
                &mut stream,
                "504 Gateway Timeout",
                json!({"error":"webview timeout"}),
            );
        }
    }
}

fn run(
    listener: TcpListener,
    app: AppHandle,
    session_id: String,
    token: String,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>>,
    stop: Arc<AtomicBool>,
) {
    listener.set_nonblocking(true).ok();
    while !stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((stream, _)) => {
                let thread_app = app.clone();
                let thread_session = session_id.clone();
                let thread_token = token.clone();
                let thread_pending = Arc::clone(&pending);
                let _ = thread::Builder::new()
                    .name("trace-kernel-mcp-request".into())
                    .spawn(move || {
                        handle(
                            stream,
                            &thread_app,
                            &thread_session,
                            &thread_token,
                            &thread_pending,
                        )
                    });
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20))
            }
            Err(_) => break,
        }
    }
}

#[tauri::command]
pub fn mcp_start_session(
    app: AppHandle,
    state: State<'_, McpState>,
) -> Result<McpSessionInfo, String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "MCP state unavailable".to_string())?;
    if active.is_some() {
        return Err("MCP session is already running".to_string());
    }
    let listener =
        TcpListener::bind((IpAddr::V4(Ipv4Addr::LOCALHOST), 0)).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_app = app.clone();
    let thread_id = session_id.clone();
    let thread_token = token.clone();
    let pending = Arc::clone(&state.pending);
    let thread = thread::Builder::new()
        .name("trace-kernel-mcp-bridge".into())
        .spawn(move || {
            run(
                listener,
                thread_app,
                thread_id,
                thread_token,
                pending,
                thread_stop,
            )
        })
        .map_err(|e| e.to_string())?;
    let descriptor_path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("mcp/sessions")
        .join(format!("{session_id}.json"));
    if let Some(parent) = descriptor_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let descriptor = SessionDescriptor {
        session_id: session_id.clone(),
        endpoint: format!("http://{address}"),
        token: token.clone(),
    };
    std::fs::write(
        &descriptor_path,
        serde_json::to_vec(&descriptor).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    *active = Some(ActiveSession {
        descriptor_path,
        stop,
        thread: Some(thread),
    });
    Ok(McpSessionInfo {
        session_id,
        endpoint: format!("http://{address}"),
    })
}

#[tauri::command]
pub fn mcp_stop_session(app: AppHandle, state: State<'_, McpState>) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "MCP state unavailable".to_string())?;
    if let Some(mut session) = active.take() {
        session.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = session.thread.take() {
            let _ = thread.join();
        }
        let _ = std::fs::remove_file(session.descriptor_path);
    }
    let pending = state
        .pending
        .lock()
        .map_err(|_| "MCP pending requests unavailable".to_string())?
        .drain()
        .collect::<Vec<_>>();
    for (id, sender) in pending {
        let _ = app.emit(
            "trace-kernel://mcp/cancel",
            serde_json::json!({"id":id,"reason":"session_stopped"}),
        );
        let _ = sender.send(BridgeResponse {
            result: serde_json::json!({"status":"cancelled","message":"MCP session stopped; no changes were applied."}),
            error: None,
        });
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_session_status(state: State<'_, McpState>) -> Result<bool, String> {
    Ok(state
        .active
        .lock()
        .map_err(|_| "MCP state unavailable".to_string())?
        .is_some())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpResponse {
    pub id: String,
    pub result: serde_json::Value,
    pub error: Option<serde_json::Value>,
}

#[tauri::command]
pub fn mcp_respond(state: State<'_, McpState>, response: McpResponse) -> Result<(), String> {
    let sender = state
        .pending
        .lock()
        .map_err(|_| "MCP state unavailable".to_string())?
        .remove(&response.id);
    let Some(sender) = sender else {
        return Err("MCP request is no longer pending".to_string());
    };
    sender
        .send(BridgeResponse {
            result: response.result,
            error: response.error,
        })
        .map_err(|_| "MCP bridge is no longer waiting".to_string())
}
