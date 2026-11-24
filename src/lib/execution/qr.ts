import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * QR tokens on ID cards: base64url(planId|personId) + "." + HMAC signature. Anyone can read the payload, but
 * only the server can make a valid one, so a tampered or forged card is rejected at check-in.
 */
function secret(): string {
  const s = process.env.QR_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("Set QR_SECRET (or BETTER_AUTH_SECRET) to sign ID card QR codes.");
  return s;
}

const b64 = (b: Buffer) => b.toString("base64url");
const hexToBuf = (uuid: string) => Buffer.from(uuid.replace(/-/g, ""), "hex");
const bufToUuid = (b: Buffer) => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function signCheckinToken(planId: string, personId: string, key = secret()): string {
  const payload = Buffer.concat([hexToBuf(planId), hexToBuf(personId)]);
  const sig = createHmac("sha256", key).update(payload).digest().subarray(0, 12);
  return `${b64(payload)}.${b64(sig)}`;
}

export function verifyCheckinToken(token: string, key = secret()): { planId: string; personId: string } | null {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  let payload: Buffer;
  let sig: Buffer;
  try {
    payload = Buffer.from(p, "base64url");
    sig = Buffer.from(s, "base64url");
  } catch {
    return null;
  }
  if (payload.length !== 32 || sig.length !== 12) return null;
  const expected = createHmac("sha256", key).update(payload).digest().subarray(0, 12);
  if (!timingSafeEqual(sig, expected)) return null;
  return { planId: bufToUuid(payload.subarray(0, 16)), personId: bufToUuid(payload.subarray(16)) };
}
