"use server";

import { headers } from "next/headers";
import QRCode from "qrcode";

import { requireUser } from "@/lib/auth/session";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/server/mutate";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const message = (e: unknown) => (e as { body?: { message?: string } })?.body?.message ?? "Something went wrong.";

/** Step 1: confirm the password; returns the QR code and one-time backup codes. 2FA turns on after step 2. */
export async function startTwoFactorAction(password: string): Promise<Result<{ qr: string; secret: string; backupCodes: string[] }>> {
  const user = await requireUser({ allowPasswordChange: true });
  try {
    const r = await getAuth().api.enableTwoFactor({ body: { password, issuer: "eDeployment", method: "totp" }, headers: await headers() });
    if (r.method !== "totp") return { ok: false, error: "Authenticator setup is not available." };
    const secret = new URL(r.totpURI).searchParams.get("secret") ?? "";
    // The label shows the username, not the placeholder email.
    const uri = r.totpURI.replace(/otpauth:\/\/totp\/[^?]+/, `otpauth://totp/eDeployment:${encodeURIComponent(user.username)}`);
    return { ok: true, data: { qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }), secret, backupCodes: r.backupCodes } };
  } catch (e) {
    return { ok: false, error: /password/i.test(message(e)) ? "Wrong password." : message(e) };
  }
}

/** Step 2: the first code from the app proves it's set up; two-factor sign-in is now on. */
export async function confirmTwoFactorAction(code: string): Promise<Result> {
  const user = await requireUser({ allowPasswordChange: true });
  try {
    await getAuth().api.verifyTOTP({ body: { code: code.replace(/\s+/g, "") }, headers: await headers() });
  } catch {
    return { ok: false, error: "Wrong code. Check the time on your phone and try again." };
  }
  await writeAudit(getDb(), { actorUserId: user.id, action: "account.2fa_enabled", entity: "user", entityId: user.id });
  return { ok: true, data: undefined };
}

export async function disableTwoFactorAction(password: string): Promise<Result> {
  const user = await requireUser({ allowPasswordChange: true });
  if (user.activeRole === "SUPER_ADMIN" && process.env.REQUIRE_ADMIN_2FA !== "false") return { ok: false, error: "State Admins must keep two-step sign-in on." };
  try {
    await getAuth().api.disableTwoFactor({ body: { password }, headers: await headers() });
  } catch (e) {
    return { ok: false, error: /password/i.test(message(e)) ? "Wrong password." : message(e) };
  }
  await writeAudit(getDb(), { actorUserId: user.id, action: "account.2fa_disabled", entity: "user", entityId: user.id });
  return { ok: true, data: undefined };
}
