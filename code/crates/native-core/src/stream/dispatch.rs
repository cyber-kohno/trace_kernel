use super::channel::ChannelStore;
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
pub enum ChannelRequest {
    AddChannel {
        channel_id: String,
    },
    AppendLines {
        channel_id: String,
        batches: Vec<Vec<String>>,
    },
    GetRangeLines {
        channel_id: String,
        from: usize,
        to: usize,
    },
    GetLineLen {
        channel_id: String,
    },
}
impl ChannelRequest {
    pub fn supports(command: &str) -> bool {
        matches!(
            command,
            "add_channel" | "append_lines" | "get_range_lines" | "get_line_len"
        )
    }
    pub fn decode(command: &str, args: Value) -> Result<Self, String> {
        serde_json::from_value(json!({"command":command,"args":args}))
            .map_err(|e| format!("Invalid native channel request: {e}"))
    }
    pub fn execute(self, store: &mut ChannelStore, operation: Operation) -> Result<Value, String> {
        if operation.is_cancelled() {
            return Err("Channel operation cancelled".into());
        }
        let result = match self {
            Self::AddChannel { channel_id } => store.add_channel(channel_id).map(|_| Value::Null),
            Self::AppendLines {
                channel_id,
                batches,
            } => store
                .append_lines(&channel_id, batches)
                .map(|_| Value::Null),
            Self::GetRangeLines {
                channel_id,
                from,
                to,
            } => Ok(json!(store.range_lines(&channel_id, from, to))),
            Self::GetLineLen { channel_id } => Ok(json!(store.line_len(&channel_id))),
        };
        if operation.is_cancelled() {
            return Err("Channel operation cancelled".into());
        }
        result
    }
}
