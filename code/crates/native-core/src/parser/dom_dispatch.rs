use super::{
    dom::DomStore,
    types::{DomId, NodeId},
};
use crate::execution_io::Operation;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(
    tag = "command",
    content = "args",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum DomRequest {
    DomParse {
        source: String,
    },
    DomParseHtml {
        source: String,
    },
    DomRoot {
        dom_id: DomId,
    },
    DomQuery {
        dom_id: DomId,
        xpath: String,
    },
    DomQueryFromNode {
        dom_id: DomId,
        node_id: NodeId,
        xpath: String,
    },
    DomNodeName {
        dom_id: DomId,
        node_id: NodeId,
    },
    DomNodeText {
        dom_id: DomId,
        node_id: NodeId,
    },
    DomNodeAttr {
        dom_id: DomId,
        node_id: NodeId,
        name: String,
    },
    DomNodeChildren {
        dom_id: DomId,
        node_id: NodeId,
    },
    DomNodeParent {
        dom_id: DomId,
        node_id: NodeId,
    },
    DomInfo {
        dom_id: DomId,
    },
    DomDispose {
        dom_id: DomId,
    },
}
impl DomRequest {
    pub fn supports(command: &str) -> bool {
        matches!(
            command,
            "dom_parse"
                | "dom_parse_html"
                | "dom_root"
                | "dom_query"
                | "dom_query_from_node"
                | "dom_node_name"
                | "dom_node_text"
                | "dom_node_attr"
                | "dom_node_children"
                | "dom_node_parent"
                | "dom_info"
                | "dom_dispose"
        )
    }
    pub fn decode(command: &str, args: Value) -> Result<Self, String> {
        serde_json::from_value(json!({"command":command,"args":args}))
            .map_err(|e| format!("Invalid native DOM request: {e}"))
    }
    pub fn execute(self, store: &mut DomStore, operation: Operation) -> Result<Value, String> {
        if operation.is_cancelled() {
            return Err("DOM operation cancelled".into());
        }
        let result = match self {
            Self::DomParse { source } => store.parse(source).map(|v| json!(v)),
            Self::DomParseHtml { source } => store.parse_html(source).map(|v| json!(v)),
            Self::DomRoot { dom_id } => store.root_element(dom_id).map(|v| json!(v)),
            Self::DomQuery { dom_id, xpath } => store.query(dom_id, None, xpath).map(|v| json!(v)),
            Self::DomQueryFromNode {
                dom_id,
                node_id,
                xpath,
            } => store.query(dom_id, Some(node_id), xpath).map(|v| json!(v)),
            Self::DomNodeName { dom_id, node_id } => {
                store.node_name(dom_id, node_id).map(|v| json!(v))
            }
            Self::DomNodeText { dom_id, node_id } => {
                store.node_text(dom_id, node_id).map(|v| json!(v))
            }
            Self::DomNodeAttr {
                dom_id,
                node_id,
                name,
            } => store.node_attr(dom_id, node_id, name).map(|v| json!(v)),
            Self::DomNodeChildren { dom_id, node_id } => {
                store.node_children(dom_id, node_id).map(|v| json!(v))
            }
            Self::DomNodeParent { dom_id, node_id } => {
                store.node_parent(dom_id, node_id).map(|v| json!(v))
            }
            Self::DomInfo { dom_id } => store.info(dom_id).map(|v| json!(v)),
            Self::DomDispose { dom_id } => {
                if !store.doms.contains_key(&dom_id) {
                    return Err(format!("dom not found: {dom_id}"));
                }
                store.remove(dom_id);
                Ok(Value::Null)
            }
        };
        if operation.is_cancelled() {
            return Err("DOM operation cancelled".into());
        }
        result
    }
}
