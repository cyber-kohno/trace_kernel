use std::time::Duration;

use crate::execution_io::Operation;
use crate::resource_limits::{BufferError, LimitedBuffer, HTTP_BODY_MAX_BYTES};
use chrono::Utc;
use once_cell::sync::Lazy;
use reqwest::Client;
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

async fn read_body(mut response: reqwest::Response) -> Result<Vec<u8>, LoadError> {
    let mut buffer = LimitedBuffer::new(HTTP_BODY_MAX_BYTES);
    // Count actual chunks; Content-Length can be absent or describe a HEAD body.
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        buffer.extend(&chunk).map_err(|error| match error {
            BufferError::LimitExceeded => LoadError::ResponseTooLarge,
            BufferError::AllocationFailed => LoadError::ResourceExhausted,
        })?;
    }
    Ok(buffer.into_bytes())
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

    let bytes = read_body(resp).await?;

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

    let bytes = read_body(resp).await?;

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

pub async fn load_html_from_url(
    url: String,
    operation: Operation,
) -> Result<HtmlSource, LoadError> {
    tokio::spawn(async move {
        let parsed = validate_http_url(&url)?;
        run_owned(operation, 8000, async {
            wait_for_domain(&parsed).await?;
            fetch_html(&CLIENT, parsed).await
        })
        .await
    })
    .await
    .map_err(|_| LoadError::NetworkError)?
}
pub async fn load_http(req: HttpRequest, operation: Operation) -> Result<HttpResponse, LoadError> {
    tokio::spawn(async move {
        let parsed = request_url(&req)?;
        let timeout_ms = req.timeout_ms.unwrap_or(8000);
        run_owned(operation, timeout_ms, async {
            wait_for_domain(&parsed).await?;
            fetch_http(&CLIENT, req, parsed).await
        })
        .await
    })
    .await
    .map_err(|_| LoadError::NetworkError)?
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

    #[test]
    fn admission_limit_is_distinct_from_domain_rate_limit_and_execution_unavailability() {
        use crate::execution_io::RegisterError;
        assert_eq!(
            serde_json::to_value(LoadError::from(RegisterError::ConcurrencyLimitExceeded {
                limit: 32
            }))
            .unwrap(),
            "ConcurrencyLimitExceeded"
        );
        assert_eq!(
            serde_json::to_value(LoadError::TooManyRequests).unwrap(),
            "TooManyRequests"
        );
        for error in [RegisterError::Stopped, RegisterError::ExecutionNotFound] {
            assert_eq!(
                serde_json::to_value(LoadError::from(error)).unwrap(),
                "ExecutionUnavailable"
            );
        }
        assert_eq!(
            serde_json::to_value(LoadError::from(RegisterError::ApplicationShuttingDown)).unwrap(),
            "ApplicationShuttingDown"
        );
    }

    fn server(
        body: Option<&'static str>,
    ) -> (
        String,
        tokio::sync::oneshot::Receiver<()>,
        std::sync::mpsc::Sender<()>,
        std::thread::JoinHandle<()>,
    ) {
        let len = body.map(str::len).unwrap_or(2);
        let headers = format!("HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n");
        let chunks = body
            .map(|body| vec![body.as_bytes().to_vec()])
            .unwrap_or_default();
        server_with_response(headers, chunks)
    }

    fn server_with_response(
        headers: String,
        chunks: Vec<Vec<u8>>,
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
            stream
                .set_write_timeout(Some(Duration::from_secs(3)))
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
            stream.write_all(headers.as_bytes()).unwrap();
            for chunk in chunks {
                if stream.write_all(&chunk).is_err() {
                    // An early byte-limit failure can close the socket mid-response.
                    break;
                }
            }
            let _ = ready_tx.send(());
            let _ = release_rx.recv_timeout(Duration::from_secs(3));
        });
        (url, ready_rx, release_tx, thread)
    }

    async fn fetch_body_for_test(
        io: &ExecutionIo,
        url: String,
        html: bool,
    ) -> Result<String, LoadError> {
        let client = Client::builder().no_proxy().build().unwrap();
        let req = request(url);
        let parsed = request_url(&req).unwrap();
        run_owned(io.register().unwrap(), 2_000, async {
            if html {
                fetch_html(&client, parsed)
                    .await
                    .map(|response| response.html)
            } else {
                fetch_http(&client, req, parsed)
                    .await
                    .map(|response| response.body)
            }
        })
        .await
    }

    #[tokio::test]
    async fn exact_http_body_limit_is_accepted_for_html_and_generic_http() {
        for html in [false, true] {
            let content_type = if html {
                "text/html"
            } else {
                "application/json"
            };
            let headers = format!("HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {HTTP_BODY_MAX_BYTES}\r\nConnection: close\r\n\r\n");
            let (url, _ready, release, thread) =
                server_with_response(headers, vec![vec![b'x'; HTTP_BODY_MAX_BYTES]]);
            let io = ExecutionIo::new();
            let result = fetch_body_for_test(&io, url, html).await.unwrap();
            assert_eq!(result.len(), HTTP_BODY_MAX_BYTES);
            assert!(result.bytes().all(|byte| byte == b'x'));
            io.stop().await.unwrap();
            release.send(()).unwrap();
            thread.join().unwrap();
        }
    }

    #[tokio::test]
    async fn oversized_http_is_rejected_before_eof_for_fixed_chunked_and_unknown_lengths() {
        for html in [false, true] {
            for framing in ["fixed", "chunked", "unknown"] {
                let content_type = if html {
                    "text/html"
                } else {
                    "application/json"
                };
                let mut headers = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nConnection: close\r\n"
                );
                let body = vec![b'x'; HTTP_BODY_MAX_BYTES + 1];
                let chunks = match framing {
                    "fixed" => {
                        // Advertise more than we send and keep the body stalled after overflow.
                        headers.push_str(&format!(
                            "Content-Length: {}\r\n",
                            HTTP_BODY_MAX_BYTES + 8192
                        ));
                        vec![body]
                    }
                    "chunked" => {
                        headers.push_str("Transfer-Encoding: chunked\r\n");
                        let mut frame = format!("{:x}\r\n", body.len()).into_bytes();
                        frame.extend_from_slice(&body);
                        frame.extend_from_slice(b"\r\n");
                        // No terminating zero chunk: waiting for the entire response is wrong.
                        vec![frame]
                    }
                    _ => vec![body],
                };
                headers.push_str("\r\n");
                let (url, _ready, release, thread) = server_with_response(headers, chunks);
                let io = ExecutionIo::new();
                let result = fetch_body_for_test(&io, url, html).await;
                assert!(
                    matches!(result, Err(LoadError::ResponseTooLarge)),
                    "html={html}, framing={framing}: {:?}",
                    result.err()
                );
                io.stop().await.unwrap();
                release.send(()).unwrap();
                thread.join().unwrap();
            }
        }
    }

    #[tokio::test]
    async fn head_with_large_advertised_length_keeps_its_empty_body() {
        let headers = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            HTTP_BODY_MAX_BYTES + 1
        );
        let (url, _ready, release, thread) = server_with_response(headers, vec![]);
        let io = ExecutionIo::new();
        let client = Client::builder().no_proxy().build().unwrap();
        let mut req = request(url);
        req.method = Some("HEAD".into());
        let parsed = request_url(&req).unwrap();
        let response = run_owned(
            io.register().unwrap(),
            2_000,
            fetch_http(&client, req, parsed),
        )
        .await
        .unwrap();
        assert_eq!(response.status, 200);
        assert!(response.body.is_empty());
        io.stop().await.unwrap();
        release.send(()).unwrap();
        thread.join().unwrap();
    }

    #[tokio::test]
    async fn split_utf8_bytes_are_decoded_after_assembling_the_limited_body() {
        let (url, _ready, release, thread) = server_with_response(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".into(),
            vec![
                b"1\r\n\xe3\r\n".to_vec(),
                b"2\r\n\x81\x82\r\n0\r\n\r\n".to_vec(),
            ],
        );
        let io = ExecutionIo::new();
        assert_eq!(
            fetch_body_for_test(&io, url, false).await.unwrap(),
            "\u{3042}"
        );
        io.stop().await.unwrap();
        release.send(()).unwrap();
        thread.join().unwrap();
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
        let held = (1..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
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
        assert!(matches!(
            io.register(),
            Err(crate::execution_io::RegisterError::ConcurrencyLimitExceeded { .. })
        ));
        drop(held);
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
