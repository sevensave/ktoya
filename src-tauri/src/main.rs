#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod migrate;

use std::collections::BTreeMap;
use tauri::{Manager, UserAttentionType, WebviewWindow, WebviewWindowBuilder};

#[tauri::command]
async fn electron_saves(app: tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let storage = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("ktoya")
        .join("Local Storage")
        .join("leveldb");
    tauri::async_runtime::spawn_blocking(move || migrate::read(&storage))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn flash(window: WebviewWindow, on: bool) -> tauri::Result<()> {
    let attention = if on && !window.is_focused()? {
        Some(UserAttentionType::Informational)
    } else {
        None
    };
    window.request_user_attention(attention)
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> tauri::Result<()> {
    window.set_fullscreen(!window.is_fullscreen()?)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let dev_url = app.config().build.dev_url.clone().filter(|_| tauri::is_dev());
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .enable_clipboard_access()
                .on_navigation(move |url| {
                    if let Some(base) = &dev_url {
                        return url.origin() == base.origin();
                    }
                    matches!(
                        (url.scheme(), url.host_str(), url.port()),
                        ("tauri", Some("localhost"), None) | ("http", Some("tauri.localhost"), None)
                    )
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![electron_saves, flash, toggle_fullscreen])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить «Кто я?»");
}
