use crate::{
    crypto,
    database::{Account, Settings, Store},
    otp::{self, AccountInput},
    security,
};
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use zeroize::Zeroizing;
pub type Vault = Mutex<Store>;
fn access<'a>(state: &'a State<'_, Vault>) -> Result<std::sync::MutexGuard<'a, Store>, String> {
    state.lock().map_err(|_| "Vault unavailable".into())
}
#[derive(Serialize)]
pub struct Status {
    shortcut_available: bool,
    locked: bool,
    password_set: bool,
    settings: Settings,
}
#[derive(Serialize)]
pub struct TokenCode {
    id: String,
    code: String,
    remaining: u64,
    period: u64,
}
#[tauri::command]
pub fn status(state: State<Vault>) -> Result<Status, String> {
    let mut s = access(&state)?;
    let _ = s.guard();
    Ok(Status {
        shortcut_available: s.shortcut_available,
        locked: s.locked,
        password_set: s.password_hash()?.is_some(),
        settings: s.settings()?,
    })
}
#[tauri::command]
pub fn activity(state: State<Vault>) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.last_activity = Instant::now();
    Ok(())
}
#[tauri::command]
pub fn accounts(state: State<Vault>) -> Result<Vec<Account>, String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.list()
}
#[tauri::command]
pub fn codes(state: State<Vault>, reveal_ids: Option<Vec<String>>) -> Result<Vec<TokenCode>, String> {
    let mut s = access(&state)?;
    s.guard()?;
    let reveal_ids = reveal_ids.unwrap_or_default();
    if reveal_ids.len() > 1 || reveal_ids.iter().any(|id| id.len() > 64) {
        return Err("Reveal one account at a time".into());
    }
    collect_codes(&s, &reveal_ids)
}
fn collect_codes(s: &Store, reveal_ids: &[String]) -> Result<Vec<TokenCode>, String> {
    let privacy_mode = s.settings()?.privacy_mode;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid system clock")?
        .as_secs();
    s.list()?
        .iter()
        .map(|a| {
            let code = if privacy_mode && !reveal_ids.contains(&a.id) {
                String::new()
            } else {
                let secret = s.secret(&a.id)?;
                if a.kind == "hotp" {
                    otp::hotp(&secret, a.counter, &a.algorithm, a.digits)?
                } else {
                    otp::totp(&secret, now, a.period, &a.algorithm, a.digits)?
                }
            };
            Ok(TokenCode {
                id: a.id.clone(),
                code,
                remaining: if a.kind == "hotp" {
                    0
                } else {
                    a.period - now % a.period
                },
                period: a.period,
            })
        })
        .collect()
}
#[tauri::command]
pub fn save_account(
    state: State<Vault>,
    id: Option<String>,
    input: AccountInput,
) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    if let Some(id) = id {
        s.edit(&id, &input)
    } else {
        s.save(None, &input).map(|_| ())
    }
}
#[tauri::command]
pub fn import_uri(state: State<Vault>, uri: String) -> Result<(), String> {
    let uri = Zeroizing::new(uri);
    let input = otp::parse_uri(&uri)?;
    let mut s = access(&state)?;
    s.guard()?;
    s.save(None, &input).map(|_| ())
}
#[tauri::command]
pub fn delete_account(state: State<Vault>, id: String) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.delete(&id)
}
#[tauri::command]
pub fn favorite(state: State<Vault>, id: String, value: bool) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.favorite(&id, value)
}
#[tauri::command]
pub fn reorder(state: State<Vault>, ids: Vec<String>) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.reorder(&ids)
}
#[tauri::command]
pub fn advance(state: State<Vault>, id: String) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    s.advance(&id)
}
#[tauri::command]
pub fn lock(state: State<Vault>) -> Result<(), String> {
    let mut s = access(&state)?;
    if s.password_hash()?.is_none() {
        return Err("Set an app password in Settings first".into());
    }
    s.locked = true;
    Ok(())
}
#[tauri::command]
pub fn unlock(state: State<Vault>, password: String) -> Result<(), String> {
    let password = Zeroizing::new(password);
    let mut s = access(&state)?;
    if s.retry_at.is_some_and(|t| Instant::now() < t) {
        return Err("Too many attempts. Please wait before trying again".into());
    }
    let hash = s.password_hash()?.ok_or("No app password configured")?;
    if !security::verify(&password, &hash) {
        s.failed_attempts += 1;
        if s.failed_attempts >= 5 {
            s.retry_at = Some(Instant::now() + Duration::from_secs(30));
        }
        return Err("Incorrect password".into());
    }
    s.locked = false;
    s.failed_attempts = 0;
    s.retry_at = None;
    s.last_activity = Instant::now();
    Ok(())
}
#[tauri::command]
pub fn set_password(state: State<Vault>, current: String, password: String) -> Result<(), String> {
    let current = Zeroizing::new(current);
    let password = Zeroizing::new(password);
    let mut s = access(&state)?;
    s.guard()?;
    if s.password_hash()?
        .is_some_and(|h| !security::verify(&current, &h))
    {
        return Err("Current password is incorrect".into());
    }
    if password.is_empty() {
        s.db.execute("DELETE FROM config WHERE key='password'", [])
            .map_err(|_| "Could not remove password")?;
    } else {
        s.set_config("password", &security::password_hash(&password)?)?;
    }
    Ok(())
}
#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    state: State<Vault>,
    settings: Settings,
) -> Result<(), String> {
    if settings.clipboard_seconds > 300
        || settings.lock_seconds > 86400
        || !["manual", "name", "issuer"].contains(&settings.sort.as_str())
    {
        return Err("Invalid settings".into());
    }
    let mut s = access(&state)?;
    s.guard()?;
    let previous = s.settings()?;
    if previous.startup != settings.startup {
        crate::tray::startup(settings.startup)?;
    }
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(settings.always_on_top)
            .map_err(|_| "Could not change window behavior")?;
    }
    s.set_config(
        "settings",
        &serde_json::to_string(&settings).map_err(|_| "Invalid settings")?,
    )
}
#[tauri::command]
pub fn copy_code(app: tauri::AppHandle, state: State<Vault>, id: String) -> Result<(), String> {
    let mut s = access(&state)?;
    s.guard()?;
    let a = s
        .list()?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("Account not found")?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid clock")?
        .as_secs();
    let key = s.secret(&id)?;
    let code = otp::hotp(
        &key,
        if a.kind == "hotp" {
            a.counter
        } else {
            now / a.period
        },
        &a.algorithm,
        a.digits,
    )?;
    arboard::Clipboard::new()
        .and_then(|mut c| c.set_text(code.clone()))
        .map_err(|_| "Clipboard is unavailable")?;
    s.clipboard_generation += 1;
    let generation = s.clipboard_generation;
    let seconds = s.settings()?.clipboard_seconds;
    drop(s);
    if seconds > 0 {
        std::thread::spawn(move || {
            let code = Zeroizing::new(code);
            std::thread::sleep(Duration::from_secs(seconds));
            let state = app.state::<Vault>();
            if let Ok(s) = state.lock() {
                if s.clipboard_generation == generation {
                    if let Ok(mut cb) = arboard::Clipboard::new() {
                        if cb.get_text().is_ok_and(|text| text == *code) {
                            let _ = cb.clear();
                        }
                    }
                }
            };
        });
    }
    Ok(())
}
#[tauri::command]
pub async fn export_backup(app: tauri::AppHandle, password: String) -> Result<bool, String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        if !rfd::MessageDialog::new().set_title("Export authenticator secrets?").set_description("This encrypted backup contains every authenticator secret. Anyone with the file and its password can generate your codes. Store it safely.").set_buttons(rfd::MessageButtons::OkCancel).show().eq(&rfd::MessageDialogResult::Ok){return Ok(false);}
        let state=app.state::<Vault>();let mut s=state.lock().map_err(|_|"Vault unavailable")?;s.guard()?;
        let payload=Zeroizing::new(serde_json::to_vec(&s.backup_accounts()?).map_err(|_|"Could not serialize backup")?);drop(s);
        let encrypted=crypto::encrypt(&payload,&password)?;
        let Some(path)=rfd::FileDialog::new().add_filter("Encrypted authenticator backup",&["2fw"]).set_file_name("authenticator-backup.2fw").save_file()else{return Ok(false)};
        std::fs::write(path,encrypted).map_err(|_|"Could not write backup")?;Ok(true)
    }).await.map_err(|_|"Export operation failed")?
}
#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, password: String) -> Result<usize, String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path)=rfd::FileDialog::new().add_filter("Encrypted authenticator backup",&["2fw"]).pick_file()else{return Ok(0)};
        let size=std::fs::metadata(&path).map_err(|_|"Could not read backup")?.len();if size>16*1024*1024{return Err("Backup is too large".into());}
        let bytes=std::fs::read(path).map_err(|_|"Could not read backup")?;let plain=crypto::decrypt(&bytes,&password)?;
        let rows:Vec<AccountInput>=serde_json::from_slice(&plain).map_err(|_|"Invalid backup contents")?;
        if !rfd::MessageDialog::new().set_title("Restore accounts?").set_description(format!("Add {} accounts to this vault? Existing accounts will be preserved. Restoring the same backup again creates duplicates.",rows.len())).set_buttons(rfd::MessageButtons::OkCancel).show().eq(&rfd::MessageDialogResult::Ok){return Ok(0);}
        let state=app.state::<Vault>();let mut s=state.lock().map_err(|_|"Vault unavailable")?;s.guard()?;s.restore(&rows)
    }).await.map_err(|_|"Restore operation failed")?
}
#[tauri::command]
pub async fn import_phone_backup(app: tauri::AppHandle, password: String) -> Result<usize, String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Vault>();
        state.lock().map_err(|_| "Vault unavailable")?.guard()?;
        let Some(path) = rfd::FileDialog::new()
            .add_filter("2FAS phone export", &["2fas", "json"]).pick_file() else { return Ok(0) };
        // Bound the read itself, including files that grow after selection.
        use std::io::Read;
        let file = std::fs::File::open(path).map_err(|_| "Could not read phone backup")?;
        let mut bytes = Zeroizing::new(Vec::new());
        file.take((crate::phone_import::MAX_BYTES + 1) as u64).read_to_end(&mut bytes)
            .map_err(|_| "Could not read phone backup")?;
        let rows = crate::phone_import::parse(&bytes, &password)?;
        if rows.is_empty() { return Err("Phone backup contains no accounts".into()); }
        if !rfd::MessageDialog::new().set_title("Import phone accounts?")
            .set_description(format!("Add {} accounts from this 2FAS phone export? Existing accounts will be preserved. Importing the same file again creates duplicates. Phone groups, custom icons and badges are not transferred.", rows.len()))
            .set_buttons(rfd::MessageButtons::OkCancel).show().eq(&rfd::MessageDialogResult::Ok) { return Ok(0); }
        let mut store = state.lock().map_err(|_| "Vault unavailable")?;
        store.guard()?;
        store.restore(&rows)
    }).await.map_err(|_| "Phone import operation failed")?
}
#[tauri::command]
pub async fn migration_uri(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move||{
        if !rfd::MessageDialog::new().set_title("Reveal account secret?").set_description("The migration QR contains the unencrypted secret. Anyone who sees or captures it can generate your codes. Continue only in a private place.").set_buttons(rfd::MessageButtons::OkCancel).show().eq(&rfd::MessageDialogResult::Ok){return Ok(None);}
        let state=app.state::<Vault>();let mut s=state.lock().map_err(|_|"Vault unavailable")?;s.guard()?;if s.settings()?.privacy_mode { return Err("Turn off privacy mode to show migration secrets".into()); }let a=s.list()?.into_iter().find(|a|a.id==id).ok_or("Account not found")?;
        let mut url=url::Url::parse(&format!("otpauth://{}/",a.kind)).map_err(|_|"Invalid account")?;url.set_path(&format!("{}:{}",a.issuer,a.name));
        url.query_pairs_mut().append_pair("secret",&data_encoding::BASE32_NOPAD.encode(&s.secret(&id)?)).append_pair("issuer",&a.issuer).append_pair("algorithm",&a.algorithm).append_pair("digits",&a.digits.to_string()).append_pair("period",&a.period.to_string()).append_pair("counter",&a.counter.to_string());
        Ok(Some(url.to_string()))
    }).await.map_err(|_|"Migration failed")?
}

#[cfg(test)]
mod privacy_tests {
    use super::*;
    #[test]
    fn privacy_masks_codes_and_only_reveals_requested_account() {
        let store = Store::open(std::path::Path::new(":memory:")).unwrap();
        let input = otp::parse_uri("otpauth://hotp/GitHub:fixture?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=0&issuer=GitHub").unwrap();
        let first = store.save(None, &input).unwrap();
        store.save(None, &input).unwrap();
        let settings = Settings { privacy_mode: true, ..Settings::default() };
        store.set_config("settings", &serde_json::to_string(&settings).unwrap()).unwrap();
        assert!(collect_codes(&store, &[]).unwrap().iter().all(|row| row.code.is_empty()));
        let rows = collect_codes(&store, &[first.clone()]).unwrap();
        assert_eq!(rows.iter().find(|row| row.id == first).unwrap().code, "755224");
        assert!(rows.iter().find(|row| row.id != first).unwrap().code.is_empty());
        assert!(collect_codes(&store, &[]).unwrap().iter().all(|row| row.code.is_empty()));
    }
}
