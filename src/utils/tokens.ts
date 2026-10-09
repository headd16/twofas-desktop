import type { Account, Settings } from "../types";
export function filterAccounts(
  accounts: Account[],
  query: string,
  sort: Settings["sort"],
): Account[] {
  const q = query.trim().toLocaleLowerCase();
  return accounts
    .filter((a) => `${a.issuer} ${a.name}`.toLocaleLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (sort === "manual"
          ? a.position - b.position
          : a[sort].localeCompare(b[sort])) ||
        a.id.localeCompare(b.id),
    );
}
export function formatCode(code: string): string {
  return code.replace(
    new RegExp(`(.{${code.length === 8 ? 4 : 3}})(?=.)`, "g"),
    "$1 ",
  );
}
