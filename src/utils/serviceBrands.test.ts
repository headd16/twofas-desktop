import { describe, it, expect } from "vitest";
import { detectService, serviceBrands } from "./serviceBrands";
describe("local service icon detection", () => {
  it("detects all bundled brands and aliases", () => {
    for (const brand of serviceBrands)
      for (const alias of brand.aliases)
        expect(detectService(alias)).toBe(brand.key);
  });
  it("uses issuer first, then account label, including domains", () => {
    expect(detectService("GitHub", "Google account")).toBe("github");
    expect(detectService("", "alice@gmail.com")).toBe("google");
    expect(detectService("", "Steam account")).toBe("steam");
    expect(detectService("MICROSOFT (Personal)")).toBe("microsoft");
    expect(detectService("https://accounts.proton.me")).toBe("proton");
  });
  it("respects overrides and avoids substring false positives", () => {
    expect(detectService("Google", "", "github")).toBe("github");
    expect(detectService("Google", "", "generic")).toBe("generic");
    expect(detectService("Example metadata Steamship")).toBe("generic");
    expect(detectService("Unknown", "", "not-a-brand")).toBe("generic");
    expect(detectService("Unknown service", "alice@gmail.com")).toBe("generic");
    expect(detectService("Vercel", "alice@gmail.com")).toBe("vercel");
  });
});
