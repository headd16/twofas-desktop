use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};
use zeroize::Zeroizing;

pub fn protect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    dpapi(bytes, true).map(|x| x.to_vec())
}
pub fn unprotect(bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    dpapi(bytes, false)
}
fn dpapi(bytes: &[u8], encrypt: bool) -> Result<Zeroizing<Vec<u8>>, String> {
    if bytes.is_empty() || bytes.len() > 1_048_576 {
        return Err("Invalid protected data length".into());
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // DPAPI allocates output using LocalAlloc; copy, wipe and free on success.
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(
                "Windows could not protect/unprotect this data for the current user".into(),
            );
        }
        let buffer = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let result = Zeroizing::new(buffer.to_vec());
        use zeroize::Zeroize;
        buffer.zeroize();
        LocalFree(output.pbData as _);
        Ok(result)
    }
}
pub fn password_hash(password: &str) -> Result<String, String> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };
    if password.len() < 10 || password.len() > 1024 {
        return Err("Password must contain 10–1024 characters".into());
    }
    let salt = SaltString::generate(&mut rand::rngs::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| "Password hashing failed".into())
}
pub fn verify(password: &str, hash: &str) -> bool {
    use argon2::{
        password_hash::{PasswordHash, PasswordVerifier},
        Argon2,
    };
    password.len() <= 1024
        && PasswordHash::new(hash).is_ok_and(|h| {
            Argon2::default()
                .verify_password(password.as_bytes(), &h)
                .is_ok()
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dpapi_roundtrip_and_tamper() {
        let original = b"highly sensitive test data";
        let encrypted = protect(original).unwrap();
        assert!(!encrypted.windows(original.len()).any(|w| w == original));
        assert_eq!(&*unprotect(&encrypted).unwrap(), original);
        let mut bad = encrypted;
        let last = bad.len() - 1;
        bad[last] ^= 1;
        assert!(unprotect(&bad).is_err());
    }
    #[test]
    fn password_validation() {
        let h = password_hash("correct horse battery").unwrap();
        assert!(verify("correct horse battery", &h));
        assert!(!verify("wrong", &h));
        assert!(password_hash("short").is_err());
    }
}
