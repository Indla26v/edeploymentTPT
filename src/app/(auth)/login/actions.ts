"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { signInWithLockout } from "@/lib/auth/login";
import { getAuth } from "@/lib/auth/server";
import { writeAudit } from "@/lib/server/mutate";

export type SignInState = { error?: string; username?: string } | undefined;

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username").max(40),
  password: z.string().min(1, "Enter your password").max(128),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, username: String(formData.get("username") ?? "") };
  const { username, password, next } = parsed.data;
  const h = await headers();

  const outcome = await signInWithLockout(getDb(), { username, password }, async (u, p) => {
    try {
      await getAuth().api.signInUsername({ body: { username: u, password: p }, headers: h });
      return true;
    } catch {
      return false;
    }
  });

  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!outcome.ok) {
    await writeAudit(getDb(), {
      actorUserId: null,
      action: `login.${outcome.reason}`,
      entity: "user",
      entityId: username.toLowerCase(),
      ip,
      userAgent: h.get("user-agent"),
    });
    if (outcome.reason === "locked") {
      const mins = Math.max(1, Math.ceil((outcome.lockedUntil.getTime() - Date.now()) / 60_000));
      return { error: `Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.`, username };
    }
    if (outcome.reason === "inactive") return { error: "This account is deactivated. Contact your Unit Officer.", username };
    return { error: "Wrong username or password.", username };
  }

  await writeAudit(getDb(), { actorUserId: outcome.userId, action: "login.success", entity: "user", entityId: outcome.userId, ip, userAgent: h.get("user-agent") });
  redirect(outcome.mustChangePassword ? "/account/password?required=1" : safeNext(next));
}
