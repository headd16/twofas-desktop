use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::RngCore;
use zeroize::Zeroizing;
const MAGIC: &[u8; 8] = b"2FASWIN1";
pub fn encrypt(bytes: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if password.len() < 10 || password.len() > 1024 {
        return Err("Backup password must contain 10–1024 characters".into());
    }
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let key = derive(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "Invalid key")?;
    let data = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            aes_gcm::aead::Payload {
                msg: bytes,
                aad: MAGIC,
            },
        )
        .map_err(|_| "Backup encryption failed")?;
    Ok([MAGIC.as_slice(), &salt, &nonce, &data].concat())
}
pub fn decrypt(bytes: &[u8], password: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    if bytes.len() < 52
        || bytes.len() > 16 * 1024 * 1024
        || &bytes[..8] != MAGIC
        || password.len() > 1024
    {
        return Err("Invalid backup format or size".into());
    }
    let key = derive(password, &bytes[8..24])?;
    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "Invalid key")?;
    cipher
        .decrypt(
            Nonce::from_slice(&bytes[24..36]),
            aes_gcm::aead::Payload {
                msg: &bytes[36..],
                aad: MAGIC,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| "Incorrect password or damaged backup".into())
}
fn derive(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    let mut key = Zeroizing::new([0; 32]);
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut *key)
        .map_err(|_| "Key derivation failed")?;
    Ok(key)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_roundtrip() {
        let b = encrypt(b"secret accounts", "long backup password").unwrap();
        assert_eq!(
            &*decrypt(&b, "long backup password").unwrap(),
            b"secret accounts"
        );
        assert!(decrypt(&b, "wrong").is_err());
        let mut b = b;
        b[45] ^= 1;
        assert!(decrypt(&b, "long backup password").is_err());
    }
}
