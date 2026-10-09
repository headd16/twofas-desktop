# Validation — 2026-10-09

Executed on the Windows development host:

| Check | Result |
| --- | --- |
| `npm run build` (TypeScript + Vite) | Passed |
| `npm test` | 12 tests passed, 5 files |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 17 tests passed |
| `build.cmd` (Tauri Windows release and NSIS) | Passed; x64 installer generated |
| Final Windows executable startup | Passed |
| Native phone import dialog and file selection | Passed |
| Native schema 4 plaintext phone import | Passed; confirmed 2 accounts, HOTP `287082` at counter 1 |
| Fixture cleanup | Both public test accounts deleted through app controls |

Rust tests cover RFC 4226/6238 vectors, Base32 and URI validation, time boundaries, explicit HOTP advancement, DPAPI round-trip/tampering, CRUD, ordering, persistence, atomic restore, app lock, password validation and encrypted desktop backups. Phone import tests cover field mapping/order, independent Node/OpenSSL encryption with a Unicode password, wrong/missing passwords, tampering, unsupported schema/types/algorithms/digits, malformed data, file size limits, encrypted storage and persistence.

Frontend tests cover code display/copy dispatch, filtering/order, locked state, account entry, local QR decoding, settings navigation, phone file import dispatch, cancellation and password errors. jsdom does not provide native dialog methods; test setup supplies those browser methods.

The first installer packaging attempt hit a file-in-use error. Closing the running app and rebuilding completed successfully. The shipped installer comes from that successful final build.

Screenshots `artifacts/phone-import.png` and `artifacts/tokens-rfc.png` capture the actual Windows release executable. Shown keys/codes are public RFC test fixtures and cannot protect real accounts. No sample tokens are bundled in the app.

The earlier native smoke test in this conversation verified manual account creation, a TOTP period refresh and clipboard copying. These were not repeated for the phone-import change.

Limits: no real user's phone export was used. Encrypted phone interoperability was exercised with independent source-shaped fixtures, not an Android/iOS device. Webcam hardware, startup registration, installer installation/uninstallation, Windows 10, additional monitors and independent security auditing were not verified in this session. The installer is unsigned. See SECURITY.md and README.md for supported schemas and migration limits.

## Icon, privacy and countdown update ? 2026-10-09

- Frontend: `npm test` passed 18 tests across 6 files; TypeScript/Vite production build passed.
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml` passed 19 tests.
- New coverage: all 39 brand aliases, issuer precedence, account/domain fallback, manual overrides and substring false positives; masking in native code polling, one-account reveal, backwards-compatible settings and persisted privacy mode; copy while hidden, focus-loss hiding, ten-second reveal expiry, and immediate hiding during preference persistence.
- The title bar now includes the app mark beside 2FAS Desktop. TOTP rings use the red accent throughout the period, interpolate between second updates, reset without rewinding animation, and respect reduced-motion preferences.
- Privacy mode is opt-in and persists across restarts. It does not detect a stream or exclude the window from capture; account labels and explicitly revealed codes remain visible. URI setup/import should be done privately.

Native update smoke check: release startup passed; privacy toggle was exercised in the Windows WebView2 window and confirmed enabled with its hidden-code banner. Native UIA Toggle alone did not activate the React button; a real pointer click worked. The imported user accounts were preserved. No user secrets were exported or used as fixtures.

Final x64 NSIS rebuild passed after the issuer/email detection fix and six additional service icons. All current JS/CSS asset names from dist/index.html were found in the delivered executable. Frontend tests: 18 passed; Rust tests: 19 passed. No installer install/uninstall or actual streaming software capture test was performed for this update.

Final visual inspection confirmed that privacy mode persisted on release restart, OTP text was replaced by dots, per-token reveal buttons were present, the red timer rings were visible, and the title-bar mark rendered correctly. Black monochrome brand SVGs now use white ink for visibility on the black theme.
