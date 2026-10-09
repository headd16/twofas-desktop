use data_encoding::{BASE32, BASE32_NOPAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use zeroize::Zeroizing;

// Keep counters exactly representable across the JSON/TypeScript boundary.
pub const MAX_COUNTER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Serialize, Deserialize)]
pub struct AccountInput {
    pub issuer: String,
    pub name: String,
    pub kind: String,
    pub algorithm: String,
    pub digits: u32,
    pub period: u64,
    pub counter: u64,
    pub secret: String,
    #[serde(default = "default_icon")]
    pub icon: String,
    #[serde(default)]
    pub favorite: bool,
}
fn default_icon() -> String {
    "auto".into()
}
impl Drop for AccountInput {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.secret.zeroize();
    }
}
pub fn decode(secret: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    if secret.len() > 2048 {
        return Err("Secret is too long".into());
    }
    let s = Zeroizing::new(
        secret
            .chars()
            .filter(|c| !c.is_ascii_whitespace())
            .collect::<String>()
            .to_ascii_uppercase(),
    );
    let bytes = if s.contains('=') {
        BASE32.decode(s.as_bytes())
    } else {
        BASE32_NOPAD.decode(s.as_bytes())
    }
    .map_err(|_| "Secret must be valid Base32")?;
    if bytes.is_empty() || bytes.len() > 1024 {
        return Err("Secret must contain 1–1024 bytes".into());
    }
    Ok(Zeroizing::new(bytes))
}
pub fn validate(input: &AccountInput) -> Result<(), String> {
    if input.name.trim().is_empty() || input.name.len() > 256 || input.issuer.len() > 256 {
        return Err("Enter an account name (maximum 256 characters)".into());
    }
    if !["totp", "hotp"].contains(&input.kind.as_str())
        || !["SHA1", "SHA256", "SHA512"].contains(&input.algorithm.as_str())
        || ![6, 8].contains(&input.digits)
        || !(1..=3600).contains(&input.period)
        || input.counter > MAX_COUNTER
    {
        return Err("Invalid OTP configuration".into());
    }
    if ![
        "auto",
        "generic",
        "github",
        "google",
        "microsoft",
        "discord",
        "epic",
        "binance",
        "amazon",
        "facebook",
        "nvidia", "hostinger", "vk", "vercel", "wellfound", "2fas",
        "steam",
        "twitch",
        "reddit",
        "spotify",
        "dropbox",
        "paypal",
        "instagram",
        "x",
        "apple",
        "proton",
        "bitwarden",
        "cloudflare",
        "gitlab",
        "npm",
        "docker",
        "notion",
        "ubisoft",
        "roblox",
        "telegram",
        "whatsapp",
        "stripe",
        "digitalocean",
        "coinbase",
        "okta",
        "zoom",
    ]
    .contains(&input.icon.as_str())
    {
        return Err("Invalid icon".into());
    }
    decode(&input.secret)?;
    Ok(())
}
pub fn hotp(key: &[u8], counter: u64, algorithm: &str, digits: u32) -> Result<String, String> {
    if ![6, 8].contains(&digits) {
        return Err("Digits must be 6 or 8".into());
    }
    macro_rules! digest {
        ($hash:ty) => {{
            let mut m = <Hmac<$hash> as Mac>::new_from_slice(key).map_err(|_| "Invalid key")?;
            m.update(&counter.to_be_bytes());
            m.finalize().into_bytes().to_vec()
        }};
    }
    let hash = Zeroizing::new(match algorithm {
        "SHA1" => digest!(Sha1),
        "SHA256" => digest!(Sha256),
        "SHA512" => digest!(Sha512),
        _ => return Err("Unsupported algorithm".into()),
    });
    let offset = (hash[hash.len() - 1] & 15) as usize;
    let value = u32::from_be_bytes(
        hash[offset..offset + 4]
            .try_into()
            .map_err(|_| "Invalid digest")?,
    ) & 0x7fff_ffff;
    Ok(format!(
        "{:0width$}",
        value % 10_u32.pow(digits),
        width = digits as usize
    ))
}
pub fn totp(
    key: &[u8],
    timestamp: u64,
    period: u64,
    algorithm: &str,
    digits: u32,
) -> Result<String, String> {
    if period == 0 {
        return Err("Period cannot be zero".into());
    }
    hotp(key, timestamp / period, algorithm, digits)
}
pub fn parse_uri(uri: &str) -> Result<AccountInput, String> {
    if uri.len() > 8192 {
        return Err("URI is too long".into());
    }
    let url = url::Url::parse(uri.trim()).map_err(|_| "Invalid otpauth URI")?;
    if url.scheme() != "otpauth"
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Expected a standard otpauth:// URI".into());
    }
    let kind = url.host_str().unwrap_or("");
    let label = percent_encoding::percent_decode_str(url.path().trim_start_matches('/'))
        .decode_utf8()
        .map_err(|_| "Invalid account label")?;
    let mut params = std::collections::HashMap::new();
    for (k, v) in url.query_pairs() {
        if params.insert(k.into_owned(), v.into_owned()).is_some() {
            return Err("Duplicate URI parameter".into());
        }
    }
    let (label_issuer, name) = label.split_once(':').unwrap_or(("", &label));
    let issuer = params
        .get("issuer")
        .map(String::as_str)
        .unwrap_or(label_issuer);
    if !label_issuer.is_empty() && !issuer.is_empty() && label_issuer != issuer {
        return Err("URI issuer and label disagree".into());
    }
    let number = |key: &str, default: u64| -> Result<u64, String> {
        params
            .get(key)
            .map(|x| x.parse::<u64>().map_err(|_| format!("Invalid {key}")))
            .unwrap_or(Ok(default))
    };
    if kind == "hotp" && !params.contains_key("counter") {
        return Err("HOTP URI requires a counter".into());
    }
    let digits = number("digits", 6)?;
    if digits > u32::MAX as u64 {
        return Err("Invalid digits".into());
    }
    let input = AccountInput {
        issuer: issuer.into(),
        name: name.trim().into(),
        kind: kind.into(),
        algorithm: params
            .get("algorithm")
            .map(|s| s.to_ascii_uppercase())
            .unwrap_or("SHA1".into()),
        digits: digits as u32,
        period: number("period", 30)?,
        counter: number("counter", 0)?,
        secret: params.get("secret").ok_or("URI requires a secret")?.clone(),
        icon: default_icon(),
        favorite: false,
    };
    validate(&input)?;
    Ok(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rfc4226() {
        let expected = [
            "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583",
            "399871", "520489",
        ];
        for (n, e) in expected.iter().enumerate() {
            assert_eq!(
                hotp(b"12345678901234567890", n as u64, "SHA1", 6).unwrap(),
                *e
            );
        }
    }
    #[test]
    fn rfc6238() {
        let times = [
            59,
            1111111109,
            1111111111,
            1234567890,
            2000000000,
            20000000000,
        ];
        let expected = [
            [
                "94287082", "07081804", "14050471", "89005924", "69279037", "65353130",
            ],
            [
                "46119246", "68084774", "67062674", "91819424", "90698825", "77737706",
            ],
            [
                "90693936", "25091201", "99943326", "93441116", "38618901", "47863826",
            ],
        ];
        let keys = [
            b"12345678901234567890".as_slice(),
            b"12345678901234567890123456789012".as_slice(),
            b"1234567890123456789012345678901234567890123456789012345678901234".as_slice(),
        ];
        for (a, alg) in ["SHA1", "SHA256", "SHA512"].iter().enumerate() {
            for (i, t) in times.iter().enumerate() {
                assert_eq!(totp(keys[a], *t, 30, alg, 8).unwrap(), expected[a][i]);
            }
        }
    }
    #[test]
    fn base32_and_invalid() {
        assert_eq!(&*decode("MZXW6===").unwrap(), b"foo");
        assert_eq!(&*decode("mzxw6").unwrap(), b"foo");
        for s in ["", "!!!!", "A", "MZ=XX"] {
            assert!(decode(s).is_err());
        }
    }
    #[test]
    fn uri_validation() {
        let a = parse_uri("otpauth://totp/GitHub%3Aalice?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")
            .unwrap();
        assert_eq!(a.name, "alice");
        assert_eq!(a.issuer, "GitHub");
        assert!(parse_uri("otpauth://hotp/a?secret=MY").is_err());
        assert!(parse_uri("otpauth://totp/a?secret=MY&period=0").is_err());
        assert!(parse_uri("otpauth://totp/a?secret=MY&digits=4294967302").is_err());
        assert!(parse_uri("otpauth://totp/a?secret=MY&secret=MY").is_err());
    }
    #[test]
    fn period_boundary() {
        let k = b"abc";
        assert_eq!(
            totp(k, 29, 30, "SHA1", 6).unwrap(),
            hotp(k, 0, "SHA1", 6).unwrap()
        );
        assert_eq!(
            totp(k, 30, 30, "SHA1", 6).unwrap(),
            hotp(k, 1, "SHA1", 6).unwrap()
        );
        assert!(totp(k, 0, 0, "SHA1", 6).is_err());
    }
}
