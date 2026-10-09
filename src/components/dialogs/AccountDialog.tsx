import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  ImagePlus,
  Star,
  ArrowUp,
  ArrowDown,
  Trash2,
  QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import { Dialog } from "../ui/Dialog";
import { native } from "../../services/native";
import type { Account, AccountInput } from "../../types";
import { serviceBrands } from "../../utils/serviceBrands";
import { ServiceIcon } from "../tokens/ServiceIcon";
export function AccountDialog({
  account,
  onClose,
  onSaved,
  onMove,
  privacyMode = false,
}: {
  account?: Account;
  privacyMode?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onMove: (id: string, direction: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<"manual" | "uri" | "camera">("manual");
  const [form, setForm] = useState<AccountInput>({
    issuer: account?.issuer ?? "",
    name: account?.name ?? "",
    kind: account?.kind ?? "totp",
    algorithm: account?.algorithm ?? "SHA1",
    digits: account?.digits ?? 6,
    period: account?.period ?? 30,
    counter: account?.counter ?? 0,
    icon: account?.icon ?? "auto",
    secret: "",
  });
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [qr, setQr] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const processing = useRef(false);
  const action = async (fn: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onSaved();
      if (close) onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    if (mode === "camera") {
      const reader = new BrowserQRCodeReader();
      reader
        .decodeFromVideoDevice(
          undefined,
          video.current!,
          async (result, _, c) => {
            if (result && !processing.current) {
              processing.current = true;
              c.stop();
              try {
                await native.importUri(result.getText());
                await onSaved();
                onClose();
              } catch (e) {
                if (!cancelled) {
                  setError(String(e));
                  setMode("uri");
                }
              } finally {
                processing.current = false;
              }
            }
          },
        )
        .then((c) => {
          if (cancelled) c.stop();
          else controls.current = c;
        })
        .catch((e) => {
          if (!cancelled) setError(`Camera unavailable: ${String(e)}`);
        });
    }
    return () => {
      cancelled = true;
      controls.current?.stop();
      controls.current = null;
    };
  }, [mode]);
  const image = async (file: File) => {
    setError("");
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      await action(() => native.importUri(result.getText()));
    } catch {
      setError("No readable standard otpauth QR code found");
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const set = <K extends keyof AccountInput>(key: K, value: AccountInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Dialog title={account ? "Token details" : "Add account"} onClose={onClose}>
      {!account && (
        <>
          <div className="segmented">
            {(["manual", "uri", "camera"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setError("");
                  setMode(m);
                }}
              >
                {m === "manual"
                  ? "Manual"
                  : m === "uri"
                    ? "URI / image"
                    : "Webcam"}
              </button>
            ))}
          </div>
          <p className="hint">
            Your secret stays on this device. QR decoding runs locally.
          </p>
        </>
      )}
      {mode === "manual" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(() => native.save(form, account?.id));
          }}
        >
          <label>
            Service / issuer
            <input
              autoFocus
              value={form.issuer}
              maxLength={256}
              onChange={(e) => set("issuer", e.target.value)}
              placeholder="e.g. GitHub"
            />
          </label>
          <label>
            Account name
            <input
              required
              value={form.name}
              maxLength={256}
              onChange={(e) => set("name", e.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            {account ? "Replace secret (leave empty to keep)" : "Base32 secret"}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              required={!account}
              value={form.secret}
              maxLength={2048}
              onChange={(e) => set("secret", e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Type
              <select
                value={form.kind}
                onChange={(e) =>
                  set("kind", e.target.value as AccountInput["kind"])
                }
              >
                <option value="totp">TOTP · time based</option>
                <option value="hotp">HOTP · counter based</option>
              </select>
            </label>
            <label>
              Algorithm
              <select
                value={form.algorithm}
                onChange={(e) =>
                  set("algorithm", e.target.value as AccountInput["algorithm"])
                }
              >
                {["SHA1", "SHA256", "SHA512"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Digits
              <select
                value={form.digits}
                onChange={(e) => set("digits", Number(e.target.value) as 6 | 8)}
              >
                <option>6</option>
                <option>8</option>
              </select>
            </label>
            <label>
              {form.kind === "totp" ? "Period (seconds)" : "Counter"}
              <input
                type="number"
                min={form.kind === "totp" ? 1 : 0}
                max={form.kind === "totp" ? 3600 : Number.MAX_SAFE_INTEGER}
                step="1"
                value={form.kind === "totp" ? form.period : form.counter}
                onChange={(e) =>
                  set(
                    form.kind === "totp" ? "period" : "counter",
                    Number(e.target.value),
                  )
                }
              />
            </label>
          </div>
          <label>
            Service icon
            <select
              value={form.icon}
              onChange={(e) => set("icon", e.target.value)}
            >
              <option value="auto">Automatic detection</option>
              <option value="generic">Generic shield</option>
              {serviceBrands.map((brand) => (
                <option key={brand.key} value={brand.key}>
                  {brand.label}
                </option>
              ))}
            </select>
          </label>
          <div className="icon-preview">
            <ServiceIcon
              issuer={form.issuer}
              name={form.name}
              icon={form.icon}
            />
            <span>Icon preview ? detected locally</span>
          </div>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : account ? "Save changes" : "Add account"}
          </button>
        </form>
      ) : mode === "uri" ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() => native.importUri(uri));
            }}
          >
            <label>
              otpauth:// URI
              <textarea
                autoFocus
                required
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={8192}
              />
            </label>
            <button className="primary" disabled={busy}>
              Import account
            </button>
          </form>
          <label className="file-button">
            <ImagePlus size={18} /> Import QR image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void image(file);
              }}
            />
          </label>
        </>
      ) : (
        <div className="camera">
          <video ref={video} muted playsInline />
          <p>
            <Camera size={16} /> Point your webcam at an account QR code
          </p>
        </div>
      )}
      {account && (
        <div className="detail-actions">
          <button
            onClick={() =>
              void action(() => native.favorite(account.id, !account.favorite))
            }
          >
            <Star size={17} />
            {account.favorite ? "Unpin favorite" : "Pin favorite"}
          </button>
          <div className="inline">
            <button onClick={() => void action(() => onMove(account.id, -1))}>
              <ArrowUp size={17} />
              Move up
            </button>
            <button onClick={() => void action(() => onMove(account.id, 1))}>
              <ArrowDown size={17} />
              Move down
            </button>
          </div>
          <button
            disabled={busy || privacyMode}
            title={
              privacyMode
                ? "Turn off privacy mode to show migration secrets"
                : undefined
            }
            onClick={() =>
              void action(async () => {
                const uri = await native.migration(account.id);
                if (uri)
                  setQr(await QRCode.toDataURL(uri, { width: 256, margin: 2 }));
              }, false)
            }
          >
            <QrCode size={17} />
            Show migration QR
          </button>
          {privacyMode && (
            <p className="hint">Migration QR is hidden in privacy mode.</p>
          )}
          {qr && !privacyMode && (
            <div className="migration">
              <img src={qr} alt="Unencrypted migration QR" />
              <p>Secret visible. Keep this screen private.</p>
              <button onClick={() => setQr("")}>Hide QR</button>
            </div>
          )}
          {deleting ? (
            <div className="delete-confirm">
              <p>
                Delete this token? You will need the original service recovery
                method to add it again.
              </p>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void action(() => native.remove(account.id))}
              >
                Confirm deletion
              </button>
              <button onClick={() => setDeleting(false)}>Cancel</button>
            </div>
          ) : (
            <button className="danger" onClick={() => setDeleting(true)}>
              <Trash2 size={17} />
              Delete account
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
