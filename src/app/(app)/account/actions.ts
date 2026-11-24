"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordProblem } from "@/lib/auth/passwords";
import { getAuth } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/server/mutate";

export type PasswordState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean } | undefined;

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser({ allowPasswordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!current) fieldErrors.current = "Enter your current password";
  const problem = passwordProblem(next);
  if (problem) fieldErrors.next = problem;
  else if (next === current) fieldErrors.next = "Choose a password you haven't used here";
  if (next !== confirm) fieldErrors.confirm = "Passwords don't match";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  try {
    await getAuth().api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: await headers() });
  } catch {
    return { fieldErrors: { current: "Current password is wrong" } };
  }
  await getDb().update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
  await writeAudit(getDb(), { actorUserId: user.id, actingRole: user.activeRole, action: "password.change", entity: "user", entityId: user.id });
  if (user.mustChangePassword) redirect("/dashboard");
  return { ok: true };
}

export async function revokeSessionAction(token: string) {
  const user = await requireUser();
  if (token === user.sessionToken) return;
  await getAuth().api.revokeSession({ body: { token }, headers: await headers() });
  await writeAudit(getDb(), { actorUserId: user.id, actingRole: user.activeRole, action: "session.revoke", entity: "session", entityId: null });
  refresh();
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  await getAuth().api.revokeOtherSessions({ headers: await headers() });
  await writeAudit(getDb(), { actorUserId: user.id, actingRole: user.activeRole, action: "session.revoke_others", entity: "session", entityId: null });
  refresh();
}
