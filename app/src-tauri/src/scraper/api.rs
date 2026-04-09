use std::time::Duration;

use chrono::Utc;
use once_cell::sync::Lazy;
use reqwest::Client;
use tauri::command;
use tokio::sync::Mutex;
use url::Url;

use super::limiter::DomainLimiter;
use super::types::{HtmlSource, LoadError};

/// グローバルの非同期 Mutex に変更
static LIMITER: Lazy<Mutex<DomainLimiter>> = Lazy::new(|| Mutex::new(DomainLimiter::new()));

static CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(3))
        .user_agent("TauriHtmlAnalyzer/1.0")
        .build()
        .unwrap()
});

#[command]
pub async fn load_html_from_url(url: String) -> Result<HtmlSource, LoadError> {
    // URL 構文チェック
    let parsed = Url::parse(&url).map_err(|_| LoadError::InvalidUrl)?;

    // スキーム制限
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err(LoadError::UnsupportedScheme),
    }

    let host = parsed.host_str().ok_or(LoadError::InvalidUrl)?;

    // 非同期 Mutex でロック
    {
        let mut limiter = LIMITER.lock().await; // <- ここが async lock
        limiter
            .wait_if_needed(
                host,
                Duration::from_secs(3), // ★ 安全デフォルト
                30,                     // ★ 最大30回
            )
            .await?;
    } // <- ロックはここで解放される

    // HTTP GET
    let resp = CLIENT
        .get(parsed.as_str())
        .send()
        .await
        .map_err(|_| LoadError::NetworkError)?;

    // Content-Type チェック
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") {
        return Err(LoadError::NotHtml);
    }

    // サイズ制限（2MB）
    let bytes = resp.bytes().await.map_err(|_| LoadError::NetworkError)?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(LoadError::ResponseTooLarge);
    }

    let html = String::from_utf8_lossy(&bytes).to_string();

    Ok(HtmlSource {
        url: parsed.into_string(),
        html,
        fetched_at: Utc::now().timestamp(),
    })
}
