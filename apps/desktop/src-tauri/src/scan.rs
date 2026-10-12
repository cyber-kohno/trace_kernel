use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanRequest {
    root_path: String,
    limit_depth: Option<u32>,
    dir_conds: Vec<DirCond>,
    file_conds: Vec<FileCond>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct BaseCond {
    pattern: String,
    is_exclude: bool,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct DirCond {
    #[serde(flatten)]
    base: BaseCond,
    depth: Option<u32>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct FileCond {
    #[serde(flatten)]
    base: BaseCond,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanResponse {
    result: String,
    node: Node,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Node {
    name: String,
    children: Option<Vec<Node>>,
}

#[derive(Serialize, Debug)]
pub struct Progress {
    pub path: String,
    pub name: String,
    pub depth: u32,
    pub counter: u32,
}

struct CompiledCond {
    pattern: Regex,
    is_exclude: bool,
    depth: Option<u32>,
}

struct Conditions {
    dirs: Vec<CompiledCond>,
    files: Vec<CompiledCond>,
}

impl CompiledCond {
    fn new(base: &BaseCond, depth: Option<u32>) -> Result<Self, String> {
        let pattern = base
            .pattern
            .split('*')
            .map(regex::escape)
            .collect::<Vec<_>>()
            .join(".*");
        Ok(Self {
            pattern: Regex::new(&format!("^{pattern}$"))
                .map_err(|e| format!("Invalid scan pattern: {e}"))?,
            is_exclude: base.is_exclude,
            depth,
        })
    }
}

fn name_for(path: &Path) -> Result<String, String> {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("Scan path is not valid UTF-8: {}", path.display()))
}

pub fn scan_directory(
    req: ScanRequest,
    mut report: impl FnMut(&Progress),
    check: &dyn Fn() -> Result<(), String>,
) -> Result<ScanResponse, String> {
    check()?;
    let conditions = Conditions {
        dirs: req
            .dir_conds
            .iter()
            .map(|c| {
                check()?;
                CompiledCond::new(&c.base, c.depth)
            })
            .collect::<Result<_, _>>()?,
        files: req
            .file_conds
            .iter()
            .map(|c| {
                check()?;
                CompiledCond::new(&c.base, None)
            })
            .collect::<Result<_, _>>()?,
    };
    check()?;
    let root = Path::new(&req.root_path);
    let metadata =
        fs::metadata(root).map_err(|e| format!("Unable to inspect {}: {e}", root.display()))?;
    if !metadata.is_dir() {
        return Err(format!(
            "The specified path is not a directory: {}",
            root.display()
        ));
    }
    let mut counter = 0;
    let node = search_file_rec(
        root,
        0,
        &mut counter,
        req.limit_depth,
        &conditions,
        &mut report,
        check,
    )?;
    check()?;
    Ok(ScanResponse {
        result: String::new(),
        // Even an excluded root is an empty directory, never a synthetic file.
        node: node.unwrap_or(Node {
            name: name_for(root)?,
            children: Some(Vec::new()),
        }),
    })
}

fn search_file_rec(
    dir: &Path,
    depth: u32,
    counter: &mut u32,
    limit_depth: Option<u32>,
    conditions: &Conditions,
    report: &mut impl FnMut(&Progress),
    check: &dyn Fn() -> Result<(), String>,
) -> Result<Option<Node>, String> {
    check()?;
    *counter = counter
        .checked_add(1)
        .ok_or("Scan directory counter overflow")?;
    let name = name_for(dir)?;
    let applicable = || {
        conditions
            .dirs
            .iter()
            .filter(|c| c.depth.is_none_or(|d| d == depth))
    };
    let included = applicable()
        .filter(|c| !c.is_exclude)
        .all(|c| c.pattern.is_match(&name));
    let excluded = applicable()
        .filter(|c| c.is_exclude)
        .any(|c| c.pattern.is_match(&name));
    if !included || excluded {
        return Ok(None);
    }
    report(&Progress {
        path: dir.to_string_lossy().into_owned(),
        name: name.clone(),
        depth,
        counter: *counter,
    });
    check()?;
    let entries =
        fs::read_dir(dir).map_err(|e| format!("Unable to read {}: {e}", dir.display()))?;
    let mut children = Vec::new();
    for entry in entries {
        check()?;
        let entry = entry.map_err(|e| format!("Unable to enumerate {}: {e}", dir.display()))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|e| format!("Unable to inspect {}: {e}", path.display()))?;
        let file_type = metadata.file_type();
        // Preserve file links, but never descend through directory links.
        if file_type.is_symlink()
            && fs::metadata(&path)
                .map_err(|e| format!("Unable to inspect link {}: {e}", path.display()))?
                .is_dir()
        {
            continue;
        }
        if file_type.is_dir() {
            // Only skip descent; files in the directory at the limit remain visible.
            if limit_depth.is_some_and(|limit| depth >= limit) {
                continue;
            }
            let next_depth = depth.checked_add(1).ok_or("Scan depth overflow")?;
            if let Some(child) = search_file_rec(
                &path,
                next_depth,
                counter,
                limit_depth,
                conditions,
                report,
                check,
            )? {
                children.push(child);
            }
        } else {
            let file_depth = depth.checked_add(1).ok_or("Scan depth overflow")?;
            if conditions
                .dirs
                .iter()
                .any(|c| !c.is_exclude && c.depth.is_none_or(|d| d == file_depth))
            {
                continue;
            }
            let name = name_for(&path)?;
            let included = !conditions.files.iter().any(|c| !c.is_exclude)
                || conditions
                    .files
                    .iter()
                    .filter(|c| !c.is_exclude)
                    .any(|c| c.pattern.is_match(&name));
            let excluded = conditions
                .files
                .iter()
                .filter(|c| c.is_exclude)
                .any(|c| c.pattern.is_match(&name));
            if included && !excluded {
                children.push(Node {
                    name,
                    children: None,
                });
            }
        }
    }
    check()?;
    Ok(Some(Node {
        name,
        children: Some(children),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::path::PathBuf;

    struct Fixture {
        root: PathBuf,
        files: Vec<PathBuf>,
        dirs: Vec<PathBuf>,
    }

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("trace-kernel-scan-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&root).unwrap();
            Self {
                root,
                files: Vec::new(),
                dirs: Vec::new(),
            }
        }
        fn dir(&mut self, relative: &str) {
            let path = self.root.join(relative);
            fs::create_dir(&path).unwrap();
            self.dirs.push(path);
        }
        fn file(&mut self, relative: &str) {
            let path = self.root.join(relative);
            fs::write(&path, b"content").unwrap();
            self.files.push(path);
        }
        fn req(&self, limit_depth: Option<u32>) -> ScanRequest {
            ScanRequest {
                root_path: self.root.to_str().unwrap().into(),
                limit_depth,
                dir_conds: vec![],
                file_conds: vec![],
            }
        }
        fn scan(&self, depth: Option<u32>) -> ScanResponse {
            scan_directory(self.req(depth), |_| {}, &|| Ok(())).unwrap()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            for file in self.files.iter().rev() {
                let _ = fs::remove_file(file);
            }
            for dir in self.dirs.iter().rev() {
                let _ = fs::remove_dir(dir);
            }
            let _ = fs::remove_dir(&self.root);
        }
    }

    fn targets(response: &ScanResponse) -> Vec<String> {
        fn collect(node: &Node, prefix: &str, out: &mut Vec<String>) {
            for child in node.children.as_ref().unwrap() {
                let path = format!("{prefix}{}", child.name);
                if child.children.is_some() {
                    collect(child, &(path + "/"), out);
                } else {
                    out.push(path);
                }
            }
        }
        let mut out = vec![];
        collect(&response.node, "", &mut out);
        out.sort();
        out
    }

    fn base(pattern: &str, is_exclude: bool) -> BaseCond {
        BaseCond {
            pattern: pattern.into(),
            is_exclude,
        }
    }

    #[test]
    fn depth_zero_keeps_root_files_even_with_child_directories() {
        let mut f = Fixture::new();
        f.dir("first");
        f.dir("second");
        f.file("root.txt");
        f.file("first/nested.txt");
        let res = f.scan(Some(0));
        assert_eq!(targets(&res), ["root.txt"]);
        assert_eq!(res.node.children.unwrap().len(), 1);
    }

    #[test]
    fn depth_one_preserves_each_limit_directory_and_its_files() {
        let mut f = Fixture::new();
        f.dir("first");
        f.dir("first/deeper");
        f.dir("second");
        f.file("root.txt");
        f.file("first/one.txt");
        f.file("first/deeper/no.txt");
        f.file("second/two.txt");
        assert_eq!(
            targets(&f.scan(Some(1))),
            ["first/one.txt", "root.txt", "second/two.txt"]
        );
        assert_eq!(
            targets(&f.scan(None)),
            [
                "first/deeper/no.txt",
                "first/one.txt",
                "root.txt",
                "second/two.txt"
            ]
        );
    }

    #[test]
    fn excluded_root_remains_an_empty_directory_with_its_actual_name() {
        let mut f = Fixture::new();
        f.file("root.txt");
        let mut req = f.req(None);
        req.dir_conds.push(DirCond {
            base: base("*", true),
            depth: Some(0),
        });
        let res = scan_directory(
            req,
            |_| panic!("excluded root must not report progress"),
            &|| Ok(()),
        )
        .unwrap();
        assert_eq!(res.node.name, f.root.file_name().unwrap().to_str().unwrap());
        assert!(res.node.children.unwrap().is_empty());
    }

    #[test]
    fn file_includes_are_or_and_excludes_take_precedence() {
        let mut f = Fixture::new();
        for name in ["one.txt", "two.csv", "skip.txt", "other.log"] {
            f.file(name);
        }
        let mut req = f.req(None);
        req.file_conds = vec![
            FileCond {
                base: base("*.txt", false),
            },
            FileCond {
                base: base("*.csv", false),
            },
            FileCond {
                base: base("skip.*", true),
            },
        ];
        assert_eq!(
            targets(&scan_directory(req, |_| {}, &|| Ok(())).unwrap()),
            ["one.txt", "two.csv"]
        );
    }

    #[test]
    fn directory_includes_keep_existing_and_and_next_depth_file_rules() {
        let mut f = Fixture::new();
        f.dir("apple");
        f.dir("avocado");
        f.dir("banana");
        f.file("root.txt");
        f.file("apple/a.txt");
        f.file("avocado/b.txt");
        f.file("banana/c.txt");
        let mut req = f.req(None);
        req.dir_conds = vec![
            DirCond {
                base: base("a*", false),
                depth: Some(1),
            },
            DirCond {
                base: base("*e", false),
                depth: Some(1),
            },
        ];
        assert_eq!(
            targets(&scan_directory(req, |_| {}, &|| Ok(())).unwrap()),
            ["apple/a.txt"]
        );
    }

    #[test]
    fn wildcard_metacharacters_are_literal_except_star_and_matching_is_anchored() {
        let cond = CompiledCond::new(&base("[a]+?.*", false), None).unwrap();
        assert!(cond.pattern.is_match("[a]+?.txt"));
        assert!(!cond.pattern.is_match("a.txt"));
        assert!(!cond.pattern.is_match("prefix[a]+?.txt"));
        assert!(!CompiledCond::new(&base("name", false), None)
            .unwrap()
            .pattern
            .is_match("names"));
    }

    #[test]
    fn root_name_handles_filesystem_roots_and_trailing_separators() {
        let root = if cfg!(windows) {
            Path::new("C:\\")
        } else {
            Path::new("/")
        };
        assert!(!name_for(root).unwrap().is_empty());
        let f = Fixture::new();
        let mut req = f.req(Some(0));
        req.root_path.push(std::path::MAIN_SEPARATOR);
        let res = scan_directory(req, |_| {}, &|| Ok(())).unwrap();
        assert_eq!(res.node.name, f.root.file_name().unwrap().to_str().unwrap());
        assert!(res.node.children.unwrap().is_empty());
    }

    #[test]
    fn missing_non_directory_and_invalid_roots_return_errors_not_partial_results() {
        let mut f = Fixture::new();
        f.file("root.txt");
        for path in [
            f.root.join("missing").to_str().unwrap().to_owned(),
            f.root.join("root.txt").to_str().unwrap().to_owned(),
            "bad\0path".into(),
        ] {
            let mut req = f.req(None);
            req.root_path = path;
            assert!(scan_directory(req, |_| {}, &|| Ok(())).is_err());
        }
    }

    #[test]
    fn cancellation_before_scan_and_after_progress_never_returns_partial_success() {
        let mut f = Fixture::new();
        f.dir("child");
        f.file("child/a.txt");
        let stopped = Cell::new(true);
        let check = || {
            if stopped.get() {
                Err("Scan cancelled".into())
            } else {
                Ok(())
            }
        };
        assert!(scan_directory(f.req(None), |_| panic!("already stopped"), &check).is_err());
        stopped.set(false);
        let mut reports = 0;
        let res = scan_directory(
            f.req(None),
            |_| {
                reports += 1;
                stopped.set(true);
            },
            &check,
        );
        assert_eq!(res.unwrap_err(), "Scan cancelled");
        assert_eq!(reports, 1);
    }

    #[test]
    fn directory_read_failure_after_progress_is_propagated_without_panicking() {
        let mut f = Fixture::new();
        f.dir("child");
        let res = scan_directory(
            f.req(None),
            |p| {
                if p.depth == 1 {
                    fs::remove_dir(&p.path).unwrap();
                }
            },
            &|| Ok(()),
        );
        assert!(res.unwrap_err().contains("Unable to read"));
    }

    #[test]
    fn entry_metadata_failure_is_an_error_not_a_cached_file_result() {
        let mut f = Fixture::new();
        f.file("one.txt");
        let reported = Cell::new(false);
        let checks = Cell::new(0);
        let res = scan_directory(f.req(None), |_| reported.set(true), &|| {
            if reported.get() {
                checks.set(checks.get() + 1);
                // The second checkpoint follows an entry yielded by read_dir.
                if checks.get() == 2 {
                    fs::remove_file(f.root.join("one.txt")).unwrap();
                }
            }
            Ok(())
        });
        assert!(res.unwrap_err().contains("Unable to inspect"));
    }

    #[test]
    fn enumeration_checkpoint_stops_before_accepting_a_file() {
        let mut f = Fixture::new();
        f.file("one.txt");
        let reported = Cell::new(false);
        let checks = Cell::new(0);
        let res = scan_directory(f.req(None), |_| reported.set(true), &|| {
            if reported.get() {
                checks.set(checks.get() + 1);
                if checks.get() == 2 {
                    return Err("Scan cancelled during enumeration".into());
                }
            }
            Ok(())
        });
        assert_eq!(res.unwrap_err(), "Scan cancelled during enumeration");
    }

    #[test]
    fn progress_counts_directories_in_order_without_requiring_ui() {
        let mut f = Fixture::new();
        f.dir("child");
        f.file("child/a.txt");
        let mut events = vec![];
        scan_directory(
            f.req(None),
            |p| events.push((p.name.clone(), p.depth, p.counter)),
            &|| Ok(()),
        )
        .unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!((events[0].1, events[0].2), (0, 1));
        assert_eq!(events[1], ("child".into(), 1, 2));
    }

    #[cfg(unix)]
    #[test]
    fn directory_links_are_skipped_file_links_preserved_and_broken_links_rejected() {
        let mut f = Fixture::new();
        f.dir("real");
        f.file("real/a.txt");
        std::os::unix::fs::symlink(&f.root, f.root.join("loop")).unwrap();
        f.files.push(f.root.join("loop"));
        std::os::unix::fs::symlink(f.root.join("real/a.txt"), f.root.join("linked.txt")).unwrap();
        f.files.push(f.root.join("linked.txt"));
        assert_eq!(targets(&f.scan(None)), ["linked.txt", "real/a.txt"]);
        std::os::unix::fs::symlink(f.root.join("missing"), f.root.join("broken")).unwrap();
        f.files.push(f.root.join("broken"));
        assert!(scan_directory(f.req(None), |_| {}, &|| Ok(()))
            .unwrap_err()
            .contains("Unable to inspect link"));
    }
}
