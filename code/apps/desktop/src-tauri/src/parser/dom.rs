use crate::parser::types::{DomId, NodeId};
use crate::runtime::AppState;
pub use trace_kernel_native_core::parser::dom::DomStore;
#[tauri::command]
pub fn dom_parse(
    state: tauri::State<AppState>,
    execution_id: String,
    source: String,
) -> Result<DomId, String> {
    state.with_owned_execution(&execution_id, |execution| execution.dom_store.parse(source))
}

#[tauri::command]
pub fn dom_parse_html(
    state: tauri::State<AppState>,
    execution_id: String,
    source: String,
) -> Result<DomId, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.parse_html(source)
    })
}

#[tauri::command]
pub fn dom_root(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
) -> Result<Option<NodeId>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.root_element(dom_id)
    })
}

#[tauri::command]
pub fn dom_query(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    xpath: String,
) -> Result<Vec<NodeId>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.query(dom_id, None, xpath)
    })
}

#[tauri::command]
pub fn dom_query_from_node(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
    xpath: String,
) -> Result<Vec<NodeId>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.query(dom_id, Some(node_id), xpath)
    })
}

#[tauri::command]
pub fn dom_node_name(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Option<String>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.node_name(dom_id, node_id)
    })
}

#[tauri::command]
pub fn dom_node_text(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<String, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.node_text(dom_id, node_id)
    })
}

#[tauri::command]
pub fn dom_node_attr(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
    name: String,
) -> Result<Option<String>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.node_attr(dom_id, node_id, name)
    })
}

#[tauri::command]
pub fn dom_node_children(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Vec<NodeId>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.node_children(dom_id, node_id)
    })
}

#[tauri::command]
pub fn dom_node_parent(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
    node_id: NodeId,
) -> Result<Option<NodeId>, String> {
    state.with_owned_execution(&execution_id, |execution| {
        execution.dom_store.node_parent(dom_id, node_id)
    })
}

#[tauri::command]
pub fn dom_info(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
) -> Result<(DomId, usize), String> {
    state.with_owned_execution(&execution_id, |execution| execution.dom_store.info(dom_id))
}

#[tauri::command]
pub fn dom_dispose(
    state: tauri::State<AppState>,
    execution_id: String,
    dom_id: DomId,
) -> Result<(), String> {
    state.with_owned_execution(&execution_id, |execution| {
        if execution.dom_store.doms.contains_key(&dom_id) {
            execution.dom_store.remove(dom_id);
            Ok(())
        } else {
            Err(format!("dom not found: {}", dom_id))
        }
    })
}
