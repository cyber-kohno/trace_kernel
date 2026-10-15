use rmcp::model::{Annotations, MetaObject, Resource, ResourceContents, Role};

pub const CORE_URI: &str = "trace-kernel://knowledge/core";
pub const CONTEXT_URI: &str = "trace-kernel://knowledge/context";
pub const API_URI: &str = "trace-kernel://knowledge/api-and-validation";
pub const OUTPUT_URI: &str = "trace-kernel://knowledge/api/output";
pub const RUNTIME_STATE_URI: &str = "trace-kernel://knowledge/api/runtime-state";
pub const PARSER_URI: &str = "trace-kernel://knowledge/api/parser";
pub const FILESYSTEM_URI: &str = "trace-kernel://knowledge/api/filesystem";
pub const NETWORK_URI: &str = "trace-kernel://knowledge/api/network";
const CORE: &str = include_str!("../resources/core.md");
const CONTEXT: &str = include_str!("../resources/context.md");
const API: &str = include_str!("../resources/api-and-validation.md");
const OUTPUT: &str = include_str!("../resources/api-output.md");
const RUNTIME_STATE: &str = include_str!("../resources/api-runtime-state.md");
const PARSER: &str = include_str!("../resources/api-parser.md");
const FILESYSTEM: &str = include_str!("../resources/api-filesystem.md");
const NETWORK: &str = include_str!("../resources/api-network.md");

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
        (
            OUTPUT_URI,
            "trace-kernel-api-output",
            "Output methods and channel APIs.",
        ),
        (
            RUNTIME_STATE_URI,
            "trace-kernel-api-runtime-state",
            "Runtime and progress APIs.",
        ),
        (
            PARSER_URI,
            "trace-kernel-api-parser",
            "Excel, DOM, CSV, TSV, and JSON parser APIs.",
        ),
        (
            FILESYSTEM_URI,
            "trace-kernel-api-filesystem",
            "Pro file system APIs and transaction behavior.",
        ),
        (
            NETWORK_URI,
            "trace-kernel-api-network",
            "Pro network APIs and response handling.",
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
        OUTPUT_URI => OUTPUT,
        RUNTIME_STATE_URI => RUNTIME_STATE,
        PARSER_URI => PARSER,
        FILESYSTEM_URI => FILESYSTEM,
        NETWORK_URI => NETWORK,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_api_topic_has_a_reference_and_resource_uri() {
        for topic in [
            "overview",
            "context",
            "output",
            "runtime-state",
            "parser",
            "filesystem",
            "network",
        ] {
            assert!(
                api_reference(topic).is_some(),
                "missing reference for {topic}"
            );
        }

        for uri in [
            CORE_URI,
            CONTEXT_URI,
            API_URI,
            OUTPUT_URI,
            RUNTIME_STATE_URI,
            PARSER_URI,
            FILESYSTEM_URI,
            NETWORK_URI,
        ] {
            assert!(read(uri).is_some(), "missing resource {uri}");
        }
    }

    #[test]
    fn api_topic_lookup_is_case_insensitive_and_supports_method_aliases() {
        assert_eq!(api_reference("EXCEL"), Some(PARSER));
        assert_eq!(api_reference("fs"), Some(FILESYSTEM));
        assert_eq!(api_reference("unknown"), None);
    }

    #[test]
    fn public_work_api_methods_are_mentioned_in_guidance() {
        let docs = [
            CONTEXT,
            API,
            OUTPUT,
            RUNTIME_STATE,
            PARSER,
            FILESYSTEM,
            NETWORK,
        ]
        .join("\n");
        for api in [
            "$env",
            "$resource",
            "$dataset",
            "$process",
            "$logic",
            "$print",
            "$println",
            "$channel",
            "$runtime",
            "$state",
            "$parser",
            "$fs",
            "$net",
            "createTextStream",
            "createTableStream",
            "width",
            "string",
            "number",
            "useProgress",
            "useMonitor",
            "sleep",
            "exit",
            "getHtml",
            "request",
            "getText",
            "getJson",
            "method",
            "query",
            "headers",
            "body",
            "timeoutMs",
            "status",
            "ok",
            "contentType",
            "fetchedAt",
            "useTransaction",
            "glob",
            "stat",
            "size",
            "isFile",
            "isDir",
            "createdAt",
            "modifiedAt",
            "readDir",
            "readText",
            "tailText",
            "saveText",
            "copyFile",
            "makeDir",
            "deleteFile",
            "deleteDir",
            "renameFile",
            "renameDir",
            "openText",
            "updateText",
            "copyFileByToken",
            "deleteFileByToken",
            "renameFileByToken",
            "excel",
            "html",
            "xml",
            "csv",
            "tsv",
            "json",
            "sheet",
            "sheets",
            "maxRow",
            "maxCol",
            "rows",
            "rowAt",
            "cellAt",
            "toTable",
            "rowIndex",
            "cells",
            "colIndex",
            "address",
            "value",
            "root",
            "query",
            "queryString",
            "queryNumber",
            "queryBoolean",
            "exists",
            "keys",
            "length",
            "toObject",
            "toCsv",
            "toTsv",
            "createTextStream",
            "add",
            "columns",
            "keys",
            "rowCount",
            "colCount",
            "getString",
            "getNumber",
            "has",
            "children",
            "parent",
            "name",
            "text",
            "attr",
            "dispose",
            "debug",
        ] {
            assert!(docs.contains(api), "missing API guidance for {api}");
        }
    }

    #[test]
    fn api_members_are_documented_in_their_own_reference() {
        let ledger = include_str!("../API_COVERAGE.md");
        let families: [(&str, &str, &[&str], &[&str]); 6] = [
            (
                "output",
                OUTPUT,
                &[
                    "$print",
                    "$println",
                    "$channel",
                    "createTextStream",
                    "createTableStream",
                    "print",
                    "println",
                    "add",
                ],
                &[
                    include_str!("../../desktop/src/app/contents/detail/program/util/channel/dcl-channel.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/declare-util.ts"),
                ],
            ),
            (
                "runtime-state",
                RUNTIME_STATE,
                &[
                    "sleep",
                    "exit",
                    "useProgress",
                    "getCurrent",
                    "tick",
                    "useMonitor",
                ],
                &[
                    include_str!("../../desktop/src/app/contents/detail/program/util/dcl-runtime.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/dcl-state.ts"),
                ],
            ),
            (
                "parser",
                PARSER,
                &[
                    "excel",
                    "html",
                    "xml",
                    "csv",
                    "tsv",
                    "json",
                    "sheet",
                    "sheets",
                    "rowAt",
                    "cellAt",
                    "toTable",
                    "rowCount",
                    "colCount",
                    "columns",
                    "getString",
                    "getNumber",
                    "has",
                    "toObject",
                    "queryString",
                    "queryNumber",
                    "queryBoolean",
                    "exists",
                    "keys",
                    "length",
                    "toCsv",
                    "toTsv",
                    "children",
                    "parent",
                    "name",
                    "text",
                    "attr",
                    "dispose",
                    "debug",
                ],
                &[
                    include_str!("../../desktop/src/app/contents/detail/program/util/parser/dcl-parser.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/parser/excel-parser.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/parser/dom-parser.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/parser/inspector/table-inspector.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/parser/inspector/json-inspector.ts"),
                ],
            ),
            (
                "filesystem",
                FILESYSTEM,
                &[
                    "exists",
                    "glob",
                    "stat",
                    "readDir",
                    "readText",
                    "tailText",
                    "saveText",
                    "copyFile",
                    "makeDir",
                    "deleteFile",
                    "deleteDir",
                    "renameFile",
                    "renameDir",
                    "useTransaction",
                    "openText",
                    "updateText",
                    "copyFileByToken",
                    "deleteFileByToken",
                    "renameFileByToken",
                ],
                &[
                    include_str!("../../desktop/src/app/contents/detail/program/util/fs/dcl-file-system.ts"),
                    include_str!("../../desktop/src/app/contents/detail/program/util/fs/tx/dcl-fs-transaction.ts"),
                ],
            ),
            (
                "network",
                NETWORK,
                &[
                    "getHtml",
                    "request",
                    "getText",
                    "getJson",
                    "method",
                    "query",
                    "headers",
                    "body",
                    "timeoutMs",
                    "status",
                    "ok",
                    "contentType",
                    "fetchedAt",
                ],
                &[include_str!("../../desktop/src/app/contents/detail/program/util/dcl-net.ts")],
            ),
            (
                "context",
                CONTEXT,
                &[
                    "$env",
                    "$resource",
                    "$dataset",
                    "$process",
                    "$logic",
                    "fileName",
                    "absolutePath",
                    "relativePath",
                    "content",
                    "stdout",
                    "stderr",
                    "exitCode",
                ],
                &[
                    include_str!("../../desktop/src/app/contents/detail/program/util/context-data-util.ts"),
                    include_str!("../../desktop/src/app/contents/maintenance/program/injection/program-injection-util.ts"),
                ],
            ),
        ];

        for (family, reference, members, source_files) in families {
            for member in members {
                assert!(
                    reference.contains(member),
                    "missing {family} guidance for {member}"
                );
                assert!(
                    ledger.contains(member),
                    "missing {family} ledger entry for {member}"
                );
                assert!(
                    source_files
                        .iter()
                        .any(|source| source.contains(member.trim_start_matches('$'))),
                    "expected {family} API source to contain {member}"
                );
            }
        }
    }

    #[test]
    fn guidance_matches_current_validation_and_tail_read_contracts() {
        assert!(API.contains("semantic types"));
        assert!(API.contains("does not execute the Work"));
        assert!(FILESYSTEM.contains("The path must be absolute"));
        assert!(
            FILESYSTEM.contains("zero returns an empty string after validating those arguments")
        );
        assert!(FILESYSTEM.contains("scanned tail must not exceed 50 MiB"));
        assert!(PARSER.contains("`rowAt(index)` uses a zero-based row index"));
        assert!(NETWORK.contains("8-second default request timeout"));
        assert!(NETWORK.contains("at most 3 redirects"));
        assert!(NETWORK.contains("larger than 2 MiB"));
        assert!(NETWORK.contains("30 requests per app session"));
        assert!(NETWORK.contains("including for non-2xx HTTP statuses"));
    }
}

pub fn api_reference(topic: &str) -> Option<&'static str> {
    match topic.trim().to_ascii_lowercase().as_str() {
        "overview" | "validation" => Some(API),
        "context" => Some(CONTEXT),
        "output" | "print" | "println" | "channel" => Some(OUTPUT),
        "runtime-state" | "runtime" | "state" => Some(RUNTIME_STATE),
        "parser" | "excel" | "dom" | "html" | "xml" | "csv" | "tsv" | "json" => Some(PARSER),
        "filesystem" | "fs" | "transaction" => Some(FILESYSTEM),
        "network" | "net" | "http" => Some(NETWORK),
        _ => None,
    }
}
