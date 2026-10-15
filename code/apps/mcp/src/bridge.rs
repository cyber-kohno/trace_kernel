//! Authenticated, bounded loopback transport. Internal descriptors never become
//! tool results; public session views are built from an authenticated health probe.
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use trace_kernel_mcp_protocol::{
    check_compatibility, compatibility_failure, decode_contract, BridgeContract, BridgeRequest,
    HealthResponse, ProductIdentity, SessionDescriptor,
};

const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_HEADER: usize = 16 * 1024;
const MAX_RESPONSE: usize = 32 * 1024 * 1024;
const MAX_DESCRIPTOR: u64 = 16 * 1024;
const MAX_REQUEST: usize = 4 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub session_id: String,
    pub endpoint: String,
    pub status: &'static str,
    pub compatible: bool,
    pub contract: Option<BridgeContract>,
    pub identity: Option<ProductIdentity>,
    pub mcp_contract: BridgeContract,
    pub error: Option<Value>,
}

fn failure(code: &str, message: &str) -> String {
    json!({"code":code,"message":message}).to_string()
}

fn sessions_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let base = env::var_os("LOCALAPPDATA");
    #[cfg(not(windows))]
    let base = env::var_os("XDG_DATA_HOME");
    base.map(PathBuf::from)
        .map(|p| p.join("jp.hkdev.tk/mcp/sessions"))
}

fn endpoint(session: &SessionDescriptor) -> Result<SocketAddr, String> {
    let address = session
        .endpoint
        .strip_prefix("http://")
        .and_then(|value| value.parse::<SocketAddr>().ok())
        .filter(|address| address.ip().is_loopback() && address.port() != 0)
        .ok_or_else(|| {
            failure(
                "MCP_DESCRIPTOR_INVALID",
                "Invalid loopback session endpoint.",
            )
        })?;
    if session.token.is_empty()
        || session.token.len() > 512
        || !session
            .token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
    {
        return Err(failure(
            "MCP_DESCRIPTOR_INVALID",
            "Invalid session credential format.",
        ));
    }
    Ok(address)
}

fn descriptors(directory: &Path) -> Vec<SessionDescriptor> {
    fs::read_dir(directory)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| {
            // Bound local file reads too, and ignore directories/symlinks.
            if !entry.file_type().ok()?.is_file() {
                return None;
            }
            let mut bytes = Vec::new();
            fs::File::open(entry.path())
                .ok()?
                .take(MAX_DESCRIPTOR + 1)
                .read_to_end(&mut bytes)
                .ok()?;
            if bytes.len() as u64 > MAX_DESCRIPTOR {
                return None;
            }
            let descriptor: SessionDescriptor = serde_json::from_slice(&bytes).ok()?;
            if descriptor.session_id.is_empty()
                || descriptor.session_id.len() > 128
                || !descriptor
                    .session_id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
                || endpoint(&descriptor).is_err()
            {
                return None;
            }
            Some(descriptor)
        })
        .collect()
}

fn remaining(deadline: Instant) -> Result<Duration, String> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|duration| !duration.is_zero())
        .ok_or_else(|| failure("MCP_TIMEOUT", "Desktop response deadline exceeded."))
}

/// Content-Length framed HTTP with an absolute deadline, not an unbounded
/// read_to_end or a per-read timeout that a trickling peer can extend forever.
fn request(
    session: &SessionDescriptor,
    body: Option<&[u8]>,
    timeout: Duration,
) -> Result<(u16, Value), String> {
    let address = endpoint(session)?;
    let deadline = Instant::now() + timeout;
    let mut stream = TcpStream::connect_timeout(
        &address,
        remaining(deadline)?.min(Duration::from_millis(500)),
    )
    .map_err(|_| failure("MCP_UNREACHABLE", "Desktop session is unreachable."))?;
    let mut bytes = if let Some(body) = body {
        format!("POST /bridge HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", session.token, body.len()).into_bytes()
    } else {
        format!("GET /health HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n", session.token).into_bytes()
    };
    if let Some(body) = body {
        bytes.extend_from_slice(body);
    }
    let mut written = 0;
    while written < bytes.len() {
        stream
            .set_write_timeout(Some(remaining(deadline)?.min(Duration::from_millis(200))))
            .map_err(|_| {
                failure(
                    "MCP_TRANSPORT_ERROR",
                    "Cannot configure Desktop connection.",
                )
            })?;
        match stream.write(&bytes[written..]) {
            Ok(0) => return Err(failure("MCP_TRANSPORT_ERROR", "Desktop connection closed.")),
            Ok(count) => written += count,
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) => {}
            Err(_) => {
                return Err(failure(
                    "MCP_TRANSPORT_ERROR",
                    "Cannot send Desktop request.",
                ))
            }
        }
    }
    bytes.clear();
    let mut framing = None;
    let mut buffer = [0u8; 4096];
    loop {
        stream
            .set_read_timeout(Some(remaining(deadline)?.min(Duration::from_millis(200))))
            .map_err(|_| {
                failure(
                    "MCP_TRANSPORT_ERROR",
                    "Cannot configure Desktop connection.",
                )
            })?;
        let count = match stream.read(&mut buffer) {
            Ok(0) => {
                return Err(failure(
                    "MCP_RESPONSE_INVALID",
                    "Incomplete Desktop response.",
                ))
            }
            Ok(count) => count,
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
                ) =>
            {
                continue
            }
            Err(_) => {
                return Err(failure(
                    "MCP_TRANSPORT_ERROR",
                    "Cannot read Desktop response.",
                ))
            }
        };
        bytes.extend_from_slice(&buffer[..count]);
        if framing.is_none() {
            if let Some(end) = bytes
                .windows(4)
                .position(|w| w == b"\r\n\r\n")
                .map(|n| n + 4)
            {
                if end > MAX_HEADER {
                    return Err(failure(
                        "MCP_RESPONSE_INVALID",
                        "Desktop headers exceed the size limit.",
                    ));
                }
                let headers = std::str::from_utf8(&bytes[..end]).map_err(|_| {
                    failure("MCP_RESPONSE_INVALID", "Invalid Desktop response headers.")
                })?;
                let mut lines = headers.lines();
                let first: Vec<_> = lines
                    .next()
                    .unwrap_or_default()
                    .split_whitespace()
                    .collect();
                let status = if matches!(first.first(), Some(&"HTTP/1.1") | Some(&"HTTP/1.0")) {
                    first
                        .get(1)
                        .and_then(|code| code.parse::<u16>().ok())
                        .filter(|code| (100..600).contains(code))
                } else {
                    None
                }
                .ok_or_else(|| failure("MCP_RESPONSE_INVALID", "Invalid Desktop HTTP status."))?;
                let mut length = None;
                for line in lines.filter(|line| !line.is_empty()) {
                    let (name, value) = line.split_once(':').ok_or_else(|| {
                        failure("MCP_RESPONSE_INVALID", "Invalid Desktop response headers.")
                    })?;
                    if name.eq_ignore_ascii_case("transfer-encoding") {
                        return Err(failure(
                            "MCP_RESPONSE_INVALID",
                            "Unsupported Desktop response framing.",
                        ));
                    }
                    if name.eq_ignore_ascii_case("content-length") {
                        if length.is_some() {
                            return Err(failure(
                                "MCP_RESPONSE_INVALID",
                                "Duplicate Desktop response length.",
                            ));
                        }
                        length = Some(value.trim().parse::<usize>().map_err(|_| {
                            failure("MCP_RESPONSE_INVALID", "Invalid Desktop response length.")
                        })?);
                    }
                }
                let length = length
                    .filter(|length| *length <= MAX_RESPONSE)
                    .ok_or_else(|| {
                        failure(
                            "MCP_RESPONSE_INVALID",
                            "Missing or excessive Desktop response length.",
                        )
                    })?;
                framing = Some((end, length, status));
            } else if bytes.len() > MAX_HEADER {
                return Err(failure(
                    "MCP_RESPONSE_INVALID",
                    "Desktop headers exceed the size limit.",
                ));
            }
        }
        if let Some((start, length, status)) = framing {
            if bytes.len() >= start + length {
                if bytes.len() != start + length {
                    return Err(failure(
                        "MCP_RESPONSE_INVALID",
                        "Unexpected Desktop response data.",
                    ));
                }
                let value = serde_json::from_slice(&bytes[start..]).map_err(|_| {
                    failure("MCP_RESPONSE_INVALID", "Invalid Desktop JSON response.")
                })?;
                return Ok((status, value));
            }
        }
    }
}

fn diagnostic_identity(value: Option<&Value>) -> Option<ProductIdentity> {
    let value = value?;
    // Ignore added diagnostic fields and never forward arbitrary health metadata.
    let identity: ProductIdentity = serde_json::from_value(json!({
        "releaseVersion":value.get("releaseVersion")?, "bridgeProtocolGen":value.get("bridgeProtocolGen")?,
        "apiGen":value.get("apiGen")?, "workspaceGen":value.get("workspaceGen")?
    })).ok()?;
    identity.validate().ok()?;
    Some(identity)
}

fn probe(session: &SessionDescriptor) -> SessionView {
    let expected = crate::product_info::identity().bridge_contract();
    let mut view = SessionView {
        session_id: session.session_id.clone(),
        endpoint: session.endpoint.clone(),
        status: "unavailable",
        compatible: false,
        contract: None,
        identity: None,
        mcp_contract: expected.clone(),
        error: None,
    };
    let result = (|| -> Result<(), String> {
        let (status, value) = request(session, None, HEALTH_TIMEOUT)?;
        if status != 200 {
            return Err(failure(
                "MCP_HEALTH_FAILED",
                "Desktop health request was rejected.",
            ));
        }
        let health: HealthResponse = serde_json::from_value(value)
            .map_err(|_| failure("MCP_HEALTH_INVALID", "Invalid Desktop health response."))?;
        if !health.ok || health.session_id != session.session_id {
            return Err(failure(
                "MCP_SESSION_MISMATCH",
                "Descriptor and authenticated Desktop session differ. Discover sessions again.",
            ));
        }
        view.identity = diagnostic_identity(health.identity.as_ref());
        let actual = match decode_contract(health.contract.as_ref()) {
            Ok(actual) => actual,
            Err(error) => {
                view.status = if health.contract.is_none() {
                    "legacy"
                } else {
                    "invalid"
                };
                return Err(compatibility_failure(&error, &expected, None)["error"].to_string());
            }
        };
        view.contract = Some(actual.clone());
        if let Some(value) = session.contract.as_ref() {
            if decode_contract(Some(value)).as_ref() != Ok(&actual) {
                view.status = "invalid";
                return Err(failure("MCP_DESCRIPTOR_MISMATCH", "Descriptor and authenticated Desktop bridge generations differ. Discover sessions again."));
            }
        }
        if let Err(error) = check_compatibility(&expected, Some(&actual)) {
            view.status = "incompatible";
            return Err(
                compatibility_failure(&error, &expected, Some(&actual))["error"].to_string(),
            );
        }
        view.status = "compatible";
        view.compatible = true;
        Ok(())
    })();
    if let Err(error) = result {
        view.error = serde_json::from_str(&error).ok();
    }
    view
}

fn find(directory: &Path, session_id: &str) -> Result<SessionDescriptor, String> {
    let mut found = descriptors(directory)
        .into_iter()
        .filter(|session| session.session_id == session_id);
    let session = found.next().ok_or_else(|| {
        failure(
            "MCP_SESSION_NOT_FOUND",
            "Session not found. Discover sessions again.",
        )
    })?;
    if found.next().is_some() {
        return Err(failure(
            "MCP_DESCRIPTOR_AMBIGUOUS",
            "Multiple descriptors have this sessionId.",
        ));
    }
    Ok(session)
}

pub fn sessions() -> Vec<SessionView> {
    sessions_dir()
        .map(|directory| session_views(&directory))
        .unwrap_or_default()
}

fn session_views(directory: &Path) -> Vec<SessionView> {
    let candidates = descriptors(directory);
    let mut counts = std::collections::HashMap::new();
    for session in &candidates {
        *counts.entry(&session.session_id).or_insert(0usize) += 1;
    }
    candidates.iter().map(|session| {
        let mut view = probe(session);
        if counts[&session.session_id] != 1 {
            view.compatible = false;
            view.status = "invalid";
            view.error = Some(json!({"code":"MCP_DESCRIPTOR_AMBIGUOUS","message":"Multiple descriptors have this sessionId."}));
        }
        view
    }).collect()
}

pub fn probe_session(session_id: &str) -> Result<Value, String> {
    let directory = sessions_dir()
        .ok_or_else(|| failure("MCP_SESSION_NOT_FOUND", "Session directory is unavailable."))?;
    let session = find(&directory, session_id)?;
    serde_json::to_value(probe(&session))
        .map_err(|_| failure("MCP_INTERNAL_ERROR", "Cannot serialize session status."))
}

pub fn call_session(session_id: &str, method: &str, params: Value) -> Result<Value, String> {
    call_session_with_timeout(session_id, method, params, Duration::from_secs(35))
}

pub fn call_session_with_timeout(
    session_id: &str,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    let directory = sessions_dir()
        .ok_or_else(|| failure("MCP_SESSION_NOT_FOUND", "Session directory is unavailable."))?;
    call_in_directory(&directory, session_id, method, params, timeout)
}

fn call_in_directory(
    directory: &Path,
    session_id: &str,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, String> {
    // Probe only the requested session, freshly for every operation.
    let session = find(directory, session_id)?;
    let view = probe(&session);
    if !view.compatible {
        return Err(view
            .error
            .unwrap_or_else(
                || json!({"code":"MCP_SESSION_UNAVAILABLE","message":"Desktop is unavailable."}),
            )
            .to_string());
    }
    let body = serde_json::to_vec(&BridgeRequest {
        method: method.into(),
        params,
        session_id: Some(session_id.into()),
        contract: Some(json!(crate::product_info::identity().bridge_contract())),
    })
    .map_err(|_| failure("MCP_INVALID_REQUEST", "Cannot encode Desktop request."))?;
    // Leave room for the HTTP header within Desktop's existing 4 MiB limit.
    if body.len() + 2048 > MAX_REQUEST {
        return Err(failure(
            "MCP_REQUEST_TOO_LARGE",
            "Desktop request exceeds the size limit.",
        ));
    }
    let (status, value) = request(&session, Some(&body), timeout)?;
    if status == 200 && value.get("ok").and_then(Value::as_bool) == Some(true) {
        let mut result = value.get("result").cloned().unwrap_or(Value::Null);
        if method == "getWorkContext" {
            if let Some(object) = result.as_object_mut() {
                object.insert("mcpConnection".into(), json!({"contract":view.contract,"desktopIdentity":view.identity,"mcpIdentity":crate::product_info::identity()}));
            }
        }
        Ok(result)
    } else {
        // Preserve structured Desktop compatibility errors and existing method errors.
        Err(value
            .get("error")
            .filter(|error| !error.is_null())
            .cloned()
            .unwrap_or_else(
                || json!({"code":"MCP_REQUEST_FAILED","message":"Trace Kernel request failed."}),
            )
            .to_string())
    }
}

#[cfg(test)]
#[path = "bridge_tests.rs"]
mod tests;
