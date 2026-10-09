import { Shield } from "lucide-react";
import { detectService, serviceBrands } from "../../utils/serviceBrands";
export function ServiceIcon({
  issuer,
  icon,
  name = "",
}: {
  issuer: string;
  icon: string;
  name?: string;
}) {
  const key = detectService(issuer, name, icon);
  if (key === "amazon")
    return (
      <span className="service-icon" aria-hidden="true" data-service={key}>
        <svg viewBox="0 0 24 24">
          <text
            x="6"
            y="17"
            fill="#fff"
            fontFamily="Georgia"
            fontWeight="bold"
            fontSize="21"
          >
            a
          </text>
          <path
            d="M4 20Q12 24 21 19M18 18l3 1-1 3"
            stroke="#ff9900"
            fill="none"
            strokeWidth="1.4"
          />
        </svg>
      </span>
    );
  if (key === "microsoft")
    return (
      <span
        className="service-icon microsoft"
        aria-hidden="true"
        data-service={key}
      >
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  const brand = serviceBrands.find((item) => item.key === key)?.icon;
  return (
    <span
      className={`service-icon ${key}`}
      aria-hidden="true"
      data-service={key}
    >
      {brand ? (
        <svg
          viewBox="0 0 24 24"
          fill={
            [
              "epic",
              "github",
              "apple",
              "x",
              "notion",
              "steam",
              "vercel",
              "wellfound",
            ].includes(key) || brand.hex === "000000"
              ? "#fff"
              : `#${brand.hex}`
          }
        >
          <path d={brand.path} />
        </svg>
      ) : (
        <Shield size={23} />
      )}
    </span>
  );
}
