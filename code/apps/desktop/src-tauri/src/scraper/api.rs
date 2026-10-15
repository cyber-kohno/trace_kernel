use super::types::{HtmlSource, HttpRequest, HttpResponse, LoadError};
use crate::runtime::AppState;
#[tauri::command]
pub async fn load_html_from_url(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    url: String,
) -> Result<HtmlSource, LoadError> {
    run_html(&state, &execution_id, url).await
}
async fn run_html(
    state: &AppState,
    execution_id: &str,
    url: String,
) -> Result<HtmlSource, LoadError> {
    let operation = state.register_io(execution_id).map_err(LoadError::from)?;
    trace_kernel_native_core::http::api::load_html_from_url(url, operation).await
}
#[tauri::command]
pub async fn load_http(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    req: HttpRequest,
) -> Result<HttpResponse, LoadError> {
    run_http(&state, &execution_id, req).await
}
async fn run_http(
    state: &AppState,
    execution_id: &str,
    req: HttpRequest,
) -> Result<HttpResponse, LoadError> {
    let operation = state.register_io(execution_id).map_err(LoadError::from)?;
    trace_kernel_native_core::http::api::load_http(req, operation).await
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
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
    #[tokio::test]
    async fn saturated_http_and_html_admission_does_not_contact_a_server() {
        use crate::parser::dom::DomStore;
        use crate::runtime::ExecutionContext;
        use crate::stream::channel::ChannelStore;
        let io = ExecutionIo::new();
        let state = AppState {
            executions: std::sync::Mutex::new(std::collections::HashMap::from([(
                "work".into(),
                ExecutionContext {
                    dom_store: DomStore::new(),
                    channel_store: ChannelStore::new(),
                    io: io.clone(),
                },
            )])),
            recovery_snapshot: std::sync::Mutex::new(None),
            ..AppState::default()
        };
        let mut held = (0..crate::resource_limits::NATIVE_IO_MAX_OPERATIONS)
            .map(|_| io.register().unwrap())
            .collect::<Vec<_>>();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        assert!(matches!(
            run_http(&state, "work", request(url.clone())).await,
            Err(LoadError::ConcurrencyLimitExceeded)
        ));
        assert!(matches!(
            run_html(&state, "work", url).await,
            Err(LoadError::ConcurrencyLimitExceeded)
        ));
        assert_eq!(
            listener.accept().err().unwrap().kind(),
            std::io::ErrorKind::WouldBlock
        );
        assert!(matches!(
            run_http(&state, "unknown", request("bad url".into())).await,
            Err(LoadError::ExecutionUnavailable)
        ));
        drop(held.pop());
        // Admission succeeds again; URL validation now runs and releases the temporary slot.
        assert!(matches!(
            run_http(&state, "work", request("bad url".into())).await,
            Err(LoadError::InvalidUrl)
        ));
        assert!(matches!(
            run_html(&state, "work", "bad url".into()).await,
            Err(LoadError::InvalidUrl)
        ));
        drop(held);
        io.stop().await.unwrap();
        assert!(matches!(
            run_html(&state, "work", "bad url".into()).await,
            Err(LoadError::ExecutionUnavailable)
        ));
    }
    #[tokio::test]
    async fn application_shutdown_rejects_http_and_html_before_url_or_network_work() {
        let state = AppState::default();
        state.shutdown_native_io().await.unwrap();
        assert!(matches!(
            run_http(&state, "late", request("invalid".into())).await,
            Err(LoadError::ApplicationShuttingDown)
        ));
        assert!(matches!(
            run_html(&state, "late", "invalid".into()).await,
            Err(LoadError::ApplicationShuttingDown)
        ));
    }
}
