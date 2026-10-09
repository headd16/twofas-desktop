import { describe, it, expect } from "vitest";
import { filterAccounts, formatCode } from "./tokens";
import type { Account } from "../types";
const a: Account = {
  id: "1",
  issuer: "GitHub",
  name: "alice",
  kind: "totp",
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  counter: 0,
  favorite: false,
  position: 0,
  icon: "auto",
};
describe("token presentation", () => {
  it("searches issuer and account case-insensitively without mutating source", () => {
    const rows = [a, { ...a, id: "2", issuer: "Google", name: "bob" }];
    expect(filterAccounts(rows, " ALICE ", "manual")).toEqual([a]);
    expect(filterAccounts(rows, "google", "manual")).toHaveLength(1);
    expect(rows[0].id).toBe("1");
  });
  it("pins favorites before service sorting and supports manual positions", () => {
    const b = { ...a, id: "2", issuer: "Amazon", position: 1 };
    expect(filterAccounts([a, b], "", "issuer")[0].id).toBe("2");
    expect(
      filterAccounts([a, { ...b, favorite: true }], "", "manual")[0].id,
    ).toBe("2");
    expect(filterAccounts([b, a], "", "manual")[0].id).toBe("1");
  });
  it("groups six and eight digit codes including leading zeroes", () => {
    expect(formatCode("001234")).toBe("001 234");
    expect(formatCode("00123456")).toBe("0012 3456");
  });
});
