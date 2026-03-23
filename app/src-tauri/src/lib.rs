mod file_system;
mod parser;
mod process;
mod runtime;
mod scan;
mod stream;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{DragDropEvent, Emitter};
use tauri::{WindowEvent};

use file_system::exists_path;
use file_system::glob_path;
use file_system::read_binary;
use file_system::read_dir;
use file_system::read_file;
use file_system::save_text;
use file_system::save_binary;
use file_system::copy_file;
use file_system::stat;
use file_system::delete_path;
use file_system::make_dir;
use file_system::rename;
use scan::scan_directory;

use process::run_process;

mod scraper;
use crate::parser::dom::dom_dispose;
use crate::parser::dom::dom_info;
use crate::parser::dom::dom_parse;
use crate::parser::excel::excel_parse;
use crate::runtime::worker_dispose;
use crate::runtime::worker_init;
use crate::runtime::AppState;
use scraper::api::load_html_from_url;
use stream::channel::add_channel;
use stream::channel::append_lines;
use stream::channel::get_line_len;
use stream::channel::get_range_lines;

#[tauri::command]
fn get_cli_args() -> Vec<String> {
    std::env::args().collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            workers: Mutex::new(HashMap::new()),
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(drag_event) = event {
                match *drag_event {
                    DragDropEvent::Drop { ref paths, .. } => {
                        println!("Rust got drop: {:?}", paths);
                        let _ = window.emit("file-drop", paths.clone());
                    }
                    DragDropEvent::Over { .. } => {}
                    DragDropEvent::Leave => {}
                    DragDropEvent::Enter { .. } => {}
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            exists_path,
            glob_path,
            read_binary,
            read_file,
            read_dir,
            copy_file,
            make_dir,
            delete_path,
            stat,
            rename,
            get_cli_args,
            save_text,
            save_binary,
            load_html_from_url,
            worker_init,
            worker_dispose,
            add_channel,
            append_lines,
            get_range_lines,
            get_line_len,
            dom_parse,
            dom_info,
            dom_dispose,
            excel_parse,
            run_process,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
