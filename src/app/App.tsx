import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  MoreHorizontal,
  Search,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Minus,
  X,
  LockKeyhole,
  LogOut,
  Check,
  EyeOff,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native } from "../services/native";
import type { Account, Status, TokenCode } from "../types";
import { filterAccounts } from "../utils/tokens";
import { TokenRow } from "../components/tokens/TokenRow";
import { AccountDialog } from "../components/dialogs/AccountDialog";
import { Dialog } from "../components/ui/Dialog";
import { SettingsPage } from "../pages/SettingsPage";
export function App() {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const reveal = useRef<{ id: string; until: number } | null>(null);
  const refreshSequence = useRef(0);
  const privacyMutation = useRef(false);
  const clearReveal = useCallback(() => {
    const active = reveal.current;
    reveal.current = null;
    setRevealedId(null);
    if (active)
      setCodes((previous) => previous.map((token) => ({ ...token, code: "" })));
  }, []);
  const [status, setStatus] = useState<Status>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [codes, setCodes] = useState<TokenCode[]>([]);
  const [page, setPage] = useState<"tokens" | "settings">("tokens");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Account | "add" | null>(null);
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState(false);
  const [message, setMessage] = useState("");
  const [fatal, setFatal] = useState("");
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string) => {
    setMessage(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 3000);
  }, []);
  const refresh = useCallback(async () => {
    if (privacyMutation.current) return;
    const sequence = ++refreshSequence.current;
    const s = await native.status();
    if (sequence !== refreshSequence.current) return;
    setStatus(s);
    if (s.locked) {
      clearReveal();
      setCodes([]);
      setAccounts([]);
      setDialog(null);
      setInfo(false);
      setMenu(false);
    } else {
      const activeReveal = reveal.current;
      const ids =
        activeReveal && activeReveal.until > Date.now()
          ? [activeReveal.id]
          : [];
      const [a, c] = await Promise.all([native.accounts(), native.codes(ids)]);
      if (sequence !== refreshSequence.current) return;
      setAccounts(a);
      setCodes(
        c.map((token) =>
          s.settings.privacy_mode &&
          (reveal.current?.id !== token.id ||
            reveal.current.until <= Date.now())
            ? { ...token, code: "" }
            : token,
        ),
      );
    }
    setFatal("");
  }, [clearReveal]);
  useEffect(() => {
    const hide = () => clearReveal();
    const visibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clearReveal]);
  useEffect(() => {
    if (!revealedId || !reveal.current) return;
    const timer = setTimeout(
      clearReveal,
      Math.max(0, reveal.current.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [revealedId, clearReveal]);
  useEffect(() => {
    clearReveal();
  }, [page, status?.settings.privacy_mode, clearReveal]);
  useEffect(() => {
    let active = true;
    let pending = false;
    const tick = async () => {
      if (pending) return;
      pending = true;
      try {
        if (active) await refresh();
      } catch (e) {
        if (String(e) === "LOCKED") {
          setCodes([]);
          setAccounts([]);
          setDialog(null);
        } else if (active) setFatal(String(e));
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    let last = 0;
    const act = () => {
      if (Date.now() - last > 5000) {
        last = Date.now();
        void native.activity().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", act);
    window.addEventListener("keydown", act);
    return () => {
      window.removeEventListener("pointerdown", act);
      window.removeEventListener("keydown", act);
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || status?.locked) return;
      if (e.key === "f") {
        e.preventDefault();
        setPage("tokens");
        search.current?.focus();
      }
      if (e.key === "n") {
        e.preventDefault();
        setDialog("add");
      }
      if (e.key === "l") {
        e.preventDefault();
        void native
          .lock()
          .then(refresh)
          .catch((e) => notify(String(e)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status?.locked, refresh, notify]);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      await refresh();
      if (success) notify(success);
    } catch (e) {
      notify(String(e));
    }
  };
  const move = async (id: string, direction: number) => {
    const all = [...accounts].sort((a, b) => a.position - b.position);
    const index = all.findIndex((a) => a.id === id);
    const target = index + direction;
    if (target < 0 || target >= all.length) return;
    [all[index], all[target]] = [all[target], all[index]];
    await native.reorder(all.map((a) => a.id));
  };
  const unlock = async () => {
    setBusy(true);
    setUnlockError("");
    try {
      await native.unlock(password);
      setPassword("");
      await refresh();
    } catch (e) {
      setUnlockError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const windowAction = (fn: () => Promise<void>) =>
    void fn().catch((e) => notify(String(e)));
  const visible = filterAccounts(
    accounts,
    query,
    status?.settings.sort ?? "manual",
  );
  return (
    <div className="app-shell">
      <div
        className="titlebar"
        data-tauri-drag-region
        onDoubleClick={() =>
          windowAction(() => getCurrentWindow().toggleMaximize())
        }
      >
        <span data-tauri-drag-region className="wordmark">
          <svg
            className="app-brand-icon"
            viewBox="0 0 32 32"
            aria-hidden="true"
          >
            <circle cx="16" cy="16" r="16" fill="#ed1c24" />
            <path fill="white" d="M9 8h14v4H9zm0 6h9v4H9zm0 7h4v4H9z" />
          </svg>
          2FAS <span>DESKTOP</span>
        </span>
        <div className="window-controls">
          <button
            aria-label="Minimize window"
            onClick={() => windowAction(() => getCurrentWindow().minimize())}
          >
            <Minus size={13} />
          </button>
          <button
            aria-label="Close window"
            onClick={() => windowAction(() => getCurrentWindow().close())}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {status?.locked ? (
        <main className="lock-screen">
          <span className="lock-icon">
            <LockKeyhole size={34} />
          </span>
          <h1>Vault locked</h1>
          <p>Enter your app password to view tokens.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <label className="sr-only" htmlFor="unlock">
              App password
            </label>
            <input
              id="unlock"
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="App password"
            />
            <button className="primary" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
          {unlockError && (
            <p role="alert" className="error">
              {unlockError}
            </p>
          )}
        </main>
      ) : (
        <>
          <header className="main-header">
            <div className="heading-row">
              <h1>{page === "tokens" ? "Tokens" : "Settings"}</h1>
              <div className="header-actions">
                <button
                  aria-label="Privacy mode"
                  aria-pressed={status?.settings.privacy_mode ?? false}
                  title="Hide codes for screen sharing"
                  disabled={!status}
                  onClick={() => {
                    if (!status || privacyMutation.current) return;
                    privacyMutation.current = true;
                    clearReveal();
                    refreshSequence.current += 1;
                    const settings = {
                      ...status.settings,
                      privacy_mode: !status.settings.privacy_mode,
                    };
                    setStatus({ ...status, settings });
                    if (!status.settings.privacy_mode)
                      setCodes((previous) =>
                        previous.map((token) => ({ ...token, code: "" })),
                      );
                    void native
                      .settings(settings)
                      .then(async () => {
                        privacyMutation.current = false;
                        await refresh();
                      })
                      .catch(async (e) => {
                        privacyMutation.current = false;
                        notify(String(e));
                        await refresh().catch(() => {});
                      });
                  }}
                >
                  <EyeOff size={18} />
                </button>
                <button
                  aria-label="Security information"
                  onClick={() => setInfo(true)}
                >
                  <Bell size={18} fill="currentColor" />
                </button>
                <button
                  aria-label="Options"
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  <MoreHorizontal size={21} />
                </button>
              </div>
            </div>
            {page === "tokens" && (
              <div className="search">
                <Search size={17} />
                <input
                  ref={search}
                  aria-label="Search tokens"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )}
            {menu && (
              <div className="options-menu">
                <button
                  onClick={() => {
                    setMenu(false);
                    void run(native.lock);
                  }}
                >
                  <LockKeyhole size={17} />
                  Lock vault
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    setPage("settings");
                  }}
                >
                  <SettingsIcon size={17} />
                  Settings & backups
                </button>
                <button
                  onClick={() => {
                    setMenu(false);
                    windowAction(() => getCurrentWindow().close());
                  }}
                >
                  <LogOut size={17} />
                  Close window
                </button>
              </div>
            )}
          </header>
          {status?.settings.privacy_mode && (
            <div className="privacy-banner" role="status">
              <EyeOff size={14} />
              <span>
                Privacy mode · codes hidden. Reveals are visible to viewers.
              </span>
            </div>
          )}
          <main className="content">
            {fatal ? (
              <div className="empty">
                <ShieldCheck size={32} />
                <h2>Unable to open vault</h2>
                <p>{fatal}</p>
                <button className="primary" onClick={() => void run(refresh)}>
                  Retry
                </button>
              </div>
            ) : !status ? (
              <div className="empty" role="status">
                Opening secure vault…
              </div>
            ) : page === "settings" ? (
              <SettingsPage
                status={status}
                onChange={refresh}
                notify={notify}
              />
            ) : visible.length ? (
              <div className="token-list">
                {visible.map((a) => (
                  <TokenRow
                    key={a.id}
                    account={a}
                    token={codes.find((c) => c.id === a.id)}
                    onCopy={() =>
                      void run(() => native.copy(a.id), "Code copied")
                    }
                    onEdit={() => setDialog(a)}
                    onAdvance={() => {
                      clearReveal();
                      void run(() => native.advance(a.id));
                    }}
                    privacyMode={status.settings.privacy_mode}
                    revealed={revealedId === a.id}
                    onReveal={() => {
                      if (revealedId === a.id) {
                        clearReveal();
                        return;
                      }
                      const remaining =
                        codes.find((c) => c.id === a.id)?.remaining ?? a.period;
                      reveal.current = {
                        id: a.id,
                        until:
                          Date.now() +
                          Math.min(
                            10,
                            a.kind === "totp" ? Math.max(1, remaining) : 10,
                          ) *
                            1000,
                      };
                      setCodes((previous) =>
                        previous.map((token) => ({ ...token, code: "" })),
                      );
                      setRevealedId(a.id);
                      void refresh().catch((e) => {
                        clearReveal();
                        notify(String(e));
                      });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="empty">
                <ShieldCheck size={36} />
                <h2>
                  {query ? "No matching tokens" : "Your tokens, right here"}
                </h2>
                <p>
                  {query
                    ? "Try a different service or account name."
                    : "Add an account using its setup key or QR code. Everything stays on your device."}
                </p>
                {!query && (
                  <button className="primary" onClick={() => setDialog("add")}>
                    Add your first account
                  </button>
                )}
              </div>
            )}
          </main>
          <nav className="bottom-nav" aria-label="Main navigation">
            <div className="nav-tabs">
              <button
                aria-current={page === "tokens" ? "page" : undefined}
                onClick={() => setPage("tokens")}
              >
                <ShieldCheck size={22} />
                <span>Tokens</span>
              </button>
              <button
                aria-current={page === "settings" ? "page" : undefined}
                onClick={() => setPage("settings")}
              >
                <SettingsIcon size={22} />
                <span>Settings</span>
              </button>
            </div>
            <button
              className="add-button"
              aria-label="Add account"
              onClick={() => setDialog("add")}
            >
              <Plus size={30} strokeWidth={1.6} />
            </button>
          </nav>
        </>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {dialog && !status?.locked && (
        <AccountDialog
          account={dialog === "add" ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSaved={refresh}
          onMove={move}
          privacyMode={status?.settings.privacy_mode}
        />
      )}{" "}
      {info && (
        <Dialog title="Security information" onClose={() => setInfo(false)}>
          <p className="info-text">
            All token secrets are encrypted with Windows DPAPI for your Windows
            user. Codes use your system clock. Keep Windows time synchronized.
          </p>
          <p className="info-text">
            Create an encrypted backup before replacing or resetting this
            computer. Set an app password to enable automatic locking.
          </p>
          <button
            className="primary"
            onClick={() => {
              setInfo(false);
              setPage("settings");
            }}
          >
            Open security settings
          </button>
        </Dialog>
      )}
    </div>
  );
}
