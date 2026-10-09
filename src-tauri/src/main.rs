#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
mod crypto;
mod database;
mod otp;
mod phone_import;
mod security;
mod tray;
use tauri::Manager;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            tray::show(app)
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        tray::show(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store =
                database::Store::open(&dir.join("vault.sqlite3")).map_err(std::io::Error::other)?;
            let settings = store.settings().map_err(std::io::Error::other)?;
            app.manage(std::sync::Mutex::new(store));
            if let Some(w) = app.get_webview_window("main") {
                w.set_always_on_top(settings.always_on_top)?;
            }
            tray::setup(app)?;
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let shortcut_available = app.global_shortcut().register("Ctrl+Shift+Space").is_ok();
            if let Ok(mut s) = app.state::<commands::Vault>().lock() {
                s.shortcut_available = shortcut_available;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Ok(mut s) = window.state::<commands::Vault>().lock() {
                    if s.settings().is_ok_and(|x| x.tray) {
                        api.prevent_close();
                        if s.password_hash().ok().flatten().is_some() {
                            s.locked = true;
                        }
                        let _ = window.hide();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::status,
            commands::activity,
            commands::accounts,
            commands::codes,
            commands::save_account,
            commands::import_uri,
            commands::delete_account,
            commands::favorite,
            commands::reorder,
            commands::advance,
            commands::lock,
            commands::unlock,
            commands::set_password,
            commands::save_settings,
            commands::copy_code,
            commands::export_backup,
            commands::restore_backup,
            commands::import_phone_backup,
            commands::migration_uri
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start authenticator");
}
