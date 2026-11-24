"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { divisions, persons, ranks, roleAssignments, stations } from "@/lib/db/schema";
import { ensureLoginForPerson } from "@/lib/auth/ensure-login";
import { requireUser } from "@/lib/auth/session";
import { UserError, assertUnit, isStateLevel } from "@/lib/authz/authorize";
import { searchPersons } from "@/lib/queries/persons";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";

const stationSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,16}$/, "2–16 letters, digits or dashes"),
  name: z.string().trim().min(2, "Enter the station name").max(120),
  kind: z.enum(["police_station", "office", "special_unit", "control_room"]),
  divisionId: z.union([z.string().uuid(), z.literal("")]).optional(),
  newDivision: z.string().trim().max(60).optional(),
  location: z.object({ lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable() }),
});

export async function saveStationAction(id: string | null, input: z.input<typeof stationSchema>) {
  return mutate({
    permission: "masters.stations.manage",
    schema: stationSchema,
    input,
    message: id ? "Station updated" : "Station added",
    run: async ({ tx, user, data, audit }) => {
      if (!user.unitId || isStateLevel(user)) throw new UserError("Switch to a unit role to manage stations.");
      let divisionId = data.divisionId || null;
      if (data.newDivision) {
        const [existing] = await tx.select({ id: divisions.id }).from(divisions).where(and(eq(divisions.unitId, user.unitId), eq(divisions.name, data.newDivision))).limit(1);
        divisionId = existing?.id ?? (await tx.insert(divisions).values({ unitId: user.unitId, name: data.newDivision }).returning({ id: divisions.id }))[0]!.id;
      }
      if (!divisionId) throw new UserError("Choose a division or type a new one.");
      const [div] = await tx.select({ unitId: divisions.unitId }).from(divisions).where(eq(divisions.id, divisionId)).limit(1);
      if (!div) throw new UserError("That division no longer exists.");
      assertUnit(user, div.unitId);
      const cols = { code: data.code, name: data.name, kind: data.kind, divisionId, lat: data.location.lat, lng: data.location.lng };
      if (id) {
        const [before] = await tx.select().from(stations).where(eq(stations.id, id)).limit(1);
        if (!before) throw new UserError("That station no longer exists.");
        assertUnit(user, before.unitId);
        await tx.update(stations).set(cols).where(eq(stations.id, id));
        await audit({ action: "station.update", entity: "station", entityId: id, before, after: cols });
      } else {
        const [m] = await tx.select({ n: stations.displayOrder }).from(stations).where(eq(stations.unitId, user.unitId)).orderBy(stations.displayOrder);
        const [row] = await tx
          .insert(stations)
          .values({ ...cols, unitId: user.unitId, displayOrder: (m?.n ?? 0) + 1000 })
          .returning({ id: stations.id });
        await audit({ action: "station.create", entity: "station", entityId: row!.id, after: cols });
      }
      refresh();
    },
  });
}

export async function deleteStationAction(id: string) {
  return mutate({
    permission: "masters.stations.manage",
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: "Station deleted",
    run: async ({ tx, user, data, audit }) => {
      const [st] = await tx.select().from(stations).where(eq(stations.id, data.id)).limit(1);
      if (!st) throw new UserError("That station no longer exists.");
      assertUnit(user, st.unitId);
      const [p] = await tx.select({ id: persons.id }).from(persons).where(eq(persons.stationId, data.id)).limit(1);
      if (p) throw new UserError("Move or remove this station's officers first.");
      await tx.delete(stations).where(eq(stations.id, data.id));
      await audit({ action: "station.delete", entity: "station", entityId: data.id, before: st });
      refresh();
    },
  });
}

export async function reorderStationsAction(ids: string[]) {
  return mutate({
    permission: "masters.stations.manage",
    schema: z.object({ ids: z.array(z.string().uuid()).min(1) }),
    input: { ids },
    message: "Order saved",
    run: async ({ tx, user, data, audit }) => {
      const rows = await tx.select({ id: stations.id, unitId: stations.unitId }).from(stations).where(inArray(stations.id, data.ids));
      if (rows.length !== data.ids.length) throw new UserError("The list changed. Reload and try again.");
      rows.forEach((r) => assertUnit(user, r.unitId));
      for (const [i, sid] of data.ids.entries()) await tx.update(stations).set({ displayOrder: i + 1 }).where(eq(stations.id, sid));
      await audit({ action: "station.reorder", entity: "station", after: data.ids });
      refresh();
    },
  });
}

/**
 * Make an officer the Office Incharge (SHO) of a station. Creates their login if needed (one-time password)
 * and moves the station's Office Incharge role from the previous holder.
 */
export async function assignInchargeAction(stationId: string, personId: string) {
  return mutate({
    permission: "masters.stations.manage",
    schema: z.object({ stationId: z.string().uuid(), personId: z.string().uuid() }),
    input: { stationId, personId },
    message: "Office Incharge assigned",
    run: async ({ tx, user, data, audit }) => {
      const [st] = await tx.select().from(stations).where(eq(stations.id, data.stationId)).limit(1);
      if (!st) throw new UserError("That station no longer exists.");
      assertUnit(user, st.unitId);
      const [p] = await tx
        .select({ id: persons.id, name: persons.name, unitId: persons.unitId, rank: ranks.code })
        .from(persons)
        .innerJoin(ranks, eq(ranks.id, persons.rankId))
        .where(eq(persons.id, data.personId))
        .limit(1);
      if (!p) throw new UserError("That officer no longer exists.");
      assertUnit(user, p.unitId);

      // Remove the station-scoped OI role from whoever held it.
      await tx.delete(roleAssignments).where(and(eq(roleAssignments.role, "OFFICE_INCHARGE"), eq(roleAssignments.stationId, data.stationId)));

      const login = await ensureLoginForPerson(tx, p.id);
      const tempPassword = login.tempPassword;
      await tx.insert(roleAssignments).values({ userId: login.userId, role: "OFFICE_INCHARGE", unitId: st.unitId, stationId: st.id, createdBy: user.id });
      await tx.update(stations).set({ inchargePersonId: p.id }).where(eq(stations.id, st.id));
      await notifyUser(tx, login.userId, { title: `You are now Office Incharge of ${st.name}`, body: "Force requests for your station will appear under Station → Force requests.", href: "/dashboard", kind: "action" });
      await queueMessage(tx, { template: "oi.assigned", toUserId: login.userId, payload: { station: st.name } });
      await audit({ action: "station.assign_incharge", entity: "station", entityId: st.id, before: { inchargePersonId: st.inchargePersonId }, after: { inchargePersonId: p.id, userCreated: !!tempPassword } });
      refresh();
      return { username: login.username, tempPassword };
    },
  });
}

export async function searchStationPersonsAction(stationId: string, q: string) {
  const user = await requireUser();
  return searchPersons(user, q, { stationId });
}
