use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

pub const USAGE: &str = "Usage: trace-kernel-cli [OPTIONS] <WORKSPACE_FILE> <WORK_NAME>\n       trace-kernel-cli --check [OPTIONS] <WORKSPACE_FILE> <WORK_NAME>\n       trace-kernel-cli --list <WORKSPACE_FILE>\nUse --help for details.";
pub const HELP: &str = "Trace Kernel CLI\n\nUsage: trace-kernel-cli [OPTIONS] <WORKSPACE_FILE> <WORK_NAME>\n\nOptions:\n  --check                 Validate without executing Work\n  --list                  List Work names and output methods as JSON\n  --commit                Apply the VFS transaction after successful execution\n  --timeout <SECONDS>     Overall deadline (default: 0, unlimited)\n  --memory-limit <MIB>    V8 memory budget, 64..512 (default: 256)\n  --cwd <DIRECTORY>       Work directory (default: Workspace parent)\n  --license-file <FILE>   Signed license.json; otherwise use Desktop's saved license\n  -h, --help              Show this help\n  -V, --version           Show CLI and Workspace/API generations\n\nDirect file operations, processes and HTTP execute even without --commit.\nChannel output is JSON Lines; diagnostics and state events go to stderr.\n";

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode {
    Run,
    Check,
    List,
    Help,
    Version,
}
#[derive(Debug)]
pub struct Args {
    pub mode: Mode,
    pub workspace: Option<PathBuf>,
    pub work: Option<String>,
    pub commit: bool,
    pub timeout: u64,
    pub memory_mib: usize,
    pub cwd: Option<PathBuf>,
    pub license: Option<PathBuf>,
}
pub fn parse(values: Vec<String>) -> Result<Args, String> {
    let mut args = Args {
        mode: Mode::Run,
        workspace: None,
        work: None,
        commit: false,
        timeout: 0,
        memory_mib: 256,
        cwd: None,
        license: None,
    };
    let mut positionals = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut options = true;
    let mut values = values.into_iter();
    while let Some(value) = values.next() {
        if options && value == "--" {
            options = false;
            continue;
        }
        if options && value.starts_with('-') {
            let key = match value.as_str() {
                "-h" => "--help",
                "-V" => "--version",
                name => name,
            };
            if !seen.insert(key.to_string()) {
                return Err(format!("Duplicate option: {value}"));
            }
            match key {
                "--help" | "--version" | "--check" | "--list" => {
                    if args.mode != Mode::Run {
                        return Err("Execution modes are mutually exclusive".into());
                    }
                    args.mode = match key {
                        "--help" => Mode::Help,
                        "--version" => Mode::Version,
                        "--check" => Mode::Check,
                        _ => Mode::List,
                    };
                }
                "--commit" => args.commit = true,
                "--cwd" | "--license-file" | "--timeout" | "--memory-limit" => {
                    let parameter = values
                        .next()
                        .ok_or_else(|| format!("Missing value for {key}"))?;
                    match key {
                        "--cwd" => args.cwd = Some(parameter.into()),
                        "--license-file" => args.license = Some(parameter.into()),
                        "--timeout" => {
                            args.timeout = parameter
                                .parse()
                                .map_err(|_| "Invalid timeout: use a non-negative integer")?;
                            if Instant::now()
                                .checked_add(Duration::from_secs(args.timeout))
                                .is_none()
                            {
                                return Err("Timeout is outside the supported clock range".into());
                            }
                        }
                        _ => {
                            args.memory_mib =
                                parameter.parse().map_err(|_| "Invalid memory limit")?;
                            if !(64..=512).contains(&args.memory_mib) {
                                return Err("Memory limit must be 64..512 MiB".into());
                            }
                        }
                    }
                }
                _ => return Err(format!("Unknown option: {value}")),
            }
        } else {
            positionals.push(value);
        }
    }
    if matches!(args.mode, Mode::Help | Mode::Version) {
        return Ok(args);
    }
    if args.commit && args.mode != Mode::Run {
        return Err("--commit is only valid in execution mode".into());
    }
    if args.mode == Mode::List && args.cwd.is_some() {
        return Err("--cwd is not used by --list".into());
    }
    let count = if args.mode == Mode::List { 1 } else { 2 };
    if positionals.len() != count {
        return Err(format!(
            "Expected {count} positional arguments, received {}",
            positionals.len()
        ));
    }
    args.workspace = Some(positionals.remove(0).into());
    args.work = positionals.pop();
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }
    #[test]
    fn exact_names_and_option_terminator() {
        let a = parse(input(&["--", "a.trk", "- 日本語 "])).unwrap();
        assert_eq!(a.work.as_deref(), Some("- 日本語 "));
    }
    #[test]
    fn modes_and_ranges() {
        for v in [
            vec![],
            input(&["a.trk"]),
            input(&["--list", "--check", "a.trk"]),
            input(&["a.trk", "W", "--memory-limit", "63"]),
            input(&["a.trk", "W", "--timeout", "-1"]),
            input(&["--check", "a.trk", "W", "--commit"]),
        ] {
            assert!(parse(v).is_err());
        }
        assert!(parse(input(&["--help"])).is_ok());
        assert_eq!(parse(input(&["--list", "a.trk"])).unwrap().mode, Mode::List);
    }
}
