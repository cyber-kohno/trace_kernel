use crate::execution_io::Operation;
use crate::file_system::Encoding;
use crate::runtime::AppState;
use std::path::Path;
use std::process::Stdio;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use tokio::time::{sleep_until, Duration, Instant};

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

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProcessResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: i32,
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0)
        || bytes
            .iter()
            .filter(|&&b| b < 0x09 || (b > 0x0D && b < 0x20))
            .count()
            > bytes.len() / 10
}

async fn read_output(mut reader: impl AsyncRead + Unpin, name: &str) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .map_err(|e| format!("Failed to read {name}: {e}"))?;
    Ok(bytes)
}

async fn run_owned(
    req: RunProcessRequest,
    mut operation: Operation,
) -> Result<RunProcessResult, String> {
    if operation.is_cancelled() {
        return Err("Process cancelled".into());
    }
    if req.timeout_ms == 0 {
        return Err("Process timeout must be positive".into());
    }
    let deadline = Instant::now()
        .checked_add(Duration::from_millis(req.timeout_ms))
        .ok_or("Invalid process timeout")?;
    if !Path::new(&req.program).exists() {
        return Err("Program not found".into());
    }

    let stdin_text = req.stdin.filter(|value| !value.is_empty());
    let mut command = Command::new(&req.program);
    command
        .args(&req.args)
        .kill_on_drop(true)
        .stdin(if stdin_text.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = req.cwd.filter(|value| !value.is_empty()) {
        command.current_dir(cwd);
    }
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {e}"))?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().ok_or("stdout pipe not available")?;
    let stderr = child.stderr.take().ok_or("stderr pipe not available")?;
    let input = stdin_text.map(|text| {
        req.stdin_encoding
            .to_rs_encoding()
            .encode(&text)
            .0
            .into_owned()
    });

    let result = {
        // Drain both outputs while writing input: a full pipe must not deadlock the parent.
        let capture = async {
            let write = async {
                if let (Some(mut writer), Some(bytes)) = (stdin, input) {
                    writer
                        .write_all(&bytes)
                        .await
                        .map_err(|e| format!("Failed to write stdin: {e}"))?;
                    writer
                        .shutdown()
                        .await
                        .map_err(|e| format!("Failed to close stdin: {e}"))?;
                }
                Ok::<_, String>(())
            };
            let wait = async {
                child
                    .wait()
                    .await
                    .map_err(|e| format!("Failed to wait process: {e}"))
            };
            let (_, stdout, stderr, status) = tokio::try_join!(
                write,
                read_output(stdout, "stdout"),
                read_output(stderr, "stderr"),
                wait
            )?;
            Ok(RunProcessResult {
                stdout,
                stderr,
                exit_code: status.code().unwrap_or(-1),
            })
        };
        tokio::select! {
            biased;
            _ = operation.cancelled() => Err("Process cancelled".to_string()),
            _ = sleep_until(deadline) => Err("Process timeout".to_string()),
            result = capture => result,
        }
    };

    // Keep Child ownership after cancelling capture so termination is awaited, not just requested.
    if result.is_err() {
        if let Err(error) = child.kill().await {
            let message = format!("Failed to terminate process: {error}");
            operation.cleanup_failed(message.clone());
            return Err(format!("{}; {message}", result.unwrap_err()));
        }
    }
    let output = result?;
    if is_binary(&output.stdout) {
        return Err("Binary data detected in stdout".into());
    }
    Ok(output)
}

#[tauri::command]
pub async fn run_process(
    state: tauri::State<'_, AppState>,
    execution_id: String,
    req: RunProcessRequest,
) -> Result<RunProcessResult, String> {
    let operation = state.register_io(&execution_id)?;
    run_owned(req, operation).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_io::ExecutionIo;
    use std::io::{Read, Write};

    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("trace-kernel-process-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn request(
            &self,
            helper: &str,
            input: Option<String>,
            timeout_ms: u64,
        ) -> RunProcessRequest {
            RunProcessRequest {
                program: std::env::current_exe()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                args: vec![
                    "--exact".into(),
                    format!("process::tests::{helper}"),
                    "--ignored".into(),
                    "--nocapture".into(),
                ],
                cwd: Some(self.0.to_string_lossy().into_owned()),
                stdin: input,
                stdin_encoding: Encoding::Utf8,
                timeout_ms,
            }
        }
        async fn ready(&self) {
            tokio::time::timeout(Duration::from_secs(5), async {
                while !self.0.join("ready.txt").exists() {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .expect("child did not start");
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    // Ignored helpers are invoked only as child fixtures with --exact --ignored.
    fn is_fixture() -> bool {
        let cwd = std::env::current_dir().unwrap();
        std::env::args().any(|arg| arg == "--exact")
            && cwd
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("trace-kernel-process-")
            && cwd.parent().unwrap().canonicalize().unwrap()
                == std::env::temp_dir().canonicalize().unwrap()
    }

    #[test]
    #[ignore = "subprocess fixture"]
    fn child_echo() {
        if !is_fixture() {
            return;
        }
        let mut input = Vec::new();
        std::io::stdin().read_to_end(&mut input).unwrap();
        println!("INPUT_LENGTH:{}", input.len());
        std::io::stdout().write_all(&input).unwrap();
        eprintln!("STDERR_MARKER");
        std::process::exit(7);
    }

    #[test]
    #[ignore = "subprocess fixture"]
    fn child_bidirectional() {
        if !is_fixture() {
            return;
        }
        std::io::stdout()
            .write_all(&vec![b'a'; 512 * 1024])
            .unwrap();
        std::io::stderr()
            .write_all(&vec![b'b'; 512 * 1024])
            .unwrap();
        let mut input = Vec::new();
        std::io::stdin().read_to_end(&mut input).unwrap();
        println!("INPUT_LENGTH:{}", input.len());
    }

    #[test]
    #[ignore = "subprocess fixture"]
    fn child_sleep() {
        if !is_fixture() {
            return;
        }
        std::fs::write("ready.txt", std::process::id().to_string()).unwrap();
        std::thread::sleep(Duration::from_secs(30));
        std::fs::write("late.txt", "must not run after cancellation").unwrap();
    }

    #[test]
    #[ignore = "subprocess fixture"]
    fn child_stdin_hex() {
        if !is_fixture() {
            return;
        }
        let mut input = Vec::new();
        std::io::stdin().read_to_end(&mut input).unwrap();
        println!(
            "BYTES:{}",
            input.iter().map(|b| format!("{b:02x}")).collect::<String>()
        );
    }

    #[test]
    #[ignore = "subprocess fixture"]
    fn child_binary() {
        if !is_fixture() {
            return;
        }
        std::io::stdout().write_all(&[0]).unwrap();
    }

    #[tokio::test]
    async fn preserves_stdin_stdout_stderr_and_nonzero_exit() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let result = run_owned(
            fixture.request("child_echo", Some("hello".into()), 5_000),
            io.register().unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(result.exit_code, 7);
        assert!(String::from_utf8_lossy(&result.stdout).contains("INPUT_LENGTH:5\nhello"));
        assert!(String::from_utf8_lossy(&result.stderr).contains("STDERR_MARKER"));
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn no_input_closes_stdin_instead_of_inheriting_console() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let result = run_owned(
            fixture.request("child_echo", None, 5_000),
            io.register().unwrap(),
        )
        .await
        .unwrap();
        assert!(String::from_utf8_lossy(&result.stdout).contains("INPUT_LENGTH:0"));
    }

    #[tokio::test]
    async fn stdin_and_both_outputs_are_pumped_concurrently() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let result = run_owned(
            fixture.request("child_bidirectional", Some("x".repeat(512 * 1024)), 5_000),
            io.register().unwrap(),
        )
        .await
        .unwrap();
        assert!(String::from_utf8_lossy(&result.stdout).contains("INPUT_LENGTH:524288"));
        assert!(result.stderr.len() >= 512 * 1024);
    }

    #[tokio::test]
    async fn cancellation_waits_for_started_child_termination() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let request = fixture.request("child_sleep", None, 10_000);
        let operation = io.register().unwrap();
        let task = tokio::spawn(run_owned(request, operation));
        fixture.ready().await;
        tokio::time::timeout(Duration::from_secs(3), io.stop())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(task.await.unwrap().unwrap_err(), "Process cancelled");
        assert!(!fixture.0.join("late.txt").exists());
        assert!(io.register().is_err());
    }

    #[tokio::test]
    async fn deadline_covers_a_blocked_stdin_writer() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let started = Instant::now();
        let result = run_owned(
            fixture.request("child_sleep", Some("x".repeat(4 * 1024 * 1024)), 1_000),
            io.register().unwrap(),
        )
        .await;
        assert_eq!(result.unwrap_err(), "Process timeout");
        assert!(started.elapsed() < Duration::from_secs(5));
        assert!(fixture.0.join("ready.txt").exists());
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn cancelled_operation_does_not_spawn_a_child() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let operation = io.register().unwrap();
        let stop = tokio::spawn({
            let io = io.clone();
            async move { io.stop().await }
        });
        tokio::task::yield_now().await;
        assert_eq!(
            run_owned(fixture.request("child_sleep", None, 5_000), operation)
                .await
                .unwrap_err(),
            "Process cancelled"
        );
        stop.await.unwrap().unwrap();
        assert!(!fixture.0.join("ready.txt").exists());
    }

    #[tokio::test]
    async fn zero_timeout_and_spawn_failure_release_the_operation() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        assert!(run_owned(
            fixture.request("child_sleep", None, 0),
            io.register().unwrap()
        )
        .await
        .is_err());
        let mut request = fixture.request("child_sleep", None, 5_000);
        request.program = fixture.0.join("missing.exe").to_string_lossy().into_owned();
        assert_eq!(
            run_owned(request, io.register().unwrap())
                .await
                .unwrap_err(),
            "Program not found"
        );
        let mut request = fixture.request("child_sleep", None, 5_000);
        request.cwd = Some(
            fixture
                .0
                .join("missing-directory")
                .to_string_lossy()
                .into_owned(),
        );
        assert!(run_owned(request, io.register().unwrap())
            .await
            .unwrap_err()
            .contains("spawn"));
        io.stop().await.unwrap();
    }

    #[tokio::test]
    async fn shift_jis_stdin_encoding_is_preserved() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        let mut request = fixture.request("child_stdin_hex", Some("\u{3042}".into()), 5_000);
        request.stdin_encoding = Encoding::Sjis;
        let result = run_owned(request, io.register().unwrap()).await.unwrap();
        assert!(String::from_utf8_lossy(&result.stdout).contains("BYTES:82a0"));
    }

    #[tokio::test]
    async fn binary_stdout_is_rejected_after_process_exit() {
        let fixture = Fixture::new();
        let io = ExecutionIo::new();
        assert_eq!(
            run_owned(
                fixture.request("child_binary", None, 5_000),
                io.register().unwrap()
            )
            .await
            .unwrap_err(),
            "Binary data detected in stdout"
        );
        io.stop().await.unwrap();
    }
}
