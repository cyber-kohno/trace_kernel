use std::time::Duration;

use crate::execution_io::Operation;
use crate::runtime::AppState;
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

fn network_error(error: reqwest::Error) -> LoadError {
    if error.is_timeout() {
        LoadError::Timeout
    } else {
        LoadError::NetworkError
    }
}

async fn fetch_html(client: &Client, parsed: Url) -> Result<HtmlSource, LoadError> {
    let resp = client
        .get(parsed.as_str())
        .send()
        .await
        .map_err(network_error)?;

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !content_type.contains("text/html") {
        return Err(LoadError::NotHtml);
    }

    let bytes = resp.bytes().await.map_err(network_error)?;
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

fn request_url(req: &HttpRequest) -> Result<Url, LoadError> {
    let mut parsed = validate_http_url(&req.url)?;
    if let Some(query) = &req.query {
        let mut pairs = parsed.query_pairs_mut();
        for (key, value) in query {
            pairs.append_pair(key, value);
        }
    }
    Ok(parsed)
}

async fn fetch_http(
    client: &Client,
    req: HttpRequest,
    parsed: Url,
) -> Result<HttpResponse, LoadError> {
    let method = req
        .method
        .unwrap_or_else(|| "GET".to_string())
        .parse()
        .map_err(|_| LoadError::InvalidMethod)?;

    let mut builder = client.request(method, parsed.clone());

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

    let resp = builder.send().await.map_err(network_error)?;

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

    let bytes = resp.bytes().await.map_err(network_error)?;
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

async fn run_owned<T>(
    mut operation: Operation,
    timeout_ms: u64,
    work: impl std::future::Future<Output = Result<T, LoadError>>,
) -> Result<T, LoadError> {
    if timeout_ms == 0
        || tokio::time::Instant::now()
            .checked_add(Duration::from_millis(timeout_ms))
            .is_none()
    {
        return Err(LoadError::InvalidTimeout);
    }
    tokio::select! {
        biased;
        _ = operation.cancelled() => Err(LoadError::Cancelled),
        result = tokio::time::timeout(Duration::from_millis(timeout_ms), work) => result.map_err(|_| LoadError::Timeout)?,
    }
}

#[command]
pub async fn load_html_from_url(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    url: String,
) -> Result<HtmlSource, LoadError> {
    let operation = state
        .register_io(&execution_id)
        .map_err(|_| LoadError::ExecutionUnavailable)?;
    let parsed = validate_http_url(&url)?;
    run_owned(operation, 8_000, async {
        wait_for_domain(&parsed).await?;
        fetch_html(&CLIENT, parsed).await
    })
    .await
}

#[command]
pub async fn load_http(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    req: HttpRequest,
) -> Result<HttpResponse, LoadError> {
    let operation = state
        .register_io(&execution_id)
        .map_err(|_| LoadError::ExecutionUnavailable)?;
    let parsed = request_url(&req)?;
    let timeout_ms = req.timeout_ms.unwrap_or(8_000);
    run_owned(operation, timeout_ms, async {
        wait_for_domain(&parsed).await?;
        fetch_http(&CLIENT, req, parsed).await
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    use std::io::{Read, Write};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    struct Probe(Arc<AtomicBool>);
    impl Drop for Probe {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn stopping_drops_in_flight_future_before_reporting_release() {
        let io = ExecutionIo::new();
        let released = Arc::new(AtomicBool::new(false));
        let probe = Probe(released.clone());
        let operation = io.register().unwrap();
        let task = tokio::spawn(run_owned(operation, 5_000, async move {
            let _probe = probe;
            std::future::pending::<Result<(), LoadError>>().await
        }));
        tokio::task::yield_now().await;
        io.stop().await.unwrap();
        assert!(matches!(task.await.unwrap(), Err(LoadError::Cancelled)));
        assert!(released.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn deadline_includes_queue_wait_and_releases_held_mutex() {
        let io = ExecutionIo::new();
        let queue = Mutex::new(());
        let result = run_owned(io.register().unwrap(), 20, async {
            let _lock = queue.lock().await;
            std::future::pending::<Result<(), LoadError>>().await
        })
        .await;
        assert!(matches!(result, Err(LoadError::Timeout)));
        assert!(queue.try_lock().is_ok());
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn zero_timeout_does_not_start_work() {
        let io = ExecutionIo::new();
        let result: Result<(), _> = run_owned(io.register().unwrap(), 0, async {
            panic!("must not start")
        })
        .await;
        assert!(matches!(result, Err(LoadError::InvalidTimeout)));
        io.stop().await.unwrap();
    }

    fn request(url: String) -> HttpRequest {
        HttpRequest {
            url,
            method: None,
            query: None,
            headers: None,
            body: None,
            timeout_ms: None,
        }
    }

    fn server(
        body: Option<&'static str>,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<()>,
        std::sync::mpsc::Sender<()>,
        std::thread::JoinHandle<()>,
    ) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let started = std::time::Instant::now();
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            started.elapsed() < Duration::from_secs(5),
                            "HTTP fixture was never contacted"
                        );
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("accept failed: {error}"),
                }
            };
            // The accepted socket must not inherit the listener's polling mode.
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut buffer = [0; 8192];
            let mut request = Vec::new();
            loop {
                let len = stream.read(&mut buffer).unwrap();
                assert!(len > 0, "HTTP client closed before sending headers");
                request.extend_from_slice(&buffer[..len]);
                if request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                    break;
                }
                assert!(request.len() < 8192, "HTTP fixture headers too large");
            }
            let len = body.map(str::len).unwrap_or(2);
            write!(stream, "HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n").unwrap();
            if let Some(body) = body {
                stream.write_all(body.as_bytes()).unwrap();
            }
            let _ = ready_tx.send(());
            let _ = release_rx.recv_timeout(Duration::from_secs(3));
        });
        (url, ready_rx, release_tx, thread)
    }

    #[test]
    fn fixture_waits_for_headers_that_arrive_after_connection() {
        let (url, ready, release, thread) = server(Some("{}"));
        let address = url.strip_prefix("http://").unwrap();
        let mut stream = std::net::TcpStream::connect(address).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        std::thread::sleep(Duration::from_millis(50));
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .unwrap();
        ready.blocking_recv().unwrap();
        release.send(()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        thread.join().unwrap();
        assert!(response.starts_with("HTTP/1.1 201 Created\r\n"));
        assert!(response.ends_with("{}"));
    }

    #[tokio::test]
    async fn cancellation_covers_http_body_read_not_just_response_headers() {
        let (url, ready, release, thread) = server(None);
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let task = tokio::spawn(async move {
            let client = Client::builder().no_proxy().build().unwrap();
            let req = request(url);
            let parsed = request_url(&req).unwrap();
            run_owned(operation, 5_000, fetch_http(&client, req, parsed)).await
        });
        tokio::time::timeout(Duration::from_secs(5), ready)
            .await
            .unwrap()
            .unwrap();
        io.stop().await.unwrap();
        assert!(matches!(task.await.unwrap(), Err(LoadError::Cancelled)));
        release.send(()).unwrap();
        thread.join().unwrap();
    }

    #[tokio::test]
    async fn deadline_covers_stalled_http_body() {
        let (url, ready, release, thread) = server(None);
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let task = tokio::spawn(async move {
            let client = Client::builder().no_proxy().build().unwrap();
            let req = request(url);
            let parsed = request_url(&req).unwrap();
            run_owned(operation, 500, fetch_http(&client, req, parsed)).await
        });
        tokio::time::timeout(Duration::from_secs(5), ready)
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(task.await.unwrap(), Err(LoadError::Timeout)));
        io.stop().await.unwrap();
        release.send(()).unwrap();
        thread.join().unwrap();
    }

    #[tokio::test]
    async fn completed_http_response_retains_payload_and_metadata() {
        let (url, _ready, release, thread) = server(Some("{\"value\":1}"));
        let io = ExecutionIo::new();
        let client = Client::builder().no_proxy().build().unwrap();
        let mut req = request(url);
        req.query = Some(std::collections::HashMap::from([(
            "key".into(),
            "a b".into(),
        )]));
        let parsed = request_url(&req).unwrap();
        let result = run_owned(
            io.register().unwrap(),
            5_000,
            fetch_http(&client, req, parsed),
        )
        .await
        .unwrap();
        assert_eq!(result.status, 201);
        assert!(result.ok);
        assert_eq!(result.body, "{\"value\":1}");
        assert_eq!(result.content_type.as_deref(), Some("application/json"));
        assert!(result.url.ends_with("?key=a+b"));
        assert!(result.fetched_at > 0);
        io.stop().await.unwrap();
        release.send(()).unwrap();
        thread.join().unwrap();
    }
}
