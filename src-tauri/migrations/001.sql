PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 issuer TEXT NOT NULL,
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('totp','hotp')),
 algorithm TEXT NOT NULL CHECK(algorithm IN ('SHA1','SHA256','SHA512')),
 digits INTEGER NOT NULL CHECK(digits IN (6,8)),
 period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 3600),
 counter INTEGER NOT NULL CHECK(counter >= 0),
 secret BLOB NOT NULL,
 favorite INTEGER NOT NULL DEFAULT 0,
 position INTEGER NOT NULL,
 icon TEXT NOT NULL DEFAULT 'auto'
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
