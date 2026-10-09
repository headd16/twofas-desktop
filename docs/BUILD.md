# Windows build

## Prerequisites

- Windows 10/11 x64, current WebView2 runtime.
- Node.js 22.12+ and npm.
- Rust stable for `x86_64-pc-windows-msvc`.
- Visual Studio 2022 Build Tools: Desktop development with C++, MSVC x64 compiler, and Windows SDK.
- Internet on the first build to download locked dependencies and the Tauri NSIS toolchain.

```powershell
npm ci
npm run check
npm test
cargo test --manifest-path src-tauri/Cargo.toml
.\build.cmd
```

`build.cmd` adds the standard Rust bin path and initializes the installed `C:\BuildTools` compiler if available. With another Visual Studio location, use an x64 Native Tools prompt or let Rust discover its registered MSVC installation.

NSIS output: `src-tauri/target/release/bundle/nsis/`. Standalone binary: `src-tauri/target/release/twofas-desktop.exe`.

Commit both lockfiles. Use `npm ci` and Cargo `--locked` for reproducible dependency resolution. Configure Tauri signing options for trusted production distribution. This repository does not include a signing certificate. NSIS is a [supported Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/).

Icons are generated from local drawing instructions by `scripts/make-icons.ps1`. They are checked in, so regeneration is unnecessary for a normal build.

## Tests

- Native: official RFC 4226/6238 vectors, Base32 validation, URI validation, time boundaries, DPAPI round-trip/tampering, Argon2 password checks, encrypted backup authentication, SQLite CRUD, ordering, persistence, atomic restore, and lock guard.
- Frontend: code grouping, filtering, pin/manual/name ordering, native code display/copy dispatch, lock state, and settings navigation.

Never use your actual authenticator secret in fixtures, screenshots, or test output. Public RFC fixtures are safe for tests and cannot protect real accounts.
