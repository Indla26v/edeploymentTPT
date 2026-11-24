import { randomInt } from "node:crypto";

/** Policy: at least 10 characters with upper, lower, digit and symbol. Returns the first problem found. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters";
  if (pw.length > 128) return "Use at most 128 characters";
  if (!/[a-z]/.test(pw)) return "Add a lowercase letter";
  if (!/[A-Z]/.test(pw)) return "Add an uppercase letter";
  if (!/\d/.test(pw)) return "Add a number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add a symbol (e.g. @ # !)";
  return null;
}

const ALPHABET = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnpqrstuvwxyz",
  digit: "23456789",
  symbol: "@#$%&*!?",
};

/** A readable one-time password that satisfies the policy (no 0/O/1/l ambiguity). */
export function generateTempPassword(): string {
  const pick = (s: string) => s[randomInt(s.length)]!;
  const chars = [pick(ALPHABET.upper), pick(ALPHABET.lower), pick(ALPHABET.digit), pick(ALPHABET.symbol)];
  const all = ALPHABET.upper + ALPHABET.lower + ALPHABET.digit;
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Username for auto-created officer logins, e.g. unit DEMO-DIST + Gen No 1281 → "demo-1281". */
export function usernameForOfficer(unitCode: string, genNo: string): string {
  const prefix = unitCode.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "unit";
  return `${prefix}-${genNo}`.toLowerCase();
}

export function placeholderEmail(usernameValue: string): string {
  return `${usernameValue}@users.edeployment.local`;
}
