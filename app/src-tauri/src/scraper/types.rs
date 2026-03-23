use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlSource {
    pub url: String,
    pub html: String,
    pub fetched_at: i64,
}

#[derive(Serialize)]
pub enum LoadError {
    InvalidUrl,
    UnsupportedScheme,
    ForbiddenDomain,
    RateLimited { retry_after_ms: u64 },
    TooManyRequests,
    Timeout,
    NetworkError,
    ResponseTooLarge,
    NotHtml,
}
