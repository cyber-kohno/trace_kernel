use super::line_buffer::LineBuffer;
use crate::resource_limits::{
    CHANNEL_ID_MAX_BYTES, CHANNEL_MAX_COUNT, CHANNEL_OUTPUT_MAX_BYTES, CHANNEL_OUTPUT_MAX_LINES,
};
use std::collections::HashMap;

pub struct ChannelStore {
    channels: HashMap<String, LineBuffer>,
    total_bytes: usize,
    total_lines: usize,
    max_bytes: usize,
    max_lines: usize,
    max_channels: usize,
}

impl Default for ChannelStore {
    fn default() -> Self {
        Self::new()
    }
}

impl ChannelStore {
    pub fn new() -> Self {
        Self {
            channels: HashMap::new(),
            total_bytes: 0,
            total_lines: 0,
            max_bytes: CHANNEL_OUTPUT_MAX_BYTES,
            max_lines: CHANNEL_OUTPUT_MAX_LINES,
            max_channels: CHANNEL_MAX_COUNT,
        }
    }

    /// 明示的に追加（重複はエラーにしたい場合）
    pub fn add_channel(&mut self, channel_id: String) -> Result<(), String> {
        if self.channels.contains_key(&channel_id) {
            return Err(format!("channel already exists: {}", channel_id));
        }
        if channel_id.len() > CHANNEL_ID_MAX_BYTES {
            return Err(format!("Channel ID exceeds {CHANNEL_ID_MAX_BYTES} bytes"));
        }
        if self.channels.len() >= self.max_channels {
            return Err(format!("Channel count exceeds {}", self.max_channels));
        }

        self.channels.insert(channel_id, LineBuffer::new());
        Ok(())
    }
    pub fn append_lines(
        &mut self,
        channel_id: &str,
        batches: Vec<Vec<String>>,
    ) -> Result<(), String> {
        let buffer = self.channels.get(channel_id).ok_or("channel not found")?;

        let mut added_bytes = 0usize;
        let mut projected_lines = buffer.lines.len();
        for lines in &batches {
            for line in lines {
                added_bytes = added_bytes.saturating_add(line.len());
            }
            if !lines.is_empty() {
                projected_lines =
                    projected_lines.saturating_add(lines.len() - usize::from(projected_lines > 0));
            }
        }
        if added_bytes > self.max_bytes.saturating_sub(self.total_bytes) {
            return Err(format!("Channel output exceeds {} bytes", self.max_bytes));
        }
        let added_lines = projected_lines - buffer.lines.len();
        if added_lines > self.max_lines.saturating_sub(self.total_lines) {
            return Err(format!("Channel output exceeds {} lines", self.max_lines));
        }

        let buffer = self.channels.get_mut(channel_id).unwrap();

        for lines in batches {
            buffer.push_lines(lines);
        }

        self.total_bytes += added_bytes;
        self.total_lines += added_lines;

        Ok(())
    }
    pub fn range_lines(&self, channel_id: &str, from: usize, to: usize) -> Vec<String> {
        let Some(buffer) = self.channels.get(channel_id) else {
            return Vec::new();
        };
        if from >= buffer.lines.len() || to <= from {
            return Vec::new();
        }
        buffer.lines[from..to.min(buffer.lines.len())].to_vec()
    }
    pub fn line_len(&self, channel_id: &str) -> usize {
        let Some(buffer) = self.channels.get(channel_id) else {
            return 0;
        };
        match buffer.lines.last() {
            Some(last) if last.is_empty() => buffer.lines.len().saturating_sub(1),
            _ => buffer.lines.len(),
        }
    }
    pub fn snapshot(&self) -> HashMap<String, Vec<String>> {
        self.channels
            .iter()
            .map(|(id, buffer)| (id.clone(), buffer.lines.clone()))
            .collect()
    }
    pub fn clear(&mut self) {
        self.channels.clear();
        self.total_bytes = 0;
        self.total_lines = 0;
    }
    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }
}
#[cfg(test)]
mod tests {
    use super::ChannelStore;
    use crate::resource_limits::CHANNEL_ID_MAX_BYTES;

    #[test]
    fn retained_output_read_ranges_and_clear_preserve_ui_line_rules() {
        let mut store = ChannelStore::new();
        store.add_channel("a".into()).unwrap();
        store
            .append_lines("a", vec![vec!["first".into(), "second".into(), "".into()]])
            .unwrap();
        assert_eq!(store.line_len("a"), 2);
        assert_eq!(store.range_lines("a", 1, usize::MAX), vec!["second", ""]);
        assert!(store.range_lines("a", 2, 1).is_empty());
        assert!(store.range_lines("missing", 0, 1).is_empty());
        assert_eq!(store.line_len("missing"), 0);
        let snapshot = store.snapshot();
        store.clear();
        assert_eq!(store.channel_count(), 0);
        assert_eq!(store.total_bytes, 0);
        assert_eq!(store.total_lines, 0);
        assert_eq!(snapshot["a"], vec!["first", "second", ""]);
        store.add_channel("a".into()).unwrap();
        store.append_lines("a", vec![vec!["fresh".into()]]).unwrap();
        assert_eq!(store.line_len("a"), 1);
    }

    #[test]
    fn duplicate_channel_is_an_error() {
        let mut store = ChannelStore::new();
        store.add_channel("output".into()).unwrap();
        assert!(store.add_channel("output".into()).is_err());
    }

    #[test]
    fn missing_channel_append_is_an_error_without_creating_channel() {
        let mut store = ChannelStore::new();
        assert!(store
            .append_lines("missing", vec![vec!["line".into()]])
            .is_err());
        assert!(store.channels.is_empty());
    }

    #[test]
    fn batches_are_saved_in_order() {
        let mut store = ChannelStore::new();
        store.add_channel("output".into()).unwrap();
        store
            .append_lines(
                "output",
                vec![
                    vec!["first".into(), "".into()],
                    vec!["second".into(), "".into()],
                ],
            )
            .unwrap();
        assert_eq!(store.channels["output"].lines, vec!["first", "second", ""]);
    }

    #[test]
    fn overflow_rejects_the_whole_append_and_preserves_existing_output() {
        let mut store = ChannelStore::new();
        store.max_bytes = 5;
        store.max_lines = 3;
        store.add_channel("output".into()).unwrap();
        store
            .append_lines("output", vec![vec!["ab".into(), "".into()]])
            .unwrap();
        assert!(store
            .append_lines("output", vec![vec!["cde".into(), "f".into()]])
            .unwrap_err()
            .contains("bytes"));
        assert_eq!(store.channels["output"].lines, vec!["ab", ""]);
        assert_eq!(store.total_bytes, 2);
        assert_eq!(store.total_lines, 2);
        store
            .append_lines("output", vec![vec!["cde".into(), "".into()]])
            .unwrap();
        assert_eq!(store.total_bytes, 5);
        assert_eq!(store.total_lines, 3);
        assert!(store
            .append_lines("output", vec![vec!["".into(), "".into()]])
            .unwrap_err()
            .contains("lines"));
        assert_eq!(store.channels["output"].lines, vec!["ab", "cde", ""]);
    }

    #[test]
    fn limits_apply_across_channels_without_creating_a_partial_channel() {
        let mut store = ChannelStore::new();
        store.max_bytes = 3;
        store.max_channels = 2;
        store.add_channel("a".into()).unwrap();
        store.add_channel("b".into()).unwrap();
        assert!(store.add_channel("c".into()).unwrap_err().contains("count"));
        assert_eq!(store.channels.len(), 2);
        store.append_lines("a", vec![vec!["abc".into()]]).unwrap();
        assert!(store
            .append_lines("b", vec![vec!["d".into()]])
            .unwrap_err()
            .contains("bytes"));
        assert!(store.channels["b"].lines.is_empty());
        assert!(store
            .add_channel("x".repeat(CHANNEL_ID_MAX_BYTES + 1))
            .is_err());
    }
}
