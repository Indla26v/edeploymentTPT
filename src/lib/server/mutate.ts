import "server-only";

import { headers } from "next/headers";
import type { z } from "zod";

import { getDb } from "../db";
import { auditLog } from "../db/schema";
import type { CurrentUser } from "../auth/session";
import { requireUser } from "../auth/session";
import { AuthzError, UserError, can } from "../authz/authorize";
import type { PermissionKey } from "../authz/permissions";
import type { DbOrTx } from "../auth/accounts";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * The only way the app changes data:
 *   signed-in user → permission check → zod validation → one DB transaction (run + audit rows) → result.
 * Business-rule failures throw `UserError` (message shown to the user); scope failures throw `AuthzError`.
 */
export async function mutate<S extends z.ZodType, R>(opts: {
  permission: PermissionKey | null;
  schema: S;
  input: unknown;
  run: (args: { tx: Tx; user: CurrentUser; data: z.infer<S>; audit: (e: AuditEntry) => Promise<void> }) => Promise<R>;
  message?: string;
}): Promise<ActionResult<R>> {
  const user = await requireUser({ allowPasswordChange: true });
  if (opts.permission && !can(user, opts.permission)) {
    return { ok: false, error: "You don't have permission to do this." };
  }
  const parsed = opts.schema.safeParse(opts.input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const userAgent = h.get("user-agent");

  try {
    const data = await getDb().transaction(async (tx) => {
      const audit = async (e: AuditEntry) => {
        await writeAudit(tx, { ...e, actorUserId: user.id, actingRole: user.activeRole, ip, userAgent });
      };
      return opts.run({ tx, user, data: parsed.data, audit });
    });
    return { ok: true, data, message: opts.message };
  } catch (err) {
    if (err instanceof UserError || err instanceof AuthzError) return { ok: false, error: err.message };
    if (isUniqueViolation(err)) return { ok: false, error: "That record already exists." };
    if (isExclusionViolation(err)) return { ok: false, error: "That officer is already booked on an overlapping bandobast." };
    console.error("mutation failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function writeAudit(
  db: DbOrTx,
  e: AuditEntry & { actorUserId: string | null; actingRole?: string | null; ip?: string | null; userAgent?: string | null },
) {
  await db.insert(auditLog).values({
    actorUserId: e.actorUserId,
    actingRole: e.actingRole ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    before: (e.before ?? null) as object | null,
    after: (e.after ?? null) as object | null,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
  });
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}
export function isUniqueViolation(err: unknown) {
  return pgCode(err) === "23505";
}
export function isExclusionViolation(err: unknown) {
  return pgCode(err) === "23P01";
}
