use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlSource {
    pub url: String,
    pub html: String,
    pub fetched_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub url: String,
    pub method: Option<String>,
    pub query: Option<HashMap<String, String>>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub url: String,
    pub status: u16,
    pub ok: bool,
    pub content_type: Option<String>,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub fetched_at: i64,
}

#[derive(Debug, Serialize)]
pub enum LoadError {
    Cancelled,
    Timeout,
    ExecutionUnavailable,
    ConcurrencyLimitExceeded,
    ApplicationShuttingDown,
    InvalidTimeout,
    InvalidUrl,
    InvalidMethod,
    UnsupportedScheme,
    TooManyRequests,
    NetworkError,
    ResponseTooLarge,
    ResourceExhausted,
    NotHtml,
}

impl From<crate::execution_io::RegisterError> for LoadError {
    fn from(error: crate::execution_io::RegisterError) -> Self {
        use crate::execution_io::RegisterError;
        match error {
            RegisterError::ApplicationShuttingDown => Self::ApplicationShuttingDown,
            RegisterError::ConcurrencyLimitExceeded { .. } => Self::ConcurrencyLimitExceeded,
            RegisterError::ExecutionNotFound | RegisterError::Stopped => Self::ExecutionUnavailable,
        }
    }
}
