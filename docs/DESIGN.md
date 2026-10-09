# Reference adaptation

The supplied image is a promotional composition with a phone, overlapping magnified rows, and unrelated browser artwork. The desktop design follows the authenticator UI inside the phone and the magnified token rows. Browser artwork, phone bezel, mobile status bar, and the central promotional logo are excluded from the application window.

| Element | Desktop measurement |
| --- | --- |
| Initial client window | 420 × 720 logical px |
| Minimum client window | 360 × 540 logical px |
| Custom title region | 34 px |
| Main horizontal inset | 23 px |
| Heading | 29 px, semibold |
| Search | 37 px high, 10 px radius |
| Token row | 101 px minimum, no card background |
| Service icon | 42 px |
| OTP | 35 px, weight 300, tabular numerals |
| Countdown | 32 px; 1.35 px stroke |
| Separator | 1 px, #202020 |
| Bottom navigation | 88 px |
| Add button | 54 px, #ED1C24 |

Black background, #101010 secondary surfaces, white text, #858585 muted text. SVG branding is bundled locally; Amazon and Microsoft use local drawings. Number groups are 3+3 or 4+4. No initial sample accounts, synthetic OTPs, or production mock backend.

The small account identifier under the issuer is a desktop readability adaptation. Controls have focus indicators and accessible names. Native modal dialog elements trap focus; Escape closes them. Reduced-motion disables transitions. The window uses logical dimensions for DPI scaling and keeps native resizing. Windows decides whether native outer corners are rounded.

Frontend modules: application orchestration, layout chrome, token rendering, security/settings page, account modal, native IPC service, types, and pure presentation utilities. Rust modules: validated commands, DPAPI/password security, OTP, SQLite storage, backup cryptography, tray/startup. Sensitive decisions and secret decryption live in Rust.
