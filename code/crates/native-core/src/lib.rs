//! Native I/O shared by Desktop and future CLI adapters.
//! Application state, IPC commands and UI notifications stay with the caller.

pub mod blocking_io;
pub mod execution_io;
pub mod file_io_dispatch;
pub mod file_system;
pub mod http;
pub mod mcp;
pub mod parser;
pub mod process;
pub mod resource_limits;
pub mod scan;
pub mod stream;
