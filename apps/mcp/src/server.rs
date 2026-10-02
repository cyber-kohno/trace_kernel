use rmcp::service::RequestContext;
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, ContentBlock, Implementation, ListResourcesResult, PaginatedRequestParams,
        ProtocolVersion, ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult,
        ServerCapabilities, ServerConfig,
    },
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;
use std::{env, fs, path::PathBuf};

#[derive(Clone)]
pub struct TraceKernelMcpServer {
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SessionRequest {
    session_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct NamedRequest {
    session_id: String,
    name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct WorkRequest {
    session_id: String,
    name: String,
    method: Option<String>,
    source: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionDescriptor {
    session_id: String,
    endpoint: String,
    token: String,
}

fn sessions_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        return env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("jp.hkdev.tk/mcp/sessions"));
    }
    #[cfg(not(windows))]
    {
        env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .map(|p| p.join("jp.hkdev.tk/mcp/sessions"))
    }
}

fn sessions() -> Vec<SessionDescriptor> {
    sessions_dir()
        .and_then(|dir| fs::read_dir(dir).ok())
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| fs::read(entry.path()).ok())
        .filter_map(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(|session: &SessionDescriptor| session_is_live(session))
        .collect()
}

fn session_is_live(session: &SessionDescriptor) -> bool {
    let Some(endpoint) = session.endpoint.strip_prefix("http://") else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(
        &endpoint
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:0".parse().unwrap()),
        Duration::from_millis(500),
    ) else {
        return false;
    };
    let request = format!("GET /health HTTP/1.1\r\nHost: {endpoint}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n", session.token);
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = Vec::new();
    if stream.read_to_end(&mut response).is_err() {
        return false;
    }
    response.starts_with(b"HTTP/1.1 200 ")
        && String::from_utf8_lossy(&response).contains(&session.session_id)
}

fn call_session(
    session_id: &str,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let session = sessions()
        .into_iter()
        .find(|s| s.session_id == session_id)
        .ok_or("Session not found.")?;
    let endpoint = session
        .endpoint
        .strip_prefix("http://")
        .ok_or("Invalid session endpoint.")?;
    let mut stream = TcpStream::connect(endpoint).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(35)))
        .map_err(|e| e.to_string())?;
    let body = serde_json::to_vec(&serde_json::json!({"method": method, "params": params}))
        .map_err(|e| e.to_string())?;
    let request = format!("POST /bridge HTTP/1.1\r\nHost: {endpoint}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", session.token, body.len());
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(&body))
        .map_err(|e| e.to_string())?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|e| e.to_string())?;
    let start = response
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("Invalid bridge response.")?
        + 4;
    let value: serde_json::Value =
        serde_json::from_slice(&response[start..]).map_err(|e| e.to_string())?;
    if value.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        Ok(value
            .get("result")
            .cloned()
            .unwrap_or(serde_json::Value::Null))
    } else {
        Err(value
            .get("error")
            .and_then(|v| v.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("Trace Kernel request failed.")
            .to_string())
    }
}

fn call_result(value: Result<serde_json::Value, String>) -> Result<CallToolResult, McpError> {
    match value {
        Ok(value) => Ok(CallToolResult::success(vec![ContentBlock::text(
            value.to_string(),
        )])),
        Err(error) => Ok(CallToolResult::error(vec![ContentBlock::text(error)])),
    }
}

#[tool_router]
impl TraceKernelMcpServer {
    pub fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Check whether the Trace Kernel MCP adapter is running.")]
    async fn ping(&self) -> Result<CallToolResult, McpError> {
        Ok(CallToolResult::success(vec![ContentBlock::text(
            r#"{"application":"Trace Kernel","status":"ok"}"#,
        )]))
    }

    #[tool(
        description = "List active Trace Kernel desktop sessions that are available for MCP control."
    )]
    async fn list_development_sessions(&self) -> Result<CallToolResult, McpError> {
        let result = serde_json::to_string(&sessions())
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![ContentBlock::text(result)]))
    }

    #[tool(
        description = "Read the health status of a Trace Kernel session. Use the complete sessionId returned by list_development_sessions."
    )]
    async fn probe_session(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        let Some(session) = sessions()
            .into_iter()
            .find(|s| s.session_id == request.session_id)
        else {
            return Ok(CallToolResult::error(vec![ContentBlock::text(
                "Session not found.",
            )]));
        };
        Ok(CallToolResult::success(vec![ContentBlock::text(
            serde_json::json!({"sessionId":session.session_id,"endpoint":session.endpoint})
                .to_string(),
        )]))
    }

    #[tool(
        description = "Read the current UI state of a live Trace Kernel session. Returns outlineSelection and editor separately, with type, name, and zero-based index. editor is null when no source editor is open; an open editor includes open: true. Includes Work, Logic, and Declare editors. Returns no source or values. Use get_work to read the source of an identified Work. This reports what is open, not whether the user is typing."
    )]
    async fn get_ui_state(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getUiState",
            serde_json::json!({}),
        ))
    }

    #[tool(description = "Read the current Trace Kernel workspace overview.")]
    async fn get_workspace_overview(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getWorkspaceOverview",
            serde_json::json!({}),
        ))
    }

    #[tool(
        description = "List environment variables in the current Trace Kernel workspace. Values may contain sensitive information."
    )]
    async fn list_envs(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "listEnvs",
            serde_json::json!({}),
        ))
    }

    #[tool(
        description = "Read one environment variable from the current workspace. Values may contain sensitive information."
    )]
    async fn get_env(
        &self,
        Parameters(request): Parameters<NamedRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getEnv",
            serde_json::json!({"varName": request.name}),
        ))
    }

    #[tool(description = "List resources in the current Trace Kernel workspace.")]
    async fn list_resources(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "listResources",
            serde_json::json!({}),
        ))
    }

    #[tool(description = "Read a small parsed sample and headers from a Resource.")]
    async fn get_resource_sample(
        &self,
        Parameters(request): Parameters<NamedRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getResourceSample",
            serde_json::json!({"varName":request.name}),
        ))
    }

    #[tool(description = "Read a complete Resource by variable name.")]
    async fn get_resource(
        &self,
        Parameters(request): Parameters<NamedRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getResource",
            serde_json::json!({"varName":request.name}),
        ))
    }

    #[tool(description = "List existing Works in the current Trace Kernel workspace.")]
    async fn list_works(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "listWorks",
            serde_json::json!({}),
        ))
    }

    #[tool(description = "Read an existing Work. This is read-only and cannot modify the Work.")]
    async fn get_work(
        &self,
        Parameters(request): Parameters<NamedRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getWork",
            serde_json::json!({"name":request.name}),
        ))
    }

    #[tool(
        description = "Read the available Context Injection, API Injection, and declarations for creating a Work."
    )]
    async fn get_work_context(
        &self,
        Parameters(request): Parameters<SessionRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getWorkContext",
            serde_json::json!({}),
        ))
    }

    #[tool(description = "Validate a new Work without changing the project.")]
    async fn validate_work(
        &self,
        Parameters(request): Parameters<WorkRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "validateWork",
            serde_json::json!({"work":{"name":request.name,"method":request.method.unwrap_or_else(|| "plain".into()),"source":request.source}}),
        ))
    }

    #[tool(
        description = "Create one new AI-generated Work. This is the only Trace Kernel update operation and never changes existing entries."
    )]
    async fn create_work(
        &self,
        Parameters(request): Parameters<WorkRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "createWork",
            serde_json::json!({"work":{"name":request.name,"method":request.method.unwrap_or_else(|| "plain".into()),"source":request.source}}),
        ))
    }
}

#[tool_handler]
impl ServerHandler for TraceKernelMcpServer {
    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult::with_all_items(crate::resources::list()))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let content = crate::resources::read(&request.uri).ok_or_else(|| {
            McpError::resource_not_found(
                format!("Unknown Trace Kernel resource: {}", request.uri),
                None,
            )
        })?;
        Ok(ReadResourceResponse::Complete(ReadResourceResult::new(
            vec![content],
        )))
    }

    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().enable_resources().build())
            .with_server_info(
                Implementation::new(env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"))
                    .with_title("Trace Kernel MCP"),
            )
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
            .with_instructions(
                "Read trace-kernel://knowledge/core first, then context and api-and-validation. Use list_development_sessions to discover an open Trace Kernel project. Read live workspace declarations before creating a Work.",
            )
    }
}
