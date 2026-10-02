use rmcp::model::{Annotations, MetaObject, Resource, ResourceContents, Role};

pub const CORE_URI: &str = "trace-kernel://knowledge/core";
pub const CONTEXT_URI: &str = "trace-kernel://knowledge/context";
pub const API_URI: &str = "trace-kernel://knowledge/api-and-validation";
const CORE: &str = include_str!("../resources/core.md");
const CONTEXT: &str = include_str!("../resources/context.md");
const API: &str = include_str!("../resources/api-and-validation.md");

pub fn list() -> Vec<Resource> {
    [
        (
            CORE_URI,
            "trace-kernel-knowledge-core",
            "Read first. Workspace model and AI policy.",
        ),
        (
            CONTEXT_URI,
            "trace-kernel-knowledge-context",
            "Context namespaces and data shapes.",
        ),
        (
            API_URI,
            "trace-kernel-knowledge-api",
            "APIs, validation, and safe Work creation.",
        ),
    ]
    .into_iter()
    .map(|(uri, name, description)| {
        Resource::new(uri, name)
            .with_title(name)
            .with_description(description)
            .with_mime_type("text/markdown")
            .with_annotations(
                Annotations::default()
                    .with_audience(vec![Role::Assistant])
                    .with_priority(1.0),
            )
    })
    .collect()
}

pub fn read(uri: &str) -> Option<ResourceContents> {
    let text = match uri {
        CORE_URI => CORE,
        CONTEXT_URI => CONTEXT,
        API_URI => API,
        _ => return None,
    };
    Some(
        ResourceContents::text(text, uri)
            .with_mime_type("text/markdown")
            .with_meta(MetaObject(
                serde_json::json!({"traceKernel/knowledgeVersion":"1"})
                    .as_object()
                    .unwrap()
                    .clone(),
            )),
    )
}
