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

#[derive(Serialize)]
pub enum LoadError {
    InvalidUrl,
    InvalidMethod,
    UnsupportedScheme,
    ForbiddenDomain,
    RateLimited { retry_after_ms: u64 },
    TooManyRequests,
    Timeout,
    NetworkError,
    ResponseTooLarge,
    NotHtml,
}
