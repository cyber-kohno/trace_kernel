use super::*;
use std::{
    net::TcpListener,
    sync::{mpsc, Arc},
    thread,
};

// Exercise the production Desktop bridge without adding native-core's heavy I/O
// dependencies to the MCP executable. This source only needs serde/json/uuid.
#[path = "../../../crates/native-core/src/mcp.rs"]
mod native_bridge;

struct Desktop {
    root: PathBuf,
    state: native_bridge::McpState,
    events: native_bridge::EventSink,
    receiver: mpsc::Receiver<(String, Value)>,
    info: native_bridge::McpSessionInfo,
}

impl Desktop {
    fn new(generation: u32) -> Self {
        let root =
            env::temp_dir().join(format!("trace-kernel-mcp-client-{}", uuid::Uuid::new_v4()));
        let state = native_bridge::McpState::default();
        let (sender, receiver) = mpsc::channel();
        let events: native_bridge::EventSink = Arc::new(move |name, value| {
            sender
                .send((name.into(), value))
                .map_err(|_| "test receiver closed".into())
        });
        let mut identity = crate::product_info::identity();
        identity.release_version = "9.9.9".into(); // Same contract, different product release.
        identity.bridge_protocol_gen = generation;
        let info = native_bridge::start_session(events.clone(), &state, &root, identity).unwrap();
        Self {
            root,
            state,
            events,
            receiver,
            info,
        }
    }

    fn descriptor(&self) -> SessionDescriptor {
        find(&self.root, &self.info.session_id).unwrap()
    }
}

impl Drop for Desktop {
    fn drop(&mut self) {
        let _ = native_bridge::stop_session(&self.events, &self.state);
        let _ = fs::remove_dir(&self.root);
    }
}

#[test]
fn real_desktop_calls_accept_different_product_versions_and_publish_connection_context() {
    let desktop = Desktop::new(crate::product_info::identity().bridge_protocol_gen);
    let view = probe(&desktop.descriptor());
    assert!(view.compatible);
    assert_eq!(view.identity.unwrap().release_version, "9.9.9");
    let root = desktop.root.clone();
    let id = desktop.info.session_id.clone();
    let request = thread::spawn(move || {
        call_in_directory(
            &root,
            &id,
            "getWorkContext",
            json!({"method":"channel"}),
            Duration::from_secs(2),
        )
    });
    let (name, payload) = desktop
        .receiver
        .recv_timeout(Duration::from_secs(2))
        .unwrap();
    assert_eq!(name, "trace-kernel://mcp/request");
    assert_eq!(payload["method"], "getWorkContext");
    assert_eq!(payload["params"]["method"], "channel");
    native_bridge::respond(
        &desktop.state,
        native_bridge::McpResponse {
            id: payload["id"].as_str().unwrap().into(),
            result: json!({"apiDeclarations":"live declarations"}),
            error: None,
        },
    )
    .unwrap();
    let result = request.join().unwrap().unwrap();
    assert_eq!(result["apiDeclarations"], "live declarations");
    assert_eq!(
        result["mcpConnection"]["desktopIdentity"]["releaseVersion"],
        "9.9.9"
    );
    assert_eq!(
        result["mcpConnection"]["contract"]["bridgeProtocolGen"],
        crate::product_info::identity().bridge_protocol_gen
    );
    assert!(!result.to_string().contains("token"));
}

#[test]
fn incompatible_sessions_remain_visible_and_are_not_called() {
    let desktop = Desktop::new(crate::product_info::identity().bridge_protocol_gen + 1);
    let view = probe(&desktop.descriptor());
    assert_eq!(view.status, "incompatible");
    let public = serde_json::to_string(&view).unwrap();
    assert!(public.contains("MCP_BRIDGE_GENERATION_MISMATCH"));
    assert!(!public.contains(&desktop.descriptor().token));
    for method in ["getWork", "createWork", "proposeWorkUpdate"] {
        let result = call_in_directory(
            &desktop.root,
            &desktop.info.session_id,
            method,
            json!({}),
            Duration::from_secs(1),
        )
        .unwrap_err();
        assert!(result.contains("MCP_BRIDGE_GENERATION_MISMATCH"));
        assert!(!result.contains("Session not found"));
    }
    assert!(desktop.receiver.try_recv().is_err());
}

#[test]
fn stale_descriptor_is_detected_and_missing_diagnostic_metadata_does_not_gate_health() {
    let desktop = Desktop::new(crate::product_info::identity().bridge_protocol_gen);
    let mut descriptor = desktop.descriptor();
    descriptor.contract = Some(json!({"bridgeProtocolGen":99}));
    let view = probe(&descriptor);
    assert_eq!(view.status, "invalid");
    assert_eq!(view.error.unwrap()["code"], "MCP_DESCRIPTOR_MISMATCH");
    descriptor.contract = None; // Discovery hint is not the health authority.
    descriptor.identity = Some(json!({"releaseVersion":"ignored"}));
    assert!(probe(&descriptor).compatible);
}

#[test]
fn one_directory_exposes_compatible_and_incompatible_sessions_without_credentials() {
    let current = crate::product_info::identity().bridge_protocol_gen;
    let first = Desktop::new(current);
    let second = Desktop::new(current + 1);
    let copied = first.root.join("second.json");
    fs::write(&copied, serde_json::to_vec(&second.descriptor()).unwrap()).unwrap();
    let views = session_views(&first.root);
    assert_eq!(views.len(), 2);
    assert!(views
        .iter()
        .any(|view| view.session_id == first.info.session_id && view.compatible));
    assert!(views
        .iter()
        .any(|view| view.session_id == second.info.session_id && view.status == "incompatible"));
    let public = serde_json::to_string(&views).unwrap();
    assert!(!public.contains(&first.descriptor().token));
    assert!(!public.contains(&second.descriptor().token));
    fs::remove_file(copied).unwrap();
    let duplicate = first.root.join("duplicate.json");
    fs::write(&duplicate, serde_json::to_vec(&first.descriptor()).unwrap()).unwrap();
    assert!(session_views(&first.root)
        .iter()
        .all(|view| !view.compatible && view.status == "invalid"));
    assert!(call_in_directory(
        &first.root,
        &first.info.session_id,
        "createWork",
        json!({}),
        Duration::from_secs(1)
    )
    .unwrap_err()
    .contains("MCP_DESCRIPTOR_AMBIGUOUS"));
    fs::remove_file(duplicate).unwrap();
}

#[test]
fn compatibility_is_checked_fresh_and_independently_for_each_session() {
    let current = crate::product_info::identity().bridge_protocol_gen;
    let first = Desktop::new(current);
    let second = Desktop::new(current + 1);
    assert!(probe(&first.descriptor()).compatible);
    assert!(!probe(&second.descriptor()).compatible);
    assert!(probe(&first.descriptor()).compatible);
    let mut descriptor = first.descriptor();
    descriptor.session_id = "different-session".into();
    let view = probe(&descriptor);
    assert_eq!(view.error.unwrap()["code"], "MCP_SESSION_MISMATCH");
    native_bridge::stop_session(&first.events, &first.state).unwrap();
    assert!(!probe(&descriptor).compatible);
}

fn read_request(stream: &mut TcpStream) -> Vec<u8> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 1024];
    loop {
        let count = stream.read(&mut buffer).unwrap();
        assert_ne!(count, 0);
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(end) = bytes
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .map(|index| index + 4)
        {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let length: usize = headers
                .lines()
                .find_map(|line| line.strip_prefix("Content-Length: "))
                .map(|value| value.parse().unwrap())
                .unwrap_or(0);
            if bytes.len() >= end + length {
                return bytes;
            }
        }
    }
}

fn stub(response: Vec<u8>, trickle: bool) -> (SessionDescriptor, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let worker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        read_request(&mut stream);
        if trickle {
            for byte in response {
                if stream.write_all(&[byte]).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(20));
            }
        } else {
            let _ = stream.write_all(&response);
        }
    });
    (
        SessionDescriptor {
            session_id: "test-session".into(),
            endpoint,
            token: "test-token".into(),
            contract: None,
            identity: None,
        },
        worker,
    )
}

fn health_stub(value: Value) -> (SessionDescriptor, thread::JoinHandle<()>) {
    let body = value.to_string();
    stub(
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes(),
        false,
    )
}

#[test]
fn legacy_and_malformed_health_have_explicit_noncompatible_status() {
    for (contract, status, code) in [
        (None, "legacy", "MCP_CONTRACT_REQUIRED"),
        (
            Some(json!({"bridgeProtocolGen":"1"})),
            "invalid",
            "MCP_CONTRACT_INVALID",
        ),
        (
            Some(json!({"bridgeProtocolGen":0})),
            "invalid",
            "MCP_BRIDGE_GENERATION_INVALID",
        ),
    ] {
        let mut value = json!({"ok":true,"sessionId":"test-session"});
        if let Some(contract) = contract {
            value["contract"] = contract;
        }
        let (session, worker) = health_stub(value);
        let view = probe(&session);
        assert!(!view.compatible);
        assert_eq!(view.status, status);
        assert_eq!(view.error.unwrap()["code"], code);
        worker.join().unwrap();
    }
}

#[test]
fn legacy_or_foreign_generation_prevents_post_not_just_host_events() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    for contract in [
        None,
        Some(json!({"bridgeProtocolGen":crate::product_info::identity().bridge_protocol_gen+1})),
    ] {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let root =
            env::temp_dir().join(format!("trace-kernel-mcp-no-post-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let descriptor = SessionDescriptor {
            session_id: "no-post".into(),
            endpoint: format!("http://{}", listener.local_addr().unwrap()),
            token: "test-token".into(),
            contract: None,
            identity: None,
        };
        fs::write(
            root.join("session.json"),
            serde_json::to_vec(&descriptor).unwrap(),
        )
        .unwrap();
        let posts = Arc::new(AtomicUsize::new(0));
        let done = Arc::new(AtomicBool::new(false));
        let count = posts.clone();
        let stop = done.clone();
        let worker = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(3);
            while !stop.load(Ordering::SeqCst) && Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let incoming = read_request(&mut stream);
                        let body = if incoming.starts_with(b"POST ") {
                            count.fetch_add(1, Ordering::SeqCst);
                            json!({"ok":true,"result":{}})
                        } else {
                            json!({"ok":true,"sessionId":"no-post","contract":contract})
                        }
                        .to_string();
                        let _ = stream.write_all(
                            format!(
                                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
                                body.len()
                            )
                            .as_bytes(),
                        );
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5))
                    }
                    Err(_) => break,
                }
            }
        });
        let result = call_in_directory(
            &root,
            "no-post",
            "createWork",
            json!({}),
            Duration::from_secs(1),
        );
        done.store(true, Ordering::SeqCst);
        worker.join().unwrap();
        assert!(result.is_err());
        assert_eq!(posts.load(Ordering::SeqCst), 0);
        fs::remove_file(root.join("session.json")).unwrap();
        fs::remove_dir(root).unwrap();
    }
}

#[test]
fn diagnostic_fields_are_not_compatibility_conditions_or_a_secret_forwarding_channel() {
    let (session, worker) = health_stub(
        json!({"ok":true,"sessionId":"test-session", "contract":crate::product_info::identity().bridge_contract(),
        "identity":{"releaseVersion":"8.8.8","bridgeProtocolGen":55,"apiGen":"99","workspaceGen":"99","token":"hidden-secret"}}),
    );
    let view = probe(&session);
    assert!(view.compatible);
    assert_eq!(view.identity.as_ref().unwrap().release_version, "8.8.8");
    assert!(!serde_json::to_string(&view)
        .unwrap()
        .contains("hidden-secret"));
    worker.join().unwrap();
    let (session, worker) = health_stub(
        json!({"ok":true,"sessionId":"test-session", "contract":crate::product_info::identity().bridge_contract(),"identity":"not metadata"}),
    );
    let view = probe(&session);
    assert!(view.compatible);
    assert!(view.identity.is_none());
    worker.join().unwrap();
}

#[test]
fn health_requires_exact_session_boolean_and_http_status_not_substring_matches() {
    for value in [
        json!({"ok":true,"sessionId":"other","note":"test-session"}),
        json!({"ok":"true","sessionId":"test-session"}),
        json!({"ok":false,"sessionId":"test-session"}),
    ] {
        let (session, worker) = health_stub(value);
        assert!(!probe(&session).compatible);
        worker.join().unwrap();
    }
    let (session, worker) = stub(
        b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 2\r\n\r\n{}".to_vec(),
        false,
    );
    assert_eq!(probe(&session).error.unwrap()["code"], "MCP_HEALTH_FAILED");
    worker.join().unwrap();
}

#[test]
fn http_transport_is_bounded_and_rejects_malformed_framing_without_echoing_raw_data() {
    for response in [
        b"HTTP/1.1 200 OK\r\nContent-Length: 33554433\r\n\r\n".to_vec(),
        b"HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\n{}".to_vec(),
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}".to_vec(),
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n".to_vec(),
        b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\n\r\nsecret".to_vec(),
        vec![b'a'; MAX_HEADER + 1],
    ] {
        let (session, worker) = stub(response, false);
        let error = request(&session, None, Duration::from_secs(1)).unwrap_err();
        assert!(error.contains("MCP_RESPONSE_INVALID"));
        assert!(!error.contains("secret"));
        worker.join().unwrap();
    }
    let (session, worker) = stub(vec![b'a'; 20], true);
    let started = Instant::now();
    assert!(request(&session, None, Duration::from_millis(80))
        .unwrap_err()
        .contains("MCP_TIMEOUT"));
    assert!(started.elapsed() < Duration::from_secs(1));
    worker.join().unwrap();
}

#[test]
fn endpoints_and_credentials_cannot_redirect_or_inject_headers() {
    for address in [
        "http://192.0.2.1:80",
        "http://example.com:80",
        "https://127.0.0.1:80",
        "http://127.0.0.1:80/path",
        "http://127.0.0.1:0",
    ] {
        let session = SessionDescriptor {
            session_id: "x".into(),
            endpoint: address.into(),
            token: "test".into(),
            contract: None,
            identity: None,
        };
        assert!(endpoint(&session).is_err());
    }
    let mut session = SessionDescriptor {
        session_id: "x".into(),
        endpoint: "http://127.0.0.1:80".into(),
        token: "test".into(),
        contract: None,
        identity: None,
    };
    assert!(endpoint(&session).is_ok());
    session.token = "secret\r\nInjected: header".into();
    let error = endpoint(&session).unwrap_err();
    assert!(!error.contains("secret"));
}

#[test]
fn desktop_compatibility_error_is_preserved_even_after_a_successful_health_probe() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let root = env::temp_dir().join(format!("trace-kernel-mcp-race-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let session = SessionDescriptor {
        session_id: "race".into(),
        endpoint: format!("http://{}", listener.local_addr().unwrap()),
        token: "test-token".into(),
        contract: None,
        identity: None,
    };
    fs::write(
        root.join("race.json"),
        serde_json::to_vec(&session).unwrap(),
    )
    .unwrap();
    let worker = thread::spawn(move || {
        for (status, value) in [
            (
                "200 OK",
                json!({"ok":true,"sessionId":"race","contract":crate::product_info::identity().bridge_contract()}),
            ),
            (
                "409 Conflict",
                json!({"ok":false,"error":{"code":"MCP_BRIDGE_GENERATION_MISMATCH","message":"restart matching generation","expectedContract":{"bridgeProtocolGen":2},"actualContract":{"bridgeProtocolGen":1}}}),
            ),
        ] {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            let body = value.to_string();
            let _ = stream.write_all(
                format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\n\r\n{body}",
                    body.len()
                )
                .as_bytes(),
            );
        }
    });
    let error = call_in_directory(
        &root,
        "race",
        "createWork",
        json!({}),
        Duration::from_secs(2),
    )
    .unwrap_err();
    let error: Value = serde_json::from_str(&error).unwrap();
    assert_eq!(error["code"], "MCP_BRIDGE_GENERATION_MISMATCH");
    assert_eq!(error["expectedContract"]["bridgeProtocolGen"], 2);
    worker.join().unwrap();
    fs::remove_file(root.join("race.json")).unwrap();
    fs::remove_dir(root).unwrap();
}
