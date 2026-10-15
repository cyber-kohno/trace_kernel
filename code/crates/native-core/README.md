# Trace Kernel native core

Shared Rust implementation for execution-owned I/O, blocking operations,
filesystem operations, resource limits, directory scans, process execution,
HTTP, DOM, Excel parsing, retained channel output and MCP transport. It has no Tauri,
window, IPC or application-state dependency.

Desktop command adapters import these modules through re-exports under
`code/apps/desktop/src-tauri/src`. Operation guards remain owned by blocking tasks;
Process and HTTP operations also keep their guards in owned Tokio tasks;
dropping an IPC or JavaScript caller does not release a still-running task's
concurrency slot. `ExecutionIo::stop()` rejects new operations, requests
cancellation and waits for all accepted guards to be released.

```powershell
cargo test --locked --manifest-path code/crates/native-core/Cargo.toml
cargo test --locked --manifest-path code/apps/desktop/src-tauri/Cargo.toml --lib
```

Desktop keeps execution admission, application shutdown, command registration,
MCP descriptor-directory selection and notification adapters. MCP receives an
event sink that enqueues host requests/cancellation; it owns the listener,
request threads, pending responses, stop/join and descriptor cleanup.
The event sink must not re-enter respond/stop synchronously during publication.
Product CLI command dispatch and the remaining native integrations are subsequent steps.
The current move preserves the existing functions, limits and regression tests.

`file_io_dispatch::FileIoRequest` decodes the fifteen filesystem commands,
directory scans and Excel loading for hosts without Tauri. It takes an already admitted
`Operation` and runs the same filesystem/scan implementations via blocking_io.
`parser::dom_dispatch::DomRequest` decodes the twelve DOM commands against an
execution-owned DomStore. The V8 verification host uses these paths and the
owned process/HTTP entry points for actual native service tests.
Cleanup failures remain recorded after the final operation releases its slot;
hosts must check them before applying a transaction and await stop afterwards.

`stream::channel::ChannelStore` preserves Desktop's byte/line/count limits and
line-joining/read-range rules. `stream::dispatch::ChannelRequest` provides typed
requests for embedding hosts. A retained snapshot can be taken before clearing
the execution-owned store; no output-file layout is defined by this library.
