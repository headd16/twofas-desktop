# 2FAS Desktop for Windows

An independent local authenticator inspired by the supplied 2FAS mobile reference. Not affiliated with or endorsed by 2FAS. Imports the verified schema 4 `.2fas` phone export format; desktop exports use the separate `.2fw` format.

## Install and use

Run the x64 NSIS `2FAS Desktop_0.1.0_x64-setup.exe` installer in `artifacts/`. Windows 10/11 and Microsoft Edge WebView2 are required; the installer can download WebView2 if missing. Builds are unsigned unless you configure a signing certificate yourself.

Add a service's actual Base32 setup key, paste its `otpauth://` URI, import a QR image, or scan with your webcam. Copy a code by clicking it or focusing it and pressing Enter. HOTP requires explicitly advancing its counter; copying does not increment it.

Accounts persist in `%LOCALAPPDATA%\io.headcloud.twofas-desktop\vault.sqlite3`. Secrets are encrypted with current-user Windows DPAPI. Do not treat copying this database as a transferable backup: use **Settings → Export encrypted backup** and retain the backup password.

Set an app password to enable automatic locking and locked startup. Close-to-tray locks a password-protected vault. You can remove the app password by entering the current password and leaving the new password empty. A forgotten app password has no recovery bypass; restore your encrypted backup into a fresh vault. Do not delete the old vault until recovery has succeeded.

### Shortcuts

| Action | Shortcut |
| --- | --- |
| Open from anywhere | Ctrl + Shift + Space |
| Search tokens | Ctrl + F |
| Add account | Ctrl + N |
| Lock vault | Ctrl + L |
| Copy focused token | Enter / Space |

Settings include clipboard clearing, automatic locking, startup registration, always-on-top, close-to-tray, and account sorting. Favorites stay first. Manual order can be changed in token details. 39 built-in service icons are detected from issuer/account labels, including common aliases and domains, with a live preview and manual overrides. Icons never fetch remote images.

Use the eye-off button beside the Tokens heading, or **Settings > Hide codes for screen sharing**, to enable privacy mode. The preference survives restarts. Copy a hidden code without revealing it. Each eye button reveals one code for up to 10 seconds (or until its current period ends); focus loss, hiding the app, navigation and locking hide it again. Migration QR display is disabled in privacy mode. Account names and any explicitly revealed code remain visible to screen viewers. This mode does not detect a stream or exclude the window from capture. Avoid importing setup URIs while sharing your screen.

## Development

See [BUILD.md](docs/BUILD.md), [SECURITY.md](docs/SECURITY.md), [DESIGN.md](docs/DESIGN.md), and [VALIDATION.md](docs/VALIDATION.md).

```powershell
npm ci
npm run tauri -- dev
```

The application is Windows-specific because its vault relies on DPAPI. Run the native tests on Windows.

## Backup format

### Import from your phone

Export a backup file from the 2FAS Auth phone app and transfer it to Windows. In **Settings → Import from phone (.2fas)**, enter the export password if encrypted (leave empty for unencrypted files), select the file, and confirm the account count. All parsing and decryption run locally in Rust; account secrets never pass back to the renderer. Existing accounts are preserved. Reimporting creates duplicates.

Support is limited to verified schema 4 files, TOTP/HOTP, SHA1/SHA256/SHA512, and 6/8-digit codes. Unsupported or invalid records reject the entire file. OTP configuration, account labels and manual order are transferred; phone groups, badges and custom icons are not. Maximum file size: 16 MiB. Older schema versions require a new export from a current phone app. No official `.2fas` export or cloud-backup support is claimed.

The implementation was checked against [upstream Android backup models and cipher](https://github.com/twofas/2fas-android/tree/8656a4a2991844da366ab40414367f587fc3ebbd/core/cipher/src/main/java/com/twofasapp/cipher/backup). Interoperability tests use independent Node/OpenSSL encrypted fixtures with public RFC keys, not a real user's phone backup.

### Desktop backups

`.2fw` is this project's versioned binary format: `2FASWIN1`, 16-byte random salt, 12-byte random nonce, AES-256-GCM ciphertext and tag. Argon2id derives the key from the backup password. The fixed version header is authenticated. Restore appends accounts atomically after validation and confirmation. Restoring the same backup twice intentionally produces duplicates; verify the list before deleting originals. Windows app passwords and desktop preferences are not exported.

Per-account migration uses standard unencrypted `otpauth://` QR codes, only after a separate native warning and confirmation. Treat displayed QR codes as passwords. Hide or close the QR when finished.

## Distribution boundaries

The standalone executable is relocatable but keeps its vault in LocalAppData; it is not a USB-portable vault. DPAPI makes the vault dependent on your Windows user profile. Optional Windows Hello is not implemented. No cloud sync, update service, or OS notification permission is required. The bell opens actionable local security information.
