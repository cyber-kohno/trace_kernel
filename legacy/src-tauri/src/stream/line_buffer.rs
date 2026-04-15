use tauri::State;

use crate::runtime::AppState;

pub struct LineBuffer {
    pub lines: Vec<String>,
}

impl LineBuffer {
    pub fn new() -> Self {
        Self { lines: Vec::new() }
    }
    pub fn push_lines(&mut self, lines: Vec<String>) {
        if lines.is_empty() {
            return;
        }

        if self.lines.is_empty() {
            self.lines.push(lines[0].clone());
        } else {
            self.lines.last_mut().unwrap().push_str(&lines[0]);
        }

        for line in lines.into_iter().skip(1) {
            self.lines.push(line);
        }
    }
}
