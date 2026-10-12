// Native request/payload limits, not a cap on the application's total memory.
pub const NATIVE_IO_MAX_OPERATIONS: usize = 32;
pub const HTTP_BODY_MAX_BYTES: usize = 2 * 1024 * 1024;
pub const PROCESS_OUTPUT_MAX_BYTES: usize = 16 * 1024 * 1024;
pub const EXCEL_INPUT_MAX_BYTES: usize = 32 * 1024 * 1024;
pub const EXCEL_ZIP_MAX_BYTES: usize = 128 * 1024 * 1024;
pub const EXCEL_ZIP_ENTRY_MAX_BYTES: usize = 16 * 1024 * 1024;
pub const EXCEL_ZIP_MAX_ENTRIES: usize = 4096;
pub const EXCEL_MAX_SHEETS: usize = 128;
pub const EXCEL_MAX_CELLS: usize = 100_000;
pub const EXCEL_MAX_RANGE_CELLS: usize = 1_000_000;
pub const EXCEL_TEXT_MAX_BYTES: usize = 16 * 1024 * 1024;
pub const SCAN_MAX_ENTRIES: usize = 100_000;
pub const SCAN_MAX_DEPTH: u32 = 64;
pub const SCAN_NAME_MAX_BYTES: usize = 8 * 1024 * 1024;
pub const SCAN_MAX_CONDITIONS: usize = 128;
pub const SCAN_PATTERN_MAX_BYTES: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub enum BufferError {
    LimitExceeded,
    AllocationFailed,
}

pub struct LimitedBuffer {
    bytes: Vec<u8>,
    limit: usize,
}

impl LimitedBuffer {
    pub fn new(limit: usize) -> Self {
        Self {
            bytes: Vec::new(),
            limit,
        }
    }

    pub fn extend(&mut self, chunk: &[u8]) -> Result<(), BufferError> {
        if chunk.len() > self.limit - self.bytes.len() {
            return Err(BufferError::LimitExceeded);
        }
        let needed = self.bytes.len() + chunk.len();
        if needed > self.bytes.capacity() {
            // Grow geometrically without requesting capacity past the byte limit.
            let capacity = needed
                .max(self.bytes.capacity().saturating_mul(2))
                .min(self.limit);
            self.bytes
                .try_reserve_exact(capacity - self.bytes.len())
                .map_err(|_| BufferError::AllocationFailed)?;
        }
        self.bytes.extend_from_slice(chunk);
        Ok(())
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_exact_limit_and_rejects_overflow_without_truncating_or_appending() {
        let mut buffer = LimitedBuffer::new(5);
        buffer.extend(b"ab").unwrap();
        buffer.extend(b"cde").unwrap();
        buffer.extend(b"").unwrap();
        assert_eq!(buffer.extend(b"f"), Err(BufferError::LimitExceeded));
        assert_eq!(buffer.into_bytes(), b"abcde");
    }

    #[test]
    fn growth_does_not_request_capacity_above_the_limit() {
        let mut buffer = LimitedBuffer::new(13);
        for _ in 0..13 {
            buffer.extend(b"x").unwrap();
            assert!(buffer.bytes.capacity() <= 13);
        }
        assert_eq!(buffer.into_bytes(), b"xxxxxxxxxxxxx");
    }

    #[test]
    fn zero_limit_accepts_only_empty_chunks_without_allocating() {
        let mut buffer = LimitedBuffer::new(0);
        buffer.extend(b"").unwrap();
        assert_eq!(buffer.extend(b"x"), Err(BufferError::LimitExceeded));
        assert_eq!(buffer.bytes.capacity(), 0);
    }
}
