use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

pub struct DomainState {
    pub last_access: Instant,
    pub request_count: u32,
}

pub struct DomainLimiter {
    domains: HashMap<String, DomainState>,
}

impl DomainLimiter {
    pub fn new() -> Self {
        Self {
            domains: HashMap::new(),
        }
    }

    pub async fn wait_if_needed(
        &mut self,
        domain: &str,
        min_interval: Duration,
        max_requests: u32,
    ) -> Result<(), super::types::LoadError> {
        let now = Instant::now();

        let state = self
            .domains
            .entry(domain.to_string())
            .or_insert(DomainState {
                last_access: Instant::now() - min_interval,
                request_count: 0,
            });

        if state.request_count >= max_requests {
            return Err(super::types::LoadError::TooManyRequests);
        }

        let next_allowed = state.last_access + min_interval;
        if now < next_allowed {
            let wait = next_allowed - now;
            tokio::time::sleep(wait).await;
        }

        state.last_access = Instant::now();
        state.request_count += 1;

        Ok(())
    }
}
