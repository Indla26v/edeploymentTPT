"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { persons, roleAssignments, stations, units, users } from "@/lib/db/schema";
import { setUserPassword, insertUserWithPassword } from "@/lib/auth/accounts";
import { generateTempPassword, usernameForOfficer } from "@/lib/auth/passwords";
import { USERNAME_PATTERN } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/session";
import { UserError, assertUnit, scopeUnitIds } from "@/lib/authz/authorize";
import { assignableRoles, scopeKindFor } from "@/lib/authz/assignable";
import { ROLES, type Role } from "@/lib/authz/roles";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { searchPersons } from "@/lib/queries/persons";
import type { CurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

const assignmentSchema = z.object({
  role: z.enum(ROLES),
  unitId: z.string().uuid().nullable().optional(),
  stationId: z.string().uuid().nullable().optional(),
});

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Validate requested assignments against what the granter may hand out, and resolve station → unit. */
async function resolveAssignments(tx: Tx, user: CurrentUser, list: z.infer<typeof assignmentSchema>[]) {
  const allowed = assignableRoles(user.activeRole);
  const out: { role: Role; unitId: string | null; stationId: string | null }[] = [];
  for (const a of list) {
    if (!allowed.includes(a.role)) throw new UserError(`You can't grant the ${a.role.replaceAll("_", " ").toLowerCase()} role.`);
    const kind = scopeKindFor(a.role);
    if (kind === "state") {
      out.push({ role: a.role, unitId: null, stationId: null });
    } else if (kind === "station") {
      if (!a.stationId) throw new UserError("Choose the station for the Office Incharge role.");
      const [st] = await tx.select({ unitId: stations.unitId }).from(stations).where(eq(stations.id, a.stationId)).limit(1);
      if (!st) throw new UserError("That station no longer exists.");
      assertUnit(user, st.unitId);
      out.push({ role: a.role, unitId: st.unitId, stationId: a.stationId });
    } else {
      if (!a.unitId) throw new UserError("Choose the unit for each role.");
      assertUnit(user, a.unitId);
      out.push({ role: a.role, unitId: a.unitId, stationId: null });
    }
  }
  return out;
}

const createSchema = z.object({
  personId: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Enter a name").max(120),
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN, "2–40 characters: letters, numbers, dot, dash or underscore"),
  assignments: z.array(assignmentSchema).min(1, "Give the user at least one role"),
});

export async function createUserAction(input: z.input<typeof createSchema>) {
  return mutate({
    permission: "admin.users.manage",
    schema: createSchema,
    input,
    run: async ({ tx, user, data, audit }) => {
      if (data.personId) {
        const [p] = await tx.select({ unitId: persons.unitId }).from(persons).where(eq(persons.id, data.personId)).limit(1);
        if (!p) throw new UserError("That officer no longer exists.");
        assertUnit(user, p.unitId);
        const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.personId, data.personId)).limit(1);
        if (taken) throw new UserError("This officer already has a login. Edit that user's roles instead.");
      }
      const [dup] = await tx.select({ id: users.id }).from(users).where(eq(users.username, data.username)).limit(1);
      if (dup) throw new UserError("That username is taken.");
      const resolved = await resolveAssignments(tx, user, data.assignments);
      const tempPassword = generateTempPassword();
      const { userId } = await insertUserWithPassword(tx, { username: data.username, name: data.name, personId: data.personId, password: tempPassword, mustChangePassword: true });
      await tx.insert(roleAssignments).values(resolved.map((r) => ({ ...r, userId, createdBy: user.id })));
      await notifyUser(tx, userId, { title: "Welcome to eDeployment", body: "Change your temporary password after signing in.", href: "/account/password", kind: "action" });
      await queueMessage(tx, { template: "account.created", toUserId: userId, payload: { username: data.username } });
      await audit({ action: "user.create", entity: "user", entityId: userId, after: { username: data.username, roles: resolved } });
      refresh();
      return { username: data.username, tempPassword };
    },
  });
}

/** Ensure the caller can manage the target user (state admins: anyone; UO: users tied to their unit). */
async function assertCanManage(tx: Tx, user: CurrentUser, targetId: string) {
  if (targetId === user.id) throw new UserError("Use your account page to change your own login.");
  const unitIds = scopeUnitIds(user);
  if (unitIds !== null) {
    const [viaPerson] = unitIds.length
      ? await tx.select({ id: users.id }).from(users).innerJoin(persons, eq(persons.id, users.personId)).where(and(eq(users.id, targetId), inArray(persons.unitId, unitIds))).limit(1)
      : [];
    const [viaRole] = unitIds.length
      ? await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(and(eq(roleAssignments.userId, targetId), inArray(roleAssignments.unitId, unitIds))).limit(1)
      : [];
    if (!viaPerson && !viaRole) throw new UserError("That user belongs to another unit.");
    const [privileged] = await tx
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, targetId), inArray(roleAssignments.role, ["SUPER_ADMIN", "DGP", "UNIT_OFFICER"]), eq(roleAssignments.isActive, true)))
      .limit(1);
    if (privileged) throw new UserError("Only the State Admin can change Unit Officer or state-level accounts.");
  }
}

const idSchema = z.object({ userId: z.string().uuid() });

export async function resetPasswordAction(input: z.input<typeof idSchema>) {
  return mutate({
    permission: "admin.users.manage",
    schema: idSchema,
    input,
    run: async ({ tx, user, data, audit }) => {
      await assertCanManage(tx, user, data.userId);
      const tempPassword = generateTempPassword();
      await setUserPassword(tx, data.userId, tempPassword, { mustChangePassword: true });
      await audit({ action: "user.reset_password", entity: "user", entityId: data.userId });
      refresh();
      return { tempPassword };
    },
  });
}

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });

export async function setUserActiveAction(input: z.input<typeof activeSchema>) {
  return mutate({
    permission: "admin.users.manage",
    schema: activeSchema,
    input,
    message: input.active ? "Account activated" : "Account deactivated",
    run: async ({ tx, user, data, audit }) => {
      await assertCanManage(tx, user, data.userId);
      await tx.update(users).set({ isActive: data.active }).where(eq(users.id, data.userId));
      await audit({ action: data.active ? "user.activate" : "user.deactivate", entity: "user", entityId: data.userId });
      refresh();
    },
  });
}

export async function unlockUserAction(input: z.input<typeof idSchema>) {
  return mutate({
    permission: "admin.users.manage",
    schema: idSchema,
    input,
    message: "Account unlocked",
    run: async ({ tx, user, data, audit }) => {
      await assertCanManage(tx, user, data.userId);
      await tx.update(users).set({ lockedUntil: null, failedLoginCount: 0 }).where(eq(users.id, data.userId));
      await audit({ action: "user.unlock", entity: "user", entityId: data.userId });
      refresh();
    },
  });
}

const rolesSchema = z.object({ userId: z.string().uuid(), assignments: z.array(assignmentSchema) });

/** Replace a user's unit/station/state role assignments. Plan-scoped assignments (workflow) are left untouched. */
export async function saveRolesAction(input: z.input<typeof rolesSchema>) {
  return mutate({
    permission: "admin.users.manage",
    schema: rolesSchema,
    input,
    message: "Roles saved",
    run: async ({ tx, user, data, audit }) => {
      await assertCanManage(tx, user, data.userId);
      const resolved = await resolveAssignments(tx, user, data.assignments);
      const before = await tx.select().from(roleAssignments).where(and(eq(roleAssignments.userId, data.userId), isNull(roleAssignments.planId)));
      await tx.delete(roleAssignments).where(and(eq(roleAssignments.userId, data.userId), isNull(roleAssignments.planId)));
      if (resolved.length) await tx.insert(roleAssignments).values(resolved.map((r) => ({ ...r, userId: data.userId, createdBy: user.id })));
      await audit({ action: "user.roles", entity: "user", entityId: data.userId, before: before.map((b) => ({ role: b.role, unitId: b.unitId, stationId: b.stationId })), after: resolved });
      refresh();
    },
  });
}

export async function searchPersonsAction(q: string) {
  const user = await requireUser();
  return searchPersons(user, q);
}

export async function suggestUsernameAction(personId: string) {
  const user = await requireUser();
  const [p] = await getDb()
    .select({ genNo: persons.genNo, name: persons.name, unitId: persons.unitId })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  if (!p) return null;
  const unitIds = scopeUnitIds(user);
  if (unitIds && !unitIds.includes(p.unitId)) return null;
  const [u] = await getDb().select({ code: units.code }).from(units).where(eq(units.id, p.unitId)).limit(1);
  return { username: usernameForOfficer(u?.code ?? "unit", p.genNo), name: p.name };
}
