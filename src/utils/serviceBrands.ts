import {
  siEpicgames,
  siBinance,
  siDiscord,
  siGithub,
  siGoogle,
  siFacebook,
  siSteam,
  siTwitch,
  siReddit,
  siSpotify,
  siDropbox,
  siPaypal,
  siInstagram,
  siX,
  siApple,
  siProton,
  siBitwarden,
  siCloudflare,
  siGitlab,
  siNpm,
  siDocker,
  siNotion,
  siUbisoft,
  siRoblox,
  siTelegram,
  siWhatsapp,
  siStripe,
  siDigitalocean,
  siCoinbase,
  siOkta,
  siZoom,
  siNvidia,
  siHostinger,
  siVk,
  siVercel,
  siWellfound,
  si2fas,
  type SimpleIcon,
} from "simple-icons";
export interface ServiceBrand {
  key: string;
  label: string;
  aliases: string[];
  icon?: SimpleIcon;
}
export const serviceBrands: ServiceBrand[] = [
  {
    key: "epic",
    label: "Epic Games",
    aliases: ["epic games", "epicgames", "epic"],
    icon: siEpicgames,
  },
  { key: "binance", label: "Binance", aliases: ["binance"], icon: siBinance },
  { key: "discord", label: "Discord", aliases: ["discord"], icon: siDiscord },
  { key: "github", label: "GitHub", aliases: ["github"], icon: siGithub },
  {
    key: "google",
    label: "Google",
    aliases: ["google", "gmail", "youtube"],
    icon: siGoogle,
  },
  {
    key: "facebook",
    label: "Facebook",
    aliases: ["facebook", "meta"],
    icon: siFacebook,
  },
  {
    key: "steam",
    label: "Steam",
    aliases: ["steam", "steampowered", "valve"],
    icon: siSteam,
  },
  { key: "twitch", label: "Twitch", aliases: ["twitch"], icon: siTwitch },
  { key: "reddit", label: "Reddit", aliases: ["reddit"], icon: siReddit },
  { key: "spotify", label: "Spotify", aliases: ["spotify"], icon: siSpotify },
  { key: "dropbox", label: "Dropbox", aliases: ["dropbox"], icon: siDropbox },
  { key: "paypal", label: "PayPal", aliases: ["paypal"], icon: siPaypal },
  {
    key: "instagram",
    label: "Instagram",
    aliases: ["instagram"],
    icon: siInstagram,
  },
  {
    key: "x",
    label: "X / Twitter",
    aliases: ["twitter", "x.com", "x"],
    icon: siX,
  },
  { key: "apple", label: "Apple", aliases: ["apple", "icloud"], icon: siApple },
  {
    key: "proton",
    label: "Proton",
    aliases: ["proton", "protonmail", "proton.me"],
    icon: siProton,
  },
  {
    key: "bitwarden",
    label: "Bitwarden",
    aliases: ["bitwarden"],
    icon: siBitwarden,
  },
  {
    key: "cloudflare",
    label: "Cloudflare",
    aliases: ["cloudflare"],
    icon: siCloudflare,
  },
  { key: "gitlab", label: "GitLab", aliases: ["gitlab"], icon: siGitlab },
  { key: "npm", label: "npm", aliases: ["npm", "npmjs"], icon: siNpm },
  { key: "docker", label: "Docker", aliases: ["docker"], icon: siDocker },
  { key: "notion", label: "Notion", aliases: ["notion"], icon: siNotion },
  {
    key: "ubisoft",
    label: "Ubisoft",
    aliases: ["ubisoft", "uplay"],
    icon: siUbisoft,
  },
  { key: "roblox", label: "Roblox", aliases: ["roblox"], icon: siRoblox },
  {
    key: "telegram",
    label: "Telegram",
    aliases: ["telegram"],
    icon: siTelegram,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    aliases: ["whatsapp"],
    icon: siWhatsapp,
  },
  { key: "stripe", label: "Stripe", aliases: ["stripe"], icon: siStripe },
  {
    key: "digitalocean",
    label: "DigitalOcean",
    aliases: ["digitalocean", "digital ocean"],
    icon: siDigitalocean,
  },
  {
    key: "coinbase",
    label: "Coinbase",
    aliases: ["coinbase"],
    icon: siCoinbase,
  },
  { key: "okta", label: "Okta", aliases: ["okta"], icon: siOkta },
  { key: "zoom", label: "Zoom", aliases: ["zoom", "zoom.us"], icon: siZoom },
  {
    key: "nvidia",
    label: "NVIDIA",
    aliases: ["nvidia", "geforce"],
    icon: siNvidia,
  },
  {
    key: "hostinger",
    label: "Hostinger",
    aliases: ["hostinger"],
    icon: siHostinger,
  },
  {
    key: "vk",
    label: "VK",
    aliases: ["vk", "vkontakte", "vk.com"],
    icon: siVk,
  },
  { key: "vercel", label: "Vercel", aliases: ["vercel"], icon: siVercel },
  {
    key: "wellfound",
    label: "AngelList / Wellfound",
    aliases: ["angellist", "angel list", "wellfound"],
    icon: siWellfound,
  },
  { key: "2fas", label: "2FAS", aliases: ["2fas", "2 fas"], icon: si2fas },
  {
    key: "amazon",
    label: "Amazon",
    aliases: ["amazon", "aws", "amazon web services"],
  },
  {
    key: "microsoft",
    label: "Microsoft",
    aliases: [
      "microsoft",
      "outlook",
      "office 365",
      "office365",
      "azure",
      "xbox",
      "live.com",
    ],
  },
];

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
// Token boundaries avoid accidental matches such as "x" in "Example" or "meta" in "metadata".
export function detectService(
  issuer: string,
  name = "",
  icon = "auto",
): string {
  if (icon !== "auto")
    return serviceBrands.some((brand) => brand.key === icon) ? icon : "generic";
  for (const value of issuer.trim() ? [issuer] : [name]) {
    const normalized = ` ${normalize(value)} `;
    const matched = serviceBrands.find((brand) =>
      brand.aliases.some((alias) =>
        normalized.includes(` ${normalize(alias)} `),
      ),
    );
    if (matched) return matched.key;
  }
  return "generic";
}
