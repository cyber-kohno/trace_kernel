//! Session-local, bounded diagnostics. No raw requests, credentials, or sources.
use super::McpSessionInfo;
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use trace_kernel_mcp_protocol::{CompatibilityCode, CompatibilityError, ProductIdentity};

const MAX_REJECTIONS: usize = 8;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityRejection {
    pub code: CompatibilityCode,
    pub expected_generation: u32,
    pub actual_generation: Option<u32>,
    pub first_seen_at: u64,
    pub last_seen_at: u64,
    pub count: u64,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDiagnostics {
    pub session: Option<McpSessionInfo>,
    pub published: bool,
    pub accepted_requests: u64,
    pub rejected_requests: u64,
    pub last_accepted_at: Option<u64>,
    pub last_peer_generation: Option<u32>,
    pub rejections: Vec<CompatibilityRejection>,
}

pub(super) struct SessionRuntime {
    pub identity: ProductIdentity,
    diagnostics: Mutex<McpDiagnostics>,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

impl SessionRuntime {
    pub fn new(identity: ProductIdentity, session: McpSessionInfo) -> Self {
        Self {
            identity,
            diagnostics: Mutex::new(McpDiagnostics {
                session: Some(session),
                ..Default::default()
            }),
        }
    }

    pub fn snapshot(&self, published: bool) -> Result<McpDiagnostics, String> {
        let mut snapshot = self
            .diagnostics
            .lock()
            .map_err(|_| "MCP diagnostics unavailable".to_string())?
            .clone();
        snapshot.published = published;
        Ok(snapshot)
    }

    pub fn accepted(&self, generation: u32) {
        if let Ok(mut state) = self.diagnostics.lock() {
            state.accepted_requests = state.accepted_requests.saturating_add(1);
            state.last_accepted_at = Some(now());
            state.last_peer_generation = Some(generation);
        }
    }

    pub fn rejected(&self, failure: &CompatibilityError, actual: Option<u32>) {
        if let Ok(mut state) = self.diagnostics.lock() {
            state.rejected_requests = state.rejected_requests.saturating_add(1);
            let expected = self.identity.bridge_protocol_gen;
            let index = state.rejections.iter().position(|item| {
                item.code == failure.code
                    && item.expected_generation == expected
                    && item.actual_generation == actual
            });
            let timestamp = now();
            let mut entry = index.map(|index| state.rejections.remove(index)).unwrap_or(
                CompatibilityRejection {
                    code: failure.code.clone(),
                    expected_generation: expected,
                    actual_generation: actual,
                    first_seen_at: timestamp,
                    last_seen_at: timestamp,
                    count: 0,
                },
            );
            entry.last_seen_at = timestamp;
            entry.count = entry.count.saturating_add(1);
            state.rejections.insert(0, entry);
            state.rejections.truncate(MAX_REJECTIONS);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeats_are_aggregated_history_is_bounded_and_counters_saturate() {
        let runtime = SessionRuntime::new(
            ProductIdentity {
                release_version: "0.2.0".into(),
                bridge_protocol_gen: 1,
                api_gen: "1".into(),
                workspace_gen: "0".into(),
            },
            McpSessionInfo {
                session_id: "test".into(),
                endpoint: "http://127.0.0.1:1".into(),
            },
        );
        let failure = CompatibilityError {
            code: CompatibilityCode::BridgeGenerationMismatch,
            field: "must-not-be-stored".into(),
            message: "secret-source-token".into(),
        };
        for _ in 0..100 {
            runtime.rejected(&failure, Some(2));
        }
        let snapshot = runtime.snapshot(true).unwrap();
        assert_eq!(snapshot.rejected_requests, 100);
        assert_eq!(snapshot.rejections.len(), 1);
        assert_eq!(snapshot.rejections[0].count, 100);
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("secret-source-token"));
        for generation in 3..20 {
            runtime.rejected(&failure, Some(generation));
        }
        assert_eq!(
            runtime.snapshot(true).unwrap().rejections.len(),
            MAX_REJECTIONS
        );
        assert_eq!(
            runtime.snapshot(true).unwrap().rejections[0].actual_generation,
            Some(19)
        );
        {
            let mut state = runtime.diagnostics.lock().unwrap();
            state.rejected_requests = u64::MAX;
            state.rejections[0].count = u64::MAX;
            state.accepted_requests = u64::MAX;
        }
        runtime.rejected(&failure, Some(19));
        runtime.accepted(1);
        let snapshot = runtime.snapshot(false).unwrap();
        assert_eq!(snapshot.rejections[0].count, u64::MAX);
        assert_eq!(snapshot.rejected_requests, u64::MAX);
        assert_eq!(snapshot.accepted_requests, u64::MAX);
        assert!(!snapshot.published);
    }
}
