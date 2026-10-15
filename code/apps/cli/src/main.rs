mod args;
mod engine;
mod license;
mod output;
use std::{fs, path::PathBuf, sync::atomic::Ordering};

fn run() -> Result<i32, (i32, String)> {
    let values = std::env::args_os()
        .skip(1)
        .map(|s| {
            s.into_string()
                .map_err(|_| (2, "Arguments must be valid Unicode".into()))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let args = args::parse(values).map_err(|e| (2, format!("{e}\n{}", args::USAGE)))?;
    match args.mode {
        args::Mode::Help => {
            println!("{}", args::HELP);
            return Ok(0);
        }
        args::Mode::Version => {
            println!(
                "trace-kernel-cli {} (Workspace {}, API {})",
                env!("CARGO_PKG_VERSION"),
                env!("CLI_WORKSPACE_GEN"),
                env!("CLI_API_GEN")
            );
            return Ok(0);
        }
        _ => {}
    }
    let control = engine::Control::new(args.timeout);
    let signal = control.signal_thread();
    let result = (|| {
        let original = std::env::current_dir().map_err(|e| (1, e.to_string()))?;
        let absolute = |path: PathBuf| {
            if path.is_absolute() {
                path
            } else {
                original.join(path)
            }
        };
        let workspace = absolute(args.workspace.unwrap());
        let explicit_license = args.license.map(absolute);
        let desktop_license = license::desktop_path();
        let cwd = args
            .cwd
            .map(absolute)
            .unwrap_or_else(|| workspace.parent().unwrap().to_path_buf());
        if !cwd.is_dir() {
            return Err((
                2,
                format!("Work directory does not exist: {}", cwd.display()),
            ));
        }
        control.check()?;
        let source = fs::read_to_string(&workspace).map_err(|e| {
            (
                3,
                format!("Cannot read Workspace {}: {e}", workspace.display()),
            )
        })?;
        control.check()?;
        let key = license::load(explicit_license.as_deref(), desktop_license.as_deref())
            .map_err(|e| (4, e))?;
        control.check()?;
        std::env::set_current_dir(cwd).map_err(|e| (2, e.to_string()))?;
        deno_core::v8_set_flags(vec!["trace-kernel-cli".into(), "--stack-size=512".into()]);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| (1, e.to_string()))?;
        let mode = match args.mode {
            args::Mode::List => "list",
            args::Mode::Check => "check",
            _ => "run",
        };
        let report=runtime.block_on(engine::execute(control.clone(),serde_json::json!({"workspace":source,"work":args.work,"mode":mode,"commit":args.commit,"licenseKey":key}),args.memory_mib*1024*1024))?;
        let code = report["code"]
            .as_i64()
            .ok_or_else(|| (1, "Invalid host result".into()))? as i32;
        if code != 0 {
            return Err((
                code,
                report["message"]
                    .as_str()
                    .unwrap_or("Execution failed")
                    .into(),
            ));
        }
        Ok(0)
    })();
    control.finished.store(true, Ordering::Relaxed);
    let _ = signal.join();
    control.check().map_err(|e| control.transaction_error(e))?;
    result
}
fn main() {
    let code = match run() {
        Ok(code) => code,
        Err((code, error)) => {
            eprintln!("{error}");
            code
        }
    };
    std::process::exit(code);
}
