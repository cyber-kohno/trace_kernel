use std::path::Path;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")] // ここでキャメルケースに変換
pub struct RunProcessRequest {
    pub program: String,   // exe のフルパス
    pub args: Vec<String>, // 引数（分解済み）
    pub timeout_ms: u64,   // タイムアウト
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")] // ここでキャメルケースに変換
pub struct RunProcessResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: i32,
}

fn is_binary(bytes: &[u8]) -> bool {
    // NUL が含まれていたら即バイナリ
    if bytes.contains(&0) {
        return true;
    }

    // 制御文字が多すぎる場合もバイナリ扱い
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
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};
    use std::path::Path;

    // --- 1. パス存在チェック ---
    if !Path::new(&req.program).exists() {
        return Err("Program not found".to_string());
    }

    // --- 2. プロセス生成 ---
    let child = Command::new(&req.program)
        .args(&req.args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    // --- 3. timeout 付き wait ---
    let output = timeout(
        Duration::from_millis(req.timeout_ms),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| "Process timeout".to_string())?
    .map_err(|e| format!("Failed to wait process: {}", e))?;

    // --- 4. stdout バイナリ検出 ---
    if is_binary(&output.stdout) {
        return Err("Binary data detected in stdout".to_string());
    }

    Ok(RunProcessResult {
        stdout: output.stdout,
        stderr: output.stderr, // stderr はチェックしない（ログ用途）
        exit_code: output.status.code().unwrap_or(-1),
    })
}
