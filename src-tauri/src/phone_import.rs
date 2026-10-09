//! Import-only support for the verified upstream 2FAS schema 4 file format.
use crate::otp::{self, AccountInput};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use sha2::Sha256;
use zeroize::{Zeroize, Zeroizing};

pub const MAX_BYTES: usize = 16 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    schema_version: u32,
    #[serde(default)]
    services: Vec<Service>,
    services_encrypted: Option<String>,
    reference: Option<String>,
}
#[derive(Deserialize)]
struct Service {
    name: String,
    secret: String,
    otp: Otp,
    order: Option<Order>,
}
impl Drop for Service {
    fn drop(&mut self) {
        self.secret.zeroize();
    }
}
#[derive(Deserialize)]
struct Order {
    position: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Otp {
    account: Option<String>,
    label: Option<String>,
    issuer: Option<String>,
    token_type: Option<String>,
    algorithm: Option<String>,
    digits: Option<u32>,
    period: Option<u64>,
    counter: Option<u64>,
}

fn decrypt(value: &str, password: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    let parts: Vec<_> = value.split(':').collect();
    if parts.len() != 3 {
        return Err("Invalid encrypted 2FAS data".into());
    }
    let decode = |s: &str| {
        STANDARD
            .decode(
                s.chars()
                    .filter(|c| !c.is_ascii_whitespace())
                    .collect::<String>(),
            )
            .map_err(|_| "Invalid encrypted 2FAS data".to_string())
    };
    let data = decode(parts[0])?;
    let salt = decode(parts[1])?;
    let iv = decode(parts[2])?;
    if data.len() < 16 || salt.is_empty() || salt.len() > 1024 || iv.len() != 12 {
        return Err("Invalid encrypted 2FAS data".into());
    }
    let mut key = Zeroizing::new([0u8; 32]);
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 10_000, &mut *key);
    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "Invalid backup key")?;
    cipher
        .decrypt(Nonce::from_slice(&iv), data.as_slice())
        .map(Zeroizing::new)
        .map_err(|_| "Incorrect phone backup password or damaged file".into())
}

pub fn parse(bytes: &[u8], password: &str) -> Result<Vec<AccountInput>, String> {
    if bytes.len() > MAX_BYTES || password.len() > 1024 {
        return Err("Phone backup or password is too large".into());
    }
    let mut backup: Backup =
        serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes))
            .map_err(|_| "Invalid 2FAS phone backup file".to_string())?;
    if backup.schema_version != 4 {
        return Err(
            "Unsupported 2FAS schema. Export a new file from the current 2FAS phone app (schema 4)"
                .into(),
        );
    }
    match (&backup.services_encrypted, &backup.reference) {
        (Some(encrypted), Some(reference)) if !encrypted.is_empty() && !reference.is_empty() => {
            if !backup.services.is_empty() {
                return Err("Ambiguous encrypted 2FAS file".into());
            }
            if password.is_empty() {
                return Err("Enter the password used to export this phone backup".into());
            }
            let _reference = decrypt(reference, password)?;
            let plain = decrypt(encrypted, password)?;
            backup.services =
                serde_json::from_slice(&plain).map_err(|_| "Invalid decrypted 2FAS accounts")?;
        }
        (None, None) => {}
        _ => return Err("Incomplete encrypted 2FAS file".into()),
    }
    if backup.services.len() > 10_000 {
        return Err("Phone backup contains too many accounts".into());
    }
    backup
        .services
        .sort_by_key(|s| s.order.as_ref().map_or(0, |o| o.position));
    backup.services.iter().enumerate().map(|(index, service)| {
        let o = &service.otp;
        let kind = o.token_type.as_deref().unwrap_or("TOTP").to_ascii_lowercase();
        let algorithm = o.algorithm.as_deref().unwrap_or("SHA1").to_ascii_uppercase();
        let account = o.account.as_deref().or(o.label.as_deref()).filter(|s| !s.trim().is_empty());
        let input = AccountInput {
            issuer: o.issuer.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or(&service.name).into(),
            name: account.unwrap_or(&service.name).into(),
            kind, algorithm, digits: o.digits.unwrap_or(6), period: o.period.unwrap_or(30),
            counter: o.counter.unwrap_or(0), secret: service.secret.clone(), icon: "auto".into(), favorite: false,
        };
        otp::validate(&input).map_err(|_| format!("Account {} has invalid or unsupported OTP settings. Supported: TOTP/HOTP, SHA1/SHA256/SHA512, 6/8 digits. No accounts imported", index + 1))?;
        Ok(input)
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    const PLAIN: &[u8] = include_bytes!("../tests/fixtures/phone-plain.2fas");
    const ENCRYPTED: &[u8] = include_bytes!("../tests/fixtures/phone-encrypted.2fas");
    #[test]
    fn plain_mapping_order_and_rfc_code() {
        let rows = parse(PLAIN, "").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].issuer, "RFC HOTP");
        assert_eq!(rows[0].name, "public-fixture");
        assert_eq!(rows[0].counter, 1);
        assert_eq!(
            otp::hotp(
                &otp::decode(&rows[0].secret).unwrap(),
                rows[0].counter,
                &rows[0].algorithm,
                rows[0].digits
            )
            .unwrap(),
            "287082"
        );
        assert_eq!(rows[1].digits, 8);
        assert_eq!(rows[1].period, 60);
    }
    #[test]
    fn independent_node_encryption_fixture() {
        let rows = parse(ENCRYPTED, "phone-fixture-🔐").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].counter, 1);
        assert!(parse(ENCRYPTED, "wrong").is_err());
        assert!(parse(ENCRYPTED, "").is_err());
        let mut damaged = ENCRYPTED.to_vec();
        let index = damaged.iter().position(|b| *b == b':').unwrap() - 4;
        damaged[index] = if damaged[index] == b'A' { b'B' } else { b'A' };
        assert!(parse(&damaged, "phone-fixture-🔐").is_err());
    }
    #[test]
    fn invalid_unsupported_and_ambiguous_files() {
        for (from, to) in [
            ("\"schemaVersion\":4", "\"schemaVersion\":99"),
            ("\"HOTP\"", "\"STEAM\""),
            ("\"SHA1\"", "\"SHA384\""),
            ("\"digits\":8", "\"digits\":5"),
            ("\"counter\":1", "\"counter\":-1"),
            ("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "not-base32!"),
        ] {
            let input = std::str::from_utf8(PLAIN).unwrap().replace(from, to);
            assert!(parse(input.as_bytes(), "").is_err(), "{from}");
        }
        assert!(parse(b"{}", "").is_err());
        assert!(parse(&vec![0; MAX_BYTES + 1], "").is_err());
        assert!(parse(br#"{"schemaVersion":4,"servicesEncrypted":"x"}"#, "x").is_err());
        assert!(decrypt("x:x:x", "password").is_err());
    }
    #[test]
    fn imported_accounts_are_encrypted_and_persist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.sqlite3");
        let mut store = crate::database::Store::open(&path).unwrap();
        let rows = parse(ENCRYPTED, "phone-fixture-🔐").unwrap();
        assert_eq!(store.restore(&rows).unwrap(), 2);
        let blob: Vec<u8> = store
            .db
            .query_row("SELECT secret FROM accounts LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(!blob.windows(20).any(|w| w == b"12345678901234567890"));
        drop(store);
        let store = crate::database::Store::open(&path).unwrap();
        assert_eq!(store.list().unwrap().len(), 2);
        assert_eq!(store.backup_accounts().unwrap()[0].secret, rows[0].secret);
    }
}
