use crate::bridge::{call_session, call_session_with_timeout, sessions};
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
use std::time::Duration;

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
#[serde(rename_all = "lowercase")]
enum WorkMethod {
    Plain,
    Channel,
}

impl WorkMethod {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Plain => "plain",
            Self::Channel => "channel",
        }
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct WorkContextRequest {
    session_id: String,
    #[schemars(
        description = "The Work output method to author: plain or channel. Defaults to plain."
    )]
    method: Option<WorkMethod>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct NamedRequest {
    session_id: String,
    name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ApiReferenceRequest {
    #[schemars(
        description = "API area or name: overview, context, output, runtime-state, parser, filesystem, or network. Individual API aliases such as excel, dom, channel, fs, and net are also accepted."
    )]
    topic: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct WorkRequest {
    session_id: String,
    name: String,
    method: Option<String>,
    source: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct WorkUpdateProposalRequest {
    session_id: String,
    #[schemars(
        description = "Opaque editorId returned by get_ui_state when the target Work editor was read."
    )]
    editor_id: String,
    #[schemars(description = "Exact Work name returned when its source was read.")]
    name: String,
    #[schemars(
        description = "Exact source text returned by get_work at read time; app-side stale-source guard."
    )]
    baseline_source: String,
    #[schemars(
        description = "Complete proposed replacement source, validated but never executed by MCP."
    )]
    proposed_source: String,
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
            serde_json::json!({"application":"Trace Kernel","status":"ok","identity":crate::product_info::identity()}).to_string(),
        )]))
    }

    #[tool(
        description = "Retrieve Trace Kernel API guidance on demand. Read the relevant topic before authoring a Work; then call get_work_context for the live declarations and current workspace-specific names. Topics: overview, context, output, runtime-state, parser, filesystem, network. Aliases include excel, dom, channel, fs, and net."
    )]
    async fn get_api_reference(
        &self,
        Parameters(request): Parameters<ApiReferenceRequest>,
    ) -> Result<CallToolResult, McpError> {
        let Some(reference) = crate::resources::api_reference(&request.topic) else {
            return Ok(CallToolResult::error(vec![ContentBlock::text(
                "Unknown API topic. Use overview, context, output, runtime-state, parser, filesystem, or network.",
            )]));
        };
        Ok(CallToolResult::success(vec![ContentBlock::text(
            crate::resources::guidance(reference),
        )]))
    }

    #[tool(
        description = "List Trace Kernel desktop sessions with per-session compatibility status. Only compatible=true sessions can be controlled; legacy/incompatible/unavailable sessions include a reason. Product versions need not match."
    )]
    async fn list_development_sessions(&self) -> Result<CallToolResult, McpError> {
        let sessions = tokio::task::spawn_blocking(sessions)
            .await
            .map_err(|_| McpError::internal_error("Session discovery failed.", None))?;
        let result = serde_json::to_string(&sessions)
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
        let result =
            tokio::task::spawn_blocking(move || crate::bridge::probe_session(&request.session_id))
                .await
                .map_err(|_| McpError::internal_error("Session probe failed.", None))?;
        call_result(result)
    }

    #[tool(
        description = "Read the current UI state of a live Trace Kernel session. Returns outlineSelection and editor separately, with type, name, and zero-based index. editor is null when no source editor is open; an open Work editor also includes an opaque editorId to bind a later propose_work_update to this exact editor instance. Includes Work, Logic, and Declare editors. Returns no source or values. Use get_work to read the source of an identified Work. This reports what is open, not whether the user is typing."
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

    #[tool(
        description = "List resources in the current Trace Kernel workspace. Inspect resource metadata, then use get_resource_sample before writing a Work that depends on tabular data."
    )]
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

    #[tool(
        description = "Read a Resource sample using the desktop's actual parser. CSV/TSV returns headers, up to 10 rows in header order with runtime value types, and totalRows after parsing the complete input. Resources without a parse method return sampleText (up to 4096 characters), truncated, and totalRows: null. Use this to confirm actual columns and value shapes before writing a Work; see trace-kernel://knowledge/context."
    )]
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
        description = "Read the live context entries plus complete contextDeclarations and apiDeclarations for the requested Work method. Always call this before authoring or validating a Work and use those declarations as authoritative. Fetch focused examples with get_api_reference."
    )]
    async fn get_work_context(
        &self,
        Parameters(request): Parameters<WorkContextRequest>,
    ) -> Result<CallToolResult, McpError> {
        call_result(call_session(
            &request.session_id,
            "getWorkContext",
            serde_json::json!({"method":request.method.as_ref().map(WorkMethod::as_str).unwrap_or("plain")}),
        ))
    }

    #[tool(
        description = "Validate a new Work without changing the project. Checks TypeScript syntax and semantic types against the current workspace, Work method, and Trace Kernel API declarations; it does not execute the Work or prove runtime behavior. Call after reading get_work_context and checking relevant Resource samples; fix all reported errors before create_work."
    )]
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
        description = "Create one new AI-generated Work. Re-runs TypeScript syntax and semantic type validation against the current workspace before saving; it does not execute the Work or prove runtime behavior. Call only after get_work_context and a successful validate_work. This creates a new entry and never changes existing entries. For a proposed update to an open Work, use propose_work_update; the app applies it only after explicit user approval."
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

    #[tool(
        description = "Submit a complete replacement proposal for the Work whose editor was open when its source was read. Pass editorId from get_ui_state and the exact source from get_work as baselineSource. Trace Kernel rejects without showing UI if that editor is no longer open or its source changed. Otherwise the app shows a whole-source diff and waits for the user to apply all or reject. It validates the replacement but never executes it."
    )]
    async fn propose_work_update(
        &self,
        Parameters(request): Parameters<WorkUpdateProposalRequest>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = request.session_id;
        let params = serde_json::json!({
            "editorId": request.editor_id,
            "name": request.name,
            "baselineSource": request.baseline_source,
            "proposedSource": request.proposed_source,
        });
        let result = tokio::task::spawn_blocking(move || {
            call_session_with_timeout(
                &session_id,
                "proposeWorkUpdate",
                params,
                Duration::from_secs(605),
            )
        })
        .await
        .map_err(|error| McpError::internal_error(error.to_string(), None))?;
        call_result(result)
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
                "Read trace-kernel://knowledge/core first, then api-and-validation. Discover an open project with list_development_sessions and select only a compatible=true session. Compatibility is exact bridge generation, not product version; follow incompatibility diagnostics and restart updated MCP processes. Embedded guidance targets this MCP's bridge generation, not an unverified Desktop. Before authoring a Work, inspect relevant Resources and samples, call get_api_reference for the needed API areas, then call get_work_context and follow its live declarations. Call validate_work before create_work; never replace an existing Work. To revise an open Work, read get_ui_state and get_work, retain editorId and exact baseline source, validate the full replacement, and submit propose_work_update; only the app user's approval applies it.",
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_router_exposes_api_discovery_and_method_specific_context() {
        let router = TraceKernelMcpServer::tool_router();
        assert!(router.has_route("get_api_reference"));
        assert!(router.has_route("get_work_context"));
        assert!(router.has_route("validate_work"));
        assert!(router.has_route("propose_work_update"));
    }

    #[test]
    fn server_advertises_knowledge_resources() {
        let info = TraceKernelMcpServer::new().get_info();
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());
        assert_eq!(crate::resources::list().len(), 8);
    }

    #[tokio::test]
    async fn ping_reports_the_compiled_product_identity_without_a_desktop_session() {
        let result = TraceKernelMcpServer::new().ping().await.unwrap();
        let result = serde_json::to_value(result).unwrap();
        let payload: serde_json::Value =
            serde_json::from_str(result["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(payload["status"], "ok");
        assert_eq!(
            payload["identity"],
            serde_json::to_value(crate::product_info::identity()).unwrap()
        );
        assert!(payload.get("token").is_none());
    }
}
