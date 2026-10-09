// Independent interoperability fixtures using Node/OpenSSL, only public RFC keys.
import { pbkdf2Sync, createCipheriv } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const services = [
  {
    name: "RFC TOTP",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    updatedAt: 0,
    otp: {
      account: "public-fixture",
      issuer: "RFC TOTP",
      tokenType: "TOTP",
      algorithm: "SHA1",
      digits: 8,
      period: 60,
    },
    order: { position: 2 },
  },
  {
    name: "RFC HOTP",
    secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    updatedAt: 0,
    otp: {
      account: "public-fixture",
      issuer: "RFC HOTP",
      tokenType: "HOTP",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: 1,
    },
    order: { position: 1 },
  },
];
const salt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
const key = pbkdf2Sync("phone-fixture-🔐", salt, 10000, 32, "sha256");
function encrypt(text, ivHex) {
  const iv = Buffer.from(ivHex, "hex");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return [data, salt, iv].map((b) => b.toString("base64")).join(":");
}
const folder = new URL("../src-tauri/tests/fixtures/", import.meta.url);
mkdirSync(folder, { recursive: true });
writeFileSync(
  new URL("phone-plain.2fas", folder),
  JSON.stringify({ schemaVersion: 4, appOrigin: "android", services }),
);
writeFileSync(
  new URL("phone-encrypted.2fas", folder),
  JSON.stringify({
    schemaVersion: 4,
    appOrigin: "android",
    services: [],
    reference: encrypt(
      "public interoperability reference",
      "00112233445566778899aabb",
    ),
    servicesEncrypted: encrypt(
      JSON.stringify(services),
      "ffeeddccbbaa998877665544",
    ),
  }),
);
key.fill(0);
