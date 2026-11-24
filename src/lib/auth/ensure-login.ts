import "server-only";

import { eq } from "drizzle-orm";

import { persons, units, users } from "../db/schema";
import { insertUserWithPassword, type DbOrTx } from "./accounts";
import { generateTempPassword, usernameForOfficer } from "./passwords";

export type CreatedLogin = { userId: string; username: string; name: string; tempPassword: string | null };

/**
 * Returns the officer's login, creating one (`<unit>-<genNo>`, one-time password, must change at first
 * sign-in) when they have none. Used when the UO names an Office Incharge and when the IO names a CO.
 */
export async function ensureLoginForPerson(tx: DbOrTx, personId: string): Promise<CreatedLogin> {
  const [p] = await tx.select({ id: persons.id, name: persons.name, genNo: persons.genNo, unitId: persons.unitId }).from(persons).where(eq(persons.id, personId)).limit(1);
  if (!p) throw new Error("person not found");
  const [existing] = await tx.select({ id: users.id, username: users.username, isActive: users.isActive }).from(users).where(eq(users.personId, p.id)).limit(1);
  if (existing) {
    if (!existing.isActive) await tx.update(users).set({ isActive: true }).where(eq(users.id, existing.id));
    return { userId: existing.id, username: existing.username ?? "", name: p.name, tempPassword: null };
  }
  const [unit] = await tx.select({ code: units.code }).from(units).where(eq(units.id, p.unitId)).limit(1);
  let username = usernameForOfficer(unit?.code ?? "unit", p.genNo);
  const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (taken) username = `${username}-${Math.floor(Math.random() * 900 + 100)}`;
  const tempPassword = generateTempPassword();
  const { userId } = await insertUserWithPassword(tx, { username, name: p.name, personId: p.id, password: tempPassword, mustChangePassword: true });
  return { userId, username, name: p.name, tempPassword };
}
