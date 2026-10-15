use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use trace_kernel_native_core::mcp::{self, EventSink};
pub use trace_kernel_native_core::mcp::{McpResponse, McpSessionInfo, McpState};
fn events(app: AppHandle) -> EventSink {
    Arc::new(move |event, payload| app.emit(event, payload).map_err(|e| e.to_string()))
}
#[tauri::command]
pub fn mcp_start_session(
    app: AppHandle,
    state: State<'_, McpState>,
) -> Result<McpSessionInfo, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("mcp/sessions");
    mcp::start_session(
        events(app),
        &state,
        &directory,
        crate::product_info::get_product_info(),
    )
}
#[tauri::command]
pub fn mcp_stop_session(app: AppHandle, state: State<'_, McpState>) -> Result<(), String> {
    mcp::stop_session(&events(app), &state)
}
#[tauri::command]
pub fn mcp_session_status(state: State<'_, McpState>) -> Result<bool, String> {
    mcp::session_status(&state)
}
#[tauri::command]
pub fn mcp_diagnostics(state: State<'_, McpState>) -> Result<mcp::McpDiagnostics, String> {
    mcp::session_diagnostics(&state)
}
#[tauri::command]
pub fn mcp_respond(state: State<'_, McpState>, response: McpResponse) -> Result<(), String> {
    mcp::respond(&state, response)
}
