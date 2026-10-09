export interface Account {
  id: string;
  issuer: string;
  name: string;
  kind: "totp" | "hotp";
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 6 | 8;
  period: number;
  counter: number;
  favorite: boolean;
  position: number;
  icon: string;
}
export type AccountInput = Omit<Account, "id" | "favorite" | "position"> & {
  secret: string;
};
export interface Settings {
  privacy_mode: boolean;
  clipboard_seconds: number;
  lock_seconds: number;
  always_on_top: boolean;
  startup: boolean;
  tray: boolean;
  sort: "manual" | "name" | "issuer";
}
export interface Status {
  shortcut_available: boolean;
  locked: boolean;
  password_set: boolean;
  settings: Settings;
}
export interface TokenCode {
  id: string;
  code: string;
  remaining: number;
  period: number;
}
