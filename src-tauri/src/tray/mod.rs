use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
pub fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open 2FAS Desktop", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Lock vault", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &lock, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("2FAS Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show(app),
            "lock" => {
                let locked = if let Ok(mut s) = app.state::<crate::commands::Vault>().lock() {
                    if s.password_hash().ok().flatten().is_some() {
                        s.locked = true;
                        true
                    } else {
                        false
                    }
                } else { false };
                if !locked {
                    show(app);
                    std::thread::spawn(|| {
                        rfd::MessageDialog::new().set_title("Enable vault locking")
                            .set_description("Set an app password under Settings > Security to enable vault locking.")
                            .set_buttons(rfd::MessageButtons::Ok).show();
                    });
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
pub fn startup(enabled: bool) -> Result<(), String> {
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_WRITE},
        RegKey,
    };
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        )
        .map_err(|_| "Could not access Windows startup settings")?;
    if enabled {
        let exe = std::env::current_exe().map_err(|_| "Could not locate application")?;
        key.set_value("TwoFasDesktop", &format!("\"{}\"", exe.display()))
            .map_err(|_| "Could not enable startup")?;
    } else {
        match key.delete_value("TwoFasDesktop") {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Could not disable startup".into()),
        }
    }
    Ok(())
}
