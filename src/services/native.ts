import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  AccountInput,
  Settings,
  Status,
  TokenCode,
} from "../types";
export const native = {
  status: () => invoke<Status>("status"),
  accounts: () => invoke<Account[]>("accounts"),
  codes: (revealIds: string[] = []) => invoke<TokenCode[]>("codes", { revealIds }),
  activity: () => invoke("activity"),
  save: (input: AccountInput, id?: string) =>
    invoke("save_account", { input, id: id ?? null }),
  importUri: (uri: string) => invoke("import_uri", { uri }),
  remove: (id: string) => invoke("delete_account", { id }),
  favorite: (id: string, value: boolean) => invoke("favorite", { id, value }),
  reorder: (ids: string[]) => invoke("reorder", { ids }),
  advance: (id: string) => invoke("advance", { id }),
  copy: (id: string) => invoke("copy_code", { id }),
  lock: () => invoke("lock"),
  unlock: (password: string) => invoke("unlock", { password }),
  password: (current: string, password: string) =>
    invoke("set_password", { current, password }),
  settings: (settings: Settings) => invoke("save_settings", { settings }),
  exportBackup: (password: string) =>
    invoke<boolean>("export_backup", { password }),
  restoreBackup: (password: string) =>
    invoke<number>("restore_backup", { password }),
  importPhoneBackup: (password: string) =>
    invoke<number>("import_phone_backup", { password }),
  migration: (id: string) => invoke<string | null>("migration_uri", { id }),
};
