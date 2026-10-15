use anyhow::Result;
use rmcp::{transport::stdio, ServiceExt};
use tracing_subscriber::EnvFilter;

mod bridge;
mod product_info;
mod resources;
mod server;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if !args.is_empty() {
        anyhow::ensure!(
            args.len() == 1,
            "Use --version, --version-json or no arguments for stdio MCP"
        );
        let identity = product_info::identity();
        if args[0] == "--version-json" {
            println!("{}", serde_json::to_string(&identity)?);
        } else if args[0] == "--version" || args[0] == "-V" {
            println!(
                "trace-kernel-mcp {} (bridge {}; API {}; Workspace {})",
                identity.release_version,
                identity.bridge_protocol_gen,
                identity.api_gen,
                identity.workspace_gen
            );
        } else {
            anyhow::bail!("Use --version, --version-json or no arguments for stdio MCP");
        }
        return Ok(());
    }
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    tracing::info!("starting Trace Kernel MCP stdio server");
    let service = server::TraceKernelMcpServer::new().serve(stdio()).await?;
    service.waiting().await?;
    tracing::info!("Trace Kernel MCP stdio server stopped");
    Ok(())
}
