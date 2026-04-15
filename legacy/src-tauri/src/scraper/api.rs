use std::time::Duration;

use chrono::Utc;
use once_cell::sync::Lazy;
use reqwest::Client;
use tauri::command;
use tokio::sync::Mutex;
use url::Url;

use super::limiter::DomainLimiter;
use super::types::{HtmlSource, HttpRequest, HttpResponse, LoadError};

static LIMITER: Lazy<Mutex<DomainLimiter>> = Lazy::new(|| Mutex::new(DomainLimiter::new()));

static CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("TauriHtmlAnalyzer/1.0")
        .build()
        .unwrap()
});

fn validate_http_url(url: &str) -> Result<Url, LoadError> {
    let parsed = Url::parse(url).map_err(|_| LoadError::InvalidUrl)?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err(LoadError::UnsupportedScheme),
    }
}

async fn wait_for_domain(url: &Url) -> Result<(), LoadError> {
    let host = url.host_str().ok_or(LoadError::InvalidUrl)?;
    let mut limiter = LIMITER.lock().await;
    limiter
        .wait_if_needed(host, Duration::from_secs(3), 30)
        .await?;
    Ok(())
}

#[command]
pub async fn load_html_from_url(url: String) -> Result<HtmlSource, LoadError> {
    let parsed = validate_http_url(&url)?;
    wait_for_domain(&parsed).await?;

    let resp = CLIENT
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|_| LoadError::NetworkError)?;

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") {
        return Err(LoadError::NotHtml);
    }

    let bytes = resp.bytes().await.map_err(|_| LoadError::NetworkError)?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(LoadError::ResponseTooLarge);
    }

    let html = String::from_utf8_lossy(&bytes).to_string();

    Ok(HtmlSource {
        url: parsed.to_string(),
        html,
        fetched_at: Utc::now().timestamp(),
    })
}

#[command]
pub async fn load_http(req: HttpRequest) -> Result<HttpResponse, LoadError> {
    let mut parsed = validate_http_url(&req.url)?;
    if let Some(query) = &req.query {
        let mut pairs = parsed.query_pairs_mut();
        for (key, value) in query {
            pairs.append_pair(key, value);
        }
    }
    wait_for_domain(&parsed).await?;

    let method = req
        .method
        .unwrap_or_else(|| "GET".to_string())
        .parse()
        .map_err(|_| LoadError::InvalidMethod)?;

    let mut builder = CLIENT.request(method, parsed.clone());

    if let Some(timeout_ms) = req.timeout_ms {
        builder = builder.timeout(Duration::from_millis(timeout_ms));
    }

    if let Some(headers) = req.headers {
        for (key, value) in headers {
            builder = builder.header(key, value);
        }
    }

    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let resp = builder
        .send()
        .await
        .map_err(|_| LoadError::NetworkError)?;

    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());

    let headers = resp
        .headers()
        .iter()
        .filter_map(|(key, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (key.as_str().to_string(), v.to_string()))
        })
        .collect();

    let bytes = resp.bytes().await.map_err(|_| LoadError::NetworkError)?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(LoadError::ResponseTooLarge);
    }

    Ok(HttpResponse {
        url: parsed.to_string(),
        status: status.as_u16(),
        ok: status.is_success(),
        content_type,
        headers,
        body: String::from_utf8_lossy(&bytes).to_string(),
        fetched_at: Utc::now().timestamp(),
    })
}
