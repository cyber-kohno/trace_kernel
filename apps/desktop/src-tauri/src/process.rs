use crate::file_system::Encoding;
use std::path::Path;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProcessRequest {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub stdin: Option<String>,
    pub stdin_encoding: Encoding,
    pub timeout_ms: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProcessResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: i32,
}

fn is_binary(bytes: &[u8]) -> bool {
    if bytes.contains(&0) {
        return true;
    }

    let mut ctrl = 0;
    for &b in bytes {
        if b < 0x09 || (b > 0x0D && b < 0x20) {
            ctrl += 1;
        }
    }
    ctrl > bytes.len() / 10
}

#[tauri::command]
pub async fn run_process(req: RunProcessRequest) -> Result<RunProcessResult, String> {
    use tokio::io::AsyncWriteExt;
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    if !Path::new(&req.program).exists() {
        return Err("Program not found".to_string());
    }

    let cwd = req.cwd.filter(|value| !value.is_empty());
    let stdin = req.stdin.filter(|value| !value.is_empty());

    let mut command = Command::new(&req.program);
    command
        .args(&req.args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(cwd) = &cwd {
        command.current_dir(cwd);
    }
    if stdin.is_some() {
        command.stdin(std::process::Stdio::piped());
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    if let Some(stdin_text) = stdin {
        let (encoded, _, _) = req.stdin_encoding.to_rs_encoding().encode(&stdin_text);
        if let Some(mut writer) = child.stdin.take() {
            writer
                .write_all(encoded.as_ref())
                .await
                .map_err(|e| format!("Failed to write stdin: {}", e))?;
        }
    }

    let output = timeout(
        Duration::from_millis(req.timeout_ms),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| "Process timeout".to_string())?
    .map_err(|e| format!("Failed to wait process: {}", e))?;

    if is_binary(&output.stdout) {
        return Err("Binary data detected in stdout".to_string());
    }

    Ok(RunProcessResult {
        stdout: output.stdout,
        stderr: output.stderr,
        exit_code: output.status.code().unwrap_or(-1),
    })
}
