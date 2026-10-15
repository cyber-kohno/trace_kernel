use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Enqueue a host event. Publication holds the pending-request lock to keep it
/// ordered with stop; the callback must not synchronously call respond/stop.
pub type EventSink = Arc<dyn Fn(&str, serde_json::Value) -> Result<(), String> + Send + Sync>;

const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const WORK_PROPOSAL_TIMEOUT: Duration = Duration::from_secs(600);
const REQUEST_READ_DEADLINE: Duration = Duration::from_secs(10);
const REQUEST_IO_POLL: Duration = Duration::from_millis(200);
const MAX_REQUEST_THREADS: usize = 32;

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
    thread: Option<JoinHandle<Result<(), String>>>,
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
    app: &EventSink,
    session_id: &str,
    token: &str,
    pending: &Arc<Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>>,
    stop: &AtomicBool,
) {
    let _ = stream.set_read_timeout(Some(REQUEST_IO_POLL));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let read_deadline = Instant::now() + REQUEST_READ_DEADLINE;
    let mut data = Vec::new();
    let mut buf = [0u8; 4096];
    loop {
        if stop.load(Ordering::Relaxed) || Instant::now() >= read_deadline {
            return;
        }
        let count = match stream.read(&mut buf) {
            Ok(count) => count,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue
            }
            Err(_) => return,
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
    let Some(expected_length) = header_end.checked_add(content_length) else {
        response(
            &mut stream,
            "413 Payload Too Large",
            json!({"error":"request too large"}),
        );
        return;
    };
    if expected_length > MAX_BODY_BYTES {
        response(
            &mut stream,
            "413 Payload Too Large",
            json!({"error":"request too large"}),
        );
        return;
    }
    while data.len() < expected_length {
        if stop.load(Ordering::Relaxed) || Instant::now() >= read_deadline {
            return;
        }
        let count = match stream.read(&mut buf) {
            Ok(count) => count,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                continue
            }
            Err(_) => return,
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
    let Ok(request) = serde_json::from_slice::<BridgeRequest>(&data[header_end..expected_length])
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
    let payload = json!({"id":request_id,"method":request.method,"params":request.params});
    let published = match pending.lock() {
        Ok(mut requests) => {
            if stop.load(Ordering::SeqCst) {
                Err("bridge stopping")
            } else {
                requests.insert(request_id.clone(), sender);
                if app("trace-kernel://mcp/request", payload).is_err() {
                    requests.remove(&request_id);
                    Err("webview unavailable")
                } else {
                    Ok(())
                }
            }
        }
        Err(_) => Err("bridge unavailable"),
    };
    if let Err(error) = published {
        response(
            &mut stream,
            "503 Service Unavailable",
            json!({"error":error}),
        );
        return;
    }
    let timeout = if is_work_proposal {
        WORK_PROPOSAL_TIMEOUT
    } else {
        DEFAULT_REQUEST_TIMEOUT
    };
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
            let _ = app(
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

fn join_finished(threads: &mut Vec<JoinHandle<()>>, failures: &mut Vec<String>) {
    let mut index = 0;
    while index < threads.len() {
        if threads[index].is_finished() {
            if threads.swap_remove(index).join().is_err() {
                failures.push("MCP request thread panicked".to_string());
            }
        } else {
            index += 1;
        }
    }
}

fn run(
    listener: TcpListener,
    app: EventSink,
    session_id: String,
    token: String,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>>,
    stop: Arc<AtomicBool>,
) -> Result<(), String> {
    let mut threads = Vec::new();
    let mut failures = Vec::new();
    while !stop.load(Ordering::SeqCst) {
        join_finished(&mut threads, &mut failures);
        match listener.accept() {
            Ok((mut stream, _)) => {
                if threads.len() >= MAX_REQUEST_THREADS {
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                    response(
                        &mut stream,
                        "503 Service Unavailable",
                        json!({"error":"bridge busy"}),
                    );
                    continue;
                }
                let thread_app = app.clone();
                let thread_session = session_id.clone();
                let thread_token = token.clone();
                let thread_pending = Arc::clone(&pending);
                let thread_stop = Arc::clone(&stop);
                match thread::Builder::new()
                    .name("trace-kernel-mcp-request".into())
                    .spawn(move || {
                        handle(
                            stream,
                            &thread_app,
                            &thread_session,
                            &thread_token,
                            &thread_pending,
                            &thread_stop,
                        )
                    }) {
                    Ok(thread) => threads.push(thread),
                    Err(error) => {
                        failures.push(format!("MCP request thread spawn failed: {error}"))
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20))
            }
            Err(error) => {
                failures.push(format!("MCP listener accept failed: {error}"));
                break;
            }
        }
    }
    for thread in threads {
        if thread.join().is_err() {
            failures.push("MCP request thread panicked".to_string());
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

pub fn start_session(
    app: EventSink,
    state: &McpState,
    descriptor_directory: &Path,
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
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let session_id = Uuid::new_v4().to_string();
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let descriptor_path = descriptor_directory.join(format!("{session_id}.json"));
    if let Some(parent) = descriptor_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let descriptor = SessionDescriptor {
        session_id: session_id.clone(),
        endpoint: format!("http://{address}"),
        token: token.clone(),
    };
    if let Err(error) = std::fs::write(
        &descriptor_path,
        serde_json::to_vec(&descriptor).map_err(|e| e.to_string())?,
    ) {
        let cleanup = std::fs::remove_file(&descriptor_path);
        return Err(match cleanup {
            Ok(()) => error.to_string(),
            Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => {
                error.to_string()
            }
            Err(cleanup_error) => {
                format!("{error}; MCP descriptor cleanup failed: {cleanup_error}")
            }
        });
    }
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_app = app.clone();
    let thread_id = session_id.clone();
    let thread_token = token.clone();
    let pending = Arc::clone(&state.pending);
    let thread = match thread::Builder::new()
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
        }) {
        Ok(thread) => thread,
        Err(error) => {
            let cleanup = std::fs::remove_file(&descriptor_path);
            return Err(match cleanup {
                Ok(()) => error.to_string(),
                Err(cleanup_error) => {
                    format!("{error}; MCP descriptor cleanup failed: {cleanup_error}")
                }
            });
        }
    };
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

fn stop_active_session(
    active: &mut Option<ActiveSession>,
    pending: &Mutex<HashMap<String, mpsc::Sender<BridgeResponse>>>,
    mut emit_cancel: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(session) = active.as_ref() {
        session.stop.store(true, Ordering::SeqCst);
    }
    let mut failures = Vec::new();
    let requests = match pending.lock() {
        Ok(mut requests) => requests.drain().collect::<Vec<_>>(),
        Err(poisoned) => {
            failures.push("MCP pending requests mutex poisoned".to_string());
            poisoned.into_inner().drain().collect::<Vec<_>>()
        }
    };
    for (id, sender) in requests {
        if let Err(error) = emit_cancel(&id) {
            failures.push(format!("MCP cancellation event failed: {error}"));
        }
        let _ = sender.send(BridgeResponse {
            result: json!({"status":"cancelled","message":"MCP session stopped; no changes were applied."}),
            error: None,
        });
    }
    if let Some(session) = active.as_mut() {
        if let Some(thread) = session.thread.take() {
            match thread.join() {
                Ok(Ok(())) => {}
                Ok(Err(error)) => failures.push(error),
                Err(_) => failures.push("MCP listener thread panicked".to_string()),
            }
        }
        match std::fs::remove_file(&session.descriptor_path) {
            Ok(()) => *active = None,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => *active = None,
            Err(error) => failures.push(format!("MCP descriptor cleanup failed: {error}")),
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
}

pub fn stop_session(app: &EventSink, state: &McpState) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "MCP state unavailable".to_string())?;
    stop_active_session(&mut active, &state.pending, |id| {
        app(
            "trace-kernel://mcp/cancel",
            json!({"id":id,"reason":"session_stopped"}),
        )
        .map_err(|error| error.to_string())
    })
}

pub fn session_status(state: &McpState) -> Result<bool, String> {
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

pub fn respond(state: &McpState, response: McpResponse) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (
        McpState,
        EventSink,
        mpsc::Receiver<(String, serde_json::Value)>,
        std::path::PathBuf,
        McpSessionInfo,
        String,
    ) {
        let root = std::env::temp_dir().join(format!("trace-kernel-mcp-native-{}", Uuid::new_v4()));
        let state = McpState::default();
        let (sender, receiver) = mpsc::channel();
        let events: EventSink = Arc::new(move |event, payload| {
            sender
                .send((event.into(), payload))
                .map_err(|e| e.to_string())
        });
        let info = start_session(events.clone(), &state, &root).unwrap();
        let descriptor: serde_json::Value = serde_json::from_slice(
            &std::fs::read(root.join(format!("{}.json", info.session_id))).unwrap(),
        )
        .unwrap();
        let token = descriptor["token"].as_str().unwrap().to_owned();
        (state, events, receiver, root, info, token)
    }

    fn exchange(endpoint: &str, token: &str, body: Option<&str>) -> String {
        let mut stream = TcpStream::connect(endpoint.strip_prefix("http://").unwrap()).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let request = if let Some(body) = body {
            format!("POST /bridge HTTP/1.1\r\nAuthorization: Bearer {token}\r\nContent-Length: {}\r\n\r\n{body}",body.len())
        } else {
            format!("GET /health HTTP/1.1\r\nAuthorization: Bearer {token}\r\n\r\n")
        };
        stream.write_all(request.as_bytes()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn real_bridge_authentication_host_response_and_descriptor_cleanup() {
        let (state, events, receiver, root, info, token) = fixture();
        assert!(session_status(&state).unwrap());
        assert!(exchange(&info.endpoint, "incorrect", None).starts_with("HTTP/1.1 401"));
        assert!(exchange(&info.endpoint, &token, None).contains(&info.session_id));
        let endpoint = info.endpoint.clone();
        let request = thread::spawn(move || {
            exchange(
                &endpoint,
                &token,
                Some(r#"{"method":"inspect","params":{"value":3}}"#),
            )
        });
        let (name, payload) = receiver.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(name, "trace-kernel://mcp/request");
        assert_eq!(payload["method"], "inspect");
        assert_eq!(payload["params"]["value"], 3);
        let id = payload["id"].as_str().unwrap().to_owned();
        respond(
            &state,
            McpResponse {
                id: id.clone(),
                result: json!({"answer":4}),
                error: None,
            },
        )
        .unwrap();
        let response = request.join().unwrap();
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.contains(r#""answer":4"#));
        assert!(respond(
            &state,
            McpResponse {
                id,
                result: json!(null),
                error: None
            }
        )
        .is_err());
        stop_session(&events, &state).unwrap();
        assert!(!session_status(&state).unwrap());
        assert!(!root.join(format!("{}.json", info.session_id)).exists());
        assert!(TcpStream::connect(info.endpoint.strip_prefix("http://").unwrap()).is_err());
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn real_pending_bridge_is_cancelled_before_stop_joins_its_request_thread() {
        let (state, events, receiver, root, info, token) = fixture();
        let endpoint = info.endpoint.clone();
        let request = thread::spawn(move || {
            exchange(&endpoint, &token, Some(r#"{"method":"proposeWorkUpdate"}"#))
        });
        let (_, payload) = receiver.recv_timeout(Duration::from_secs(3)).unwrap();
        let started = Instant::now();
        stop_session(&events, &state).unwrap();
        assert!(started.elapsed() < Duration::from_secs(3));
        let (event, cancel) = receiver.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(event, "trace-kernel://mcp/cancel");
        assert_eq!(cancel["id"], payload["id"]);
        assert_eq!(cancel["reason"], "session_stopped");
        assert!(request.join().unwrap().contains(r#""status":"cancelled""#));
        assert!(state.pending.lock().unwrap().is_empty());
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn failed_host_publication_releases_pending_request() {
        let root = std::env::temp_dir().join(format!("trace-kernel-mcp-native-{}", Uuid::new_v4()));
        let state = McpState::default();
        let events: EventSink = Arc::new(|_, _| Err("host unavailable".into()));
        let info = start_session(events.clone(), &state, &root).unwrap();
        let descriptor: serde_json::Value = serde_json::from_slice(
            &std::fs::read(root.join(format!("{}.json", info.session_id))).unwrap(),
        )
        .unwrap();
        let response = exchange(
            &info.endpoint,
            descriptor["token"].as_str().unwrap(),
            Some(r#"{"method":"inspect"}"#),
        );
        assert!(response.starts_with("HTTP/1.1 503"));
        assert!(state.pending.lock().unwrap().is_empty());
        stop_session(&events, &state).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn stop_releases_pending_request_before_joining_listener() {
        let descriptor_path =
            std::env::temp_dir().join(format!("trace-kernel-mcp-{}.json", Uuid::new_v4()));
        std::fs::write(&descriptor_path, b"{}").unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let pending = Mutex::new(HashMap::new());
        let (sender, receiver) = mpsc::channel::<BridgeResponse>();
        pending
            .lock()
            .unwrap()
            .insert("request-1".to_string(), sender);
        let thread = thread::spawn(move || {
            let cancelled = receiver
                .recv_timeout(Duration::from_secs(2))
                .map_err(|e| e.to_string())?;
            if cancelled.result["status"] != "cancelled" {
                return Err("request was not cancelled".to_string());
            }
            Ok(())
        });
        let mut active = Some(ActiveSession {
            descriptor_path: descriptor_path.clone(),
            stop: Arc::clone(&stop),
            thread: Some(thread),
        });
        let mut cancelled_ids = Vec::new();
        stop_active_session(&mut active, &pending, |id| {
            cancelled_ids.push(id.to_string());
            Ok(())
        })
        .unwrap();
        assert!(active.is_none());
        assert!(stop.load(Ordering::SeqCst));
        assert_eq!(cancelled_ids, ["request-1"]);
        assert!(pending.lock().unwrap().is_empty());
        assert!(!descriptor_path.exists());
    }

    #[test]
    fn descriptor_cleanup_failure_keeps_session_retryable() {
        let descriptor_path =
            std::env::temp_dir().join(format!("trace-kernel-mcp-{}", Uuid::new_v4()));
        std::fs::create_dir(&descriptor_path).unwrap();
        let mut active = Some(ActiveSession {
            descriptor_path: descriptor_path.clone(),
            stop: Arc::new(AtomicBool::new(false)),
            thread: None,
        });
        let pending = Mutex::new(HashMap::new());
        let failure = stop_active_session(&mut active, &pending, |_| Ok(())).unwrap_err();
        assert!(failure.contains("descriptor cleanup failed"));
        assert!(active.is_some());
        std::fs::remove_dir(&descriptor_path).unwrap();
        stop_active_session(&mut active, &pending, |_| Ok(())).unwrap();
        assert!(active.is_none());
    }
}
