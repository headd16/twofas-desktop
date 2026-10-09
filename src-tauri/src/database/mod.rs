use crate::{
    otp::{self, AccountInput},
    security,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    time::{Duration, Instant},
};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Account {
    pub id: String,
    pub issuer: String,
    pub name: String,
    pub kind: String,
    pub algorithm: String,
    pub digits: u32,
    pub period: u64,
    pub counter: u64,
    pub favorite: bool,
    pub position: i64,
    pub icon: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub privacy_mode: bool,
    pub clipboard_seconds: u64,
    pub lock_seconds: u64,
    pub always_on_top: bool,
    pub startup: bool,
    pub tray: bool,
    pub sort: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            privacy_mode: false,
            clipboard_seconds: 30,
            lock_seconds: 300,
            always_on_top: false,
            startup: false,
            tray: true,
            sort: "manual".into(),
        }
    }
}
pub struct Store {
    pub shortcut_available: bool,
    pub db: Connection,
    pub locked: bool,
    pub last_activity: Instant,
    pub failed_attempts: u32,
    pub retry_at: Option<Instant>,
    pub clipboard_generation: u64,
}
fn db_error(_: rusqlite::Error) -> String {
    "Local database operation failed".into()
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let db = Connection::open(path).map_err(db_error)?;
        db.execute_batch(include_str!("../../migrations/001.sql"))
            .map_err(db_error)?;
        let mut s = Self {
            shortcut_available: false,
            db,
            locked: false,
            last_activity: Instant::now(),
            failed_attempts: 0,
            retry_at: None,
            clipboard_generation: 0,
        };
        s.locked = s.password_hash()?.is_some();
        Ok(s)
    }
    pub fn settings(&self) -> Result<Settings, String> {
        let value = self.config("settings")?;
        value
            .map(|s| serde_json::from_str(&s).map_err(|_| "Invalid settings".into()))
            .unwrap_or(Ok(Settings::default()))
    }
    pub fn config(&self, key: &str) -> Result<Option<String>, String> {
        use rusqlite::OptionalExtension;
        self.db
            .query_row("SELECT value FROM config WHERE key=?1", [key], |r| r.get(0))
            .optional()
            .map_err(db_error)
    }
    pub fn set_config(&self, key: &str, value: &str) -> Result<(), String> {
        self.db.execute("INSERT INTO config(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value]).map_err(db_error)?;
        Ok(())
    }
    pub fn password_hash(&self) -> Result<Option<String>, String> {
        self.config("password")
    }
    pub fn guard(&mut self) -> Result<(), String> {
        let secs = self.settings()?.lock_seconds;
        if secs > 0
            && self.password_hash()?.is_some()
            && self.last_activity.elapsed() >= Duration::from_secs(secs)
        {
            self.locked = true;
        }
        if self.locked {
            return Err("LOCKED".into());
        }
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<Account>, String> {
        let mut stmt=self.db.prepare("SELECT id,issuer,name,kind,algorithm,digits,period,counter,favorite,position,icon FROM accounts ORDER BY favorite DESC,position,id").map_err(db_error)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Account {
                    id: r.get(0)?,
                    issuer: r.get(1)?,
                    name: r.get(2)?,
                    kind: r.get(3)?,
                    algorithm: r.get(4)?,
                    digits: r.get(5)?,
                    period: r.get(6)?,
                    counter: r.get(7)?,
                    favorite: r.get(8)?,
                    position: r.get(9)?,
                    icon: r.get(10)?,
                })
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
    }
    pub fn secret(&self, id: &str) -> Result<zeroize::Zeroizing<Vec<u8>>, String> {
        let blob: Vec<u8> = self
            .db
            .query_row("SELECT secret FROM accounts WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(|_| "Account not found")?;
        security::unprotect(&blob)
    }
    pub fn save(&self, id: Option<&str>, input: &AccountInput) -> Result<String, String> {
        otp::validate(input)?;
        let id = id
            .map(str::to_owned)
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let encrypted = security::protect(&otp::decode(&input.secret)?)?;
        if self.db.execute("UPDATE accounts SET issuer=?2,name=?3,kind=?4,algorithm=?5,digits=?6,period=?7,counter=?8,secret=?9,icon=?10 WHERE id=?1",params![id,input.issuer.trim(),input.name.trim(),input.kind,input.algorithm,input.digits,input.period,input.counter,encrypted,input.icon]).map_err(db_error)?==0 {
            self.db.execute("INSERT INTO accounts(id,issuer,name,kind,algorithm,digits,period,counter,secret,position,icon) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,(SELECT COALESCE(MAX(position),-1)+1 FROM accounts),?10)",params![id,input.issuer.trim(),input.name.trim(),input.kind,input.algorithm,input.digits,input.period,input.counter,encrypted,input.icon]).map_err(db_error)?;
        }
        Ok(id)
    }
    pub fn edit(&self, id: &str, input: &AccountInput) -> Result<(), String> {
        let existing = self
            .list()?
            .into_iter()
            .find(|a| a.id == id)
            .ok_or("Account not found")?;
        let mut copy = input.clone();
        if copy.secret.is_empty() {
            copy.secret = data_encoding::BASE32_NOPAD.encode(&self.secret(&existing.id)?);
        }
        self.save(Some(id), &copy)?;
        Ok(())
    }
    pub fn delete(&self, id: &str) -> Result<(), String> {
        if self
            .db
            .execute("DELETE FROM accounts WHERE id=?1", [id])
            .map_err(db_error)?
            != 1
        {
            return Err("Account not found".into());
        }
        Ok(())
    }
    pub fn favorite(&self, id: &str, value: bool) -> Result<(), String> {
        if self
            .db
            .execute(
                "UPDATE accounts SET favorite=?2 WHERE id=?1",
                params![id, value],
            )
            .map_err(db_error)?
            != 1
        {
            return Err("Account not found".into());
        }
        Ok(())
    }
    pub fn reorder(&mut self, ids: &[String]) -> Result<(), String> {
        let existing = self.list()?;
        let set: std::collections::HashSet<_> = ids.iter().collect();
        if set.len() != ids.len()
            || ids.len() != existing.len()
            || existing.iter().any(|a| !set.contains(&a.id))
        {
            return Err("Order must contain every account exactly once".into());
        }
        let tx = self.db.transaction().map_err(db_error)?;
        for (i, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE accounts SET position=?2 WHERE id=?1",
                params![id, i as i64],
            )
            .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
    pub fn advance(&self, id: &str) -> Result<(), String> {
        if self.db.execute("UPDATE accounts SET counter=counter+1 WHERE id=?1 AND kind='hotp' AND counter<9007199254740991",[id]).map_err(db_error)?!=1 {return Err("Cannot advance this counter".into());}
        Ok(())
    }
    pub fn backup_accounts(&self) -> Result<Vec<AccountInput>, String> {
        let mut rows = self.list()?;
        rows.sort_by_key(|a| a.position);
        rows.iter()
            .map(|a| {
                Ok(AccountInput {
                    issuer: a.issuer.clone(),
                    name: a.name.clone(),
                    kind: a.kind.clone(),
                    algorithm: a.algorithm.clone(),
                    digits: a.digits,
                    period: a.period,
                    counter: a.counter,
                    secret: data_encoding::BASE32_NOPAD.encode(&self.secret(&a.id)?),
                    icon: a.icon.clone(),
                    favorite: a.favorite,
                })
            })
            .collect()
    }
    pub fn restore(&mut self, inputs: &[AccountInput]) -> Result<usize, String> {
        if inputs.len() > 10000 {
            return Err("Backup contains too many accounts".into());
        }
        let prepared = inputs
            .iter()
            .map(|a| {
                otp::validate(a)?;
                let blob = security::protect(&otp::decode(&a.secret)?)?;
                Ok((a, blob))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let tx = self.db.transaction().map_err(db_error)?;
        for (a, blob) in prepared {
            tx.execute("INSERT INTO accounts(id,issuer,name,kind,algorithm,digits,period,counter,secret,position,icon,favorite) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,(SELECT COALESCE(MAX(position),-1)+1 FROM accounts),?10,?11)",params![uuid::Uuid::new_v4().to_string(),a.issuer,a.name,a.kind,a.algorithm,a.digits,a.period,a.counter,blob,a.icon,a.favorite]).map_err(db_error)?;
        }
        tx.commit().map_err(db_error)?;
        Ok(inputs.len())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_migrate_and_privacy_preference_persists() {
        let settings: Settings = serde_json::from_str(r#"{"sort":"manual","tray":true}"#).unwrap();
        assert!(!settings.privacy_mode);
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let store = Store::open(&path).unwrap();
        store.set_config("settings", &serde_json::to_string(&Settings { privacy_mode: true, ..settings }).unwrap()).unwrap();
        drop(store);
        assert!(Store::open(&path).unwrap().settings().unwrap().privacy_mode);
    }
    fn input() -> AccountInput {
        otp::parse_uri("otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example")
            .unwrap()
    }
    #[test]
    fn crud_persistence_order_encryption() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let mut s = Store::open(&path).unwrap();
        let a = s.save(None, &input()).unwrap();
        let b = s.save(None, &input()).unwrap();
        s.reorder(&[b.clone(), a.clone()]).unwrap();
        assert_eq!(s.list().unwrap()[0].id, b);
        assert!(s.reorder(&[a.clone(), a.clone()]).is_err());
        s.favorite(&a, true).unwrap();
        assert_eq!(s.list().unwrap()[0].id, a);
        let raw: Vec<u8> =
            s.db.query_row("SELECT secret FROM accounts WHERE id=?1", [&a], |r| {
                r.get(0)
            })
            .unwrap();
        assert_ne!(raw, otp::decode(&input().secret).unwrap().to_vec());
        let mut edit = input();
        edit.name = "updated".into();
        edit.secret.clear();
        s.edit(&a, &edit).unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        assert_eq!(s.list().unwrap()[0].name, "updated");
        s.delete(&a).unwrap();
        assert_eq!(s.list().unwrap().len(), 1);
    }
    #[test]
    fn backup_restore_atomic() {
        let mut s = Store::open(Path::new(":memory:")).unwrap();
        s.save(None, &input()).unwrap();
        let payload =
            zeroize::Zeroizing::new(serde_json::to_vec(&s.backup_accounts().unwrap()).unwrap());
        let blob = crate::crypto::encrypt(&payload, "strong backup password").unwrap();
        let decoded = crate::crypto::decrypt(&blob, "strong backup password").unwrap();
        let rows: Vec<AccountInput> = serde_json::from_slice(&decoded).unwrap();
        assert_eq!(s.restore(&rows).unwrap(), 1);
        let mut bad = input();
        bad.period = 0;
        assert!(s.restore(&[input(), bad]).is_err());
        assert_eq!(s.list().unwrap().len(), 2);
    }
    #[test]
    fn lock_enforced() {
        let mut s = Store::open(Path::new(":memory:")).unwrap();
        s.set_config(
            "password",
            &security::password_hash("long enough password").unwrap(),
        )
        .unwrap();
        s.last_activity = Instant::now() - Duration::from_secs(301);
        assert_eq!(s.guard().unwrap_err(), "LOCKED");
    }
    #[test]
    fn hotp_counter_is_explicit_and_totp_cannot_advance() {
        let s = Store::open(Path::new(":memory:")).unwrap();
        let mut hotp = input();
        hotp.kind = "hotp".into();
        hotp.counter = 9;
        let id = s.save(None, &hotp).unwrap();
        assert_eq!(s.list().unwrap()[0].counter, 9);
        s.advance(&id).unwrap();
        assert_eq!(s.list().unwrap()[0].counter, 10);
        let totp = s.save(None, &input()).unwrap();
        assert!(s.advance(&totp).is_err());
    }
    #[test]
    fn restore_preserves_favorites_and_manual_order() {
        let mut s = Store::open(Path::new(":memory:")).unwrap();
        let mut first = input();
        first.name = "first".into();
        let mut second = input();
        second.name = "second".into();
        second.favorite = true;
        s.restore(&[first, second]).unwrap();
        let rows = s.backup_accounts().unwrap();
        assert_eq!(rows[0].name, "first");
        assert_eq!(rows[1].name, "second");
        assert!(rows[1].favorite);
        assert_eq!(s.list().unwrap()[0].name, "second");
    }
}
