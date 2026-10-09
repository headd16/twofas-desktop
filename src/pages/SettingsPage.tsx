import { useState } from "react";
import { LockKeyhole, Download, Upload, ChevronRight } from "lucide-react";
import { Dialog } from "../components/ui/Dialog";
import { native } from "../services/native";
import type { Status, Settings } from "../types";
export function SettingsPage({
  status,
  onChange,
  notify,
}: {
  status: Status;
  onChange: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [modal, setModal] = useState<
    "password" | "export" | "restore" | "phone" | null
  >(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    try {
      await native.settings({ ...status.settings, [key]: value });
      await onChange();
    } catch (e) {
      notify(String(e));
    }
  };
  const open = (m: typeof modal) => {
    setCurrent("");
    setPassword("");
    setConfirm("");
    setError("");
    setModal(m);
  };
  const submit = async () => {
    setError("");
    if (modal !== "restore" && modal !== "phone" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (modal === "password") {
        await native.password(current, password);
        notify(password ? "App password set" : "App password removed");
      } else if (modal === "export") {
        const saved = await native.exportBackup(password);
        if (saved) notify("Encrypted backup saved");
      } else if (modal === "phone") {
        const count = await native.importPhoneBackup(password);
        if (count) notify(`Imported ${count} phone accounts`);
      } else {
        const count = await native.restoreBackup(password);
        if (count) notify(`Restored ${count} accounts`);
      }
      await onChange();
      setModal(null);
      setPassword("");
      setCurrent("");
      setConfirm("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-page">
      <h2>Security</h2>
      <label className="setting-row">
        Hide codes for screen sharing
        <input
          type="checkbox"
          checked={status.settings.privacy_mode}
          onChange={(e) => void change("privacy_mode", e.target.checked)}
        />
      </label>
      <p className="hint">
        Privacy mode hides codes until you reveal one for up to 10 seconds. Copy
        works without revealing. Codes hide again when the app loses focus.
        Account names remain visible; revealed codes can be captured by viewers.
      </p>
      <button className="setting-link" onClick={() => open("password")}>
        <LockKeyhole size={18} />
        <span>
          {status.password_set ? "Change app password" : "Set app password"}
        </span>
        <ChevronRight size={16} />
      </button>
      <p className="hint">
        Secrets are protected by Windows DPAPI. An app password gates access to
        codes; it does not replace Windows account protection.
      </p>
      <label className="setting-row">
        Auto-lock
        <select
          disabled={!status.password_set}
          value={status.settings.lock_seconds}
          onChange={(e) => void change("lock_seconds", Number(e.target.value))}
        >
          <option value={0}>Never</option>
          <option value={60}>1 minute</option>
          <option value={300}>5 minutes</option>
          <option value={900}>15 minutes</option>
        </select>
      </label>
      <label className="setting-row">
        Clear copied codes
        <select
          value={status.settings.clipboard_seconds}
          onChange={(e) =>
            void change("clipboard_seconds", Number(e.target.value))
          }
        >
          <option value={0}>Never</option>
          <option value={15}>15 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
        </select>
      </label>
      <h2>Desktop</h2>
      {(
        [
          ["tray", "Close to system tray"],
          ["startup", "Launch at Windows sign-in"],
          ["always_on_top", "Always on top"],
        ] as const
      ).map(([key, label]) => (
        <label className="setting-row" key={key}>
          {label}
          <input
            type="checkbox"
            checked={status.settings[key]}
            onChange={(e) => void change(key, e.target.checked)}
          />
        </label>
      ))}
      <p className="hint">
        {status.shortcut_available === false
          ? "Global shortcut unavailable (already used by another app). Open from the tray."
          : "Open: Ctrl + Shift + Space"}
        <br />
        Search: Ctrl + F · Add: Ctrl + N<br />
        Copy focused token: Enter · Lock: Ctrl + L
      </p>
      <label className="setting-row">
        Account order
        <select
          value={status.settings.sort}
          onChange={(e) =>
            void change("sort", e.target.value as Settings["sort"])
          }
        >
          <option value="manual">Manual</option>
          <option value="issuer">Service</option>
          <option value="name">Account</option>
        </select>
      </label>
      <h2>Backups & migration</h2>
      <button className="setting-link" onClick={() => open("phone")}>
        <Upload size={18} />
        <span>Import from phone (.2fas)</span>
        <ChevronRight size={16} />
      </button>
      <button className="setting-link" onClick={() => open("export")}>
        <Download size={18} />
        <span>Export encrypted backup</span>
        <ChevronRight size={16} />
      </button>
      <button className="setting-link" onClick={() => open("restore")}>
        <Upload size={18} />
        <span>Restore encrypted backup</span>
        <ChevronRight size={16} />
      </button>
      <p className="hint">
        Import encrypted or unencrypted 2FAS phone exports (schema 4). Desktop
        backups use the separate password-protected .2fw format. Per-account
        migration QR is available in Token details.
      </p>
      <h2>About</h2>
      <p className="about">
        2FAS Desktop <span>0.1.0</span>
      </p>
      <p className="hint">
        Independent, open-source Windows edition. Not affiliated with or
        endorsed by 2FAS. No cloud account, telemetry, or network access for
        core operation.
      </p>
      {modal && (
        <Dialog
          title={
            modal === "password"
              ? "App password"
              : modal === "export"
                ? "Encrypted backup"
                : modal === "phone"
                  ? "Import from phone"
                  : "Restore backup"
          }
          onClose={() => {
            if (!busy) {
              setModal(null);
              setPassword("");
              setCurrent("");
              setConfirm("");
            }
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {modal === "password" && status.password_set && (
              <label>
                Current app password
                <input
                  type="password"
                  autoFocus
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            )}
            <label>
              {modal === "phone"
                ? "Phone export password (if encrypted)"
                : modal === "restore"
                  ? "Backup password"
                  : modal === "password"
                    ? "New password (empty removes lock)"
                    : "New backup password"}
              <input
                type="password"
                autoFocus
                value={password}
                required={modal !== "password" && modal !== "phone"}
                minLength={
                  modal === "restore" || modal === "phone" ? undefined : 10
                }
                maxLength={1024}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  modal === "restore" || modal === "phone"
                    ? "current-password"
                    : "new-password"
                }
              />
            </label>
            {modal !== "restore" && modal !== "phone" && (
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            )}
            <p className="hint">
              {modal === "phone"
                ? "Export a file from 2FAS on your phone, then select it here. Leave the password empty for an unencrypted export. Import runs locally; existing accounts are kept. Phone groups, custom icons and badges are not transferred."
                : modal === "password"
                  ? "Choose a unique password. Forgotten app passwords cannot be recovered; keep an encrypted backup."
                  : "The backup includes authenticator secrets. Keep the file and its password safe."}
            </p>
            <button className="primary" disabled={busy}>
              {busy
                ? "Working…"
                : modal === "password"
                  ? "Save password"
                  : modal === "export"
                    ? "Choose save location"
                    : modal === "phone"
                      ? "Choose phone export file"
                      : "Choose backup file"}
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}
