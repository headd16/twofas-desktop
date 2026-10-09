import { MoreHorizontal, Star, RefreshCw, Eye, EyeOff } from "lucide-react";
import type { Account, TokenCode } from "../../types";
import { formatCode } from "../../utils/tokens";
import { ServiceIcon } from "./ServiceIcon";
export function TokenRow({
  account,
  token,
  onCopy,
  onEdit,
  onAdvance,
  privacyMode = false,
  revealed = false,
  onReveal,
}: {
  account: Account;
  token?: TokenCode;
  onCopy: () => void;
  onEdit: () => void;
  onAdvance: () => void;
  privacyMode?: boolean;
  revealed?: boolean;
  onReveal?: () => void;
}) {
  const remaining = token?.remaining ?? 0;
  const period = token?.period ?? account.period;
  const hidden = privacyMode && !revealed;
  return (
    <article className="token-row">
      <ServiceIcon
        issuer={account.issuer}
        name={account.name}
        icon={account.icon}
      />
      <button
        className="token-content"
        onClick={onCopy}
        aria-label={`Copy ${account.issuer || account.name} code`}
        disabled={!token}
      >
        <span className="token-label">
          {account.issuer || account.name}
          {account.favorite && <Star size={11} fill="currentColor" />}
        </span>
        {account.issuer && (
          <span className="account-label">{account.name}</span>
        )}
        <span className="code">
          {hidden || !token?.code
            ? account.digits === 8
              ? "•••• ••••"
              : "••• •••"
            : formatCode(token.code)}
        </span>
      </button>
      <div className="token-side">
        {privacyMode && (
          <button
            className="reveal-button"
            aria-label={`${revealed ? "Hide" : "Reveal"} ${account.issuer || account.name} code`}
            aria-pressed={revealed}
            onClick={onReveal}
            title={
              revealed
                ? "Hide code"
                : "Reveal for up to 10 seconds (visible to viewers)"
            }
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
        {account.kind === "totp" ? (
          <div
            className={`countdown ${remaining <= 5 ? "urgent" : ""}`}
            aria-label={`${remaining} seconds remaining`}
          >
            <svg viewBox="0 0 36 36">
              <circle className="track" cx="18" cy="18" r="15" />
              <circle
                className="progress"
                cx="18"
                cy="18"
                r="15"
                strokeDasharray="94.248"
                strokeDashoffset={94.248 * (1 - remaining / period)}
                style={
                  remaining === period ? { transition: "none" } : undefined
                }
              />
            </svg>
            <span>{remaining}</span>
          </div>
        ) : (
          <button
            className="counter-button"
            onClick={onAdvance}
            title="Advance HOTP counter"
            aria-label={`Advance ${account.issuer} counter`}
          >
            <RefreshCw size={19} />
          </button>
        )}
        <button
          className="row-options"
          aria-label={`Edit ${account.issuer || account.name}`}
          onClick={onEdit}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </article>
  );
}
