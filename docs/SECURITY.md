# Security architecture and threat model

## Vault

Each account secret is decoded from Base32 and protected directly using `CryptProtectData` under the current Windows user's context, with `CRYPTPROTECT_UI_FORBIDDEN`. SQLite receives only the protected binary blob. Issuer, label, configuration, favorites, and order are visible metadata. DPAPI authentication is checked by `CryptUnprotectData`. There is no plaintext encryption-key file or application-wide key embedded in code. [Microsoft documents DPAPI's current-user protection](https://learn.microsoft.com/en-us/windows/win32/seccrypto/cryptprotectdata).

Secret byte buffers use `Zeroizing`, including DPAPI output copies, decoded keys, backup plaintext and backup keys. The original Windows allocation is overwritten and freed with `LocalFree`. Rust `AccountInput` wipes its secret on drop. Password inputs are wrapped in `Zeroizing` after IPC. Temporary parser/serialization allocations and JavaScript strings cannot all be guaranteed wiped; the renderer handles raw secrets only for user entry, local QR decoding, and explicitly confirmed QR migration. Routine account listing and OTP generation never return raw secrets.

All account inputs are validated in Rust. SQL values use bound parameters. Settings have bounded numeric values and enumerated order modes. Restore validates every record before opening a transaction; any invalid record rejects the complete import. Database errors are sanitized and do not print SQL values or secrets. No secret logging is enabled.

## App lock

An optional Argon2id salted password verifier gates every account/code/copy/edit/backup IPC command. Automatic timeout is checked natively; renderer polling does not reset it. Actual pointer/keyboard activity refreshes it at most once every five seconds. A configured password locks startup and close-to-tray. Five failed unlock attempts trigger a 30-second cooldown. No default password or reset bypass exists.

The app password controls application access; it is not a second encryption layer over the DPAPI vault. A malicious process already running as the same Windows user can potentially call DPAPI, read process memory, alter the verifier/database, capture the screen, or use clipboard history. Windows account compromise is outside this application's protection boundary. This distinction is shown in settings.

## OTP

HMAC-SHA1/SHA256/SHA512, big-endian 64-bit counters, RFC dynamic truncation, and 6/8-digit decimal formatting. Stored HOTP counters are bounded to 2^53−1 to preserve exact values across JSON and TypeScript; larger imported counters are rejected. TOTP uses Unix time divided by the account period (default 30 seconds). Clock synchronization belongs to Windows. HOTP only advances on an explicit native command. [RFC 4226](https://www.rfc-editor.org/rfc/rfc4226) and [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238) define the test vectors used here.

## Backups

Versioned `.2fw` envelope uses random salt and nonce, Argon2id default parameters (19 MiB, 2 iterations, parallelism 1), and AES-256-GCM with authenticated version header. Passwords need at least ten characters. Restore limits the input file to 16 MiB, does not accept arbitrary KDF parameters, rejects failed authentication, and confirms before importing. Backups are written only after a native export confirmation. Backup passwords are independent of the app password.

Phone file import accepts verified 2FAS schema 4 JSON, either plaintext services or encrypted `servicesEncrypted` and `reference` envelopes. Upstream encryption uses PBKDF2-HMAC-SHA256 (10,000 iterations, 256-bit key) and AES-256-GCM (12-byte IV, 128-bit tag); each envelope encodes ciphertext+tag, salt and IV as colon-separated Base64. Both encrypted envelopes must authenticate. Decryption uses the supplied password only, never a cloud key. File reads are bounded to 16 MiB plus one byte, even if the selected file changes size. Secrets, input bytes, decrypted bytes and derived keys use zeroizing buffers; error messages omit secrets. Lock checks occur before file selection and again immediately before the atomic import. Unknown schemas, invalid records and unsupported OTP settings reject the entire file. Import is confirmed natively by account count, and does not replace existing accounts. Phone file secrets remain in Rust. Official phone export and cloud backup are not implemented.

Migration QR uses the standard URI format and contains an unencrypted secret. It is revealed only after a native warning/confirmation and is removed when hidden, the dialog closes, or the vault locks. Screenshots of it are equivalent to exporting a secret.

## Renderer and desktop

Production assets are local. CSP disallows remote scripts, frames, objects, and network connections except Tauri IPC. Only the main local window receives window-management capabilities. No shell/filesystem plugin is exposed. Native file dialogs control backup file selection. QR import is local ZXing; camera access uses WebView2's camera permissions.

The clipboard receives a freshly generated code in Rust. Timed clearing checks the copy generation and current text, preserving later copies of other content. Windows clipboard history/cloud synchronization can retain earlier entries; this application's clearing cannot remove historical copies.

Single-instance behavior avoids multiple vault writers. The global shortcut opens/focuses the app without exposing secrets or bypassing locking. Startup uses the current-user Run registry key. Closing to tray preserves the process; Quit exits it.

## Release limitations

This is an independent implementation, not an audited upstream 2FAS product. Source review and tests do not constitute an independent security audit. Configure signing before public distribution. Windows Hello, master-password vault encryption, cloud sync, and official phone-format exports are not implemented and have no UI pretending otherwise.

## Screen-sharing privacy mode

Privacy mode is a persisted display preference, not vault authentication or capture exclusion. Native code polling returns empty code strings for masked accounts and keeps countdown metadata available. Only the explicitly requested account is generated and returned to the renderer; copying remains native. The frontend removes revealed text from the DOM after at most ten seconds (bounded by the current TOTP period), on focus/visibility loss, navigation, counter advancement and locking. Late polling responses are masked again after a reveal ends. Migration QR retrieval is rejected by Rust while privacy mode is enabled.

Account metadata remains visible. Revealing a code makes it visible in screen sharing/recordings, and manual URI entry can expose setup material. Privacy mode cannot detect a broadcast, undo captured frames, protect clipboard history, or defend against compromised code running as the Windows user. Icon detection uses only bundled SVGs and local metadata, never remote lookups.
