"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { persons, roleAssignments, stations, transferRequests, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { UserError, assertStation, assertUnit } from "@/lib/authz/authorize";
import { searchPersons } from "@/lib/queries/persons";
import { mutate } from "@/lib/server/mutate";
import { notifyUser } from "@/lib/server/notify";

const requestSchema = z.object({
  personId: z.string().uuid("Choose the officer"),
  toStationId: z.string().uuid("Choose the new station"),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

/** Office Incharge (or Unit Officer) raises a transfer of an officer to another station. */
export async function requestTransferAction(input: z.input<typeof requestSchema>) {
  return mutate({
    permission: "transfers.request",
    schema: requestSchema,
    input,
    message: "Transfer requested — the Unit Officer will review it",
    run: async ({ tx, user, data, audit }) => {
      const [p] = await tx.select({ id: persons.id, name: persons.name, unitId: persons.unitId, stationId: persons.stationId }).from(persons).where(eq(persons.id, data.personId)).limit(1);
      if (!p) throw new UserError("That officer no longer exists.");
      assertStation(user, p.stationId, p.unitId);
      if (p.stationId === data.toStationId) throw new UserError("The officer is already at that station.");
      const [to] = await tx.select({ unitId: stations.unitId, name: stations.name }).from(stations).where(eq(stations.id, data.toStationId)).limit(1);
      if (!to || to.unitId !== p.unitId) throw new UserError("Transfers are within the same unit.");
      const [open] = await tx.select({ id: transferRequests.id }).from(transferRequests).where(and(eq(transferRequests.personId, p.id), eq(transferRequests.status, "pending"))).limit(1);
      if (open) throw new UserError("This officer already has a pending transfer request.");
      const [row] = await tx
        .insert(transferRequests)
        .values({ unitId: p.unitId, personId: p.id, fromStationId: p.stationId, toStationId: data.toStationId, reason: data.reason, requestedBy: user.id })
        .returning({ id: transferRequests.id });
      // Tell the unit's Unit Officers.
      const uos = await tx.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.role, "UNIT_OFFICER"), eq(roleAssignments.unitId, p.unitId)));
      for (const u of uos) await notifyUser(tx, u.userId, { title: `Transfer request: ${p.name} → ${to.name}`, body: data.reason, href: "/masters/transfers", kind: "action" });
      await audit({ action: "transfer.request", entity: "transfer_request", entityId: row!.id, after: data });
      refresh();
    },
  });
}

/** Unit Officer approves (the officer's station changes) or rejects a pending transfer. */
export async function decideTransferAction(id: string, decision: "approved" | "rejected") {
  return mutate({
    permission: "transfers.approve",
    schema: z.object({ id: z.string().uuid(), decision: z.enum(["approved", "rejected"]) }),
    input: { id, decision },
    message: decision === "approved" ? "Transfer approved — the officer's station is updated" : "Transfer rejected",
    run: async ({ tx, user, data, audit }) => {
      const [t] = await tx.select().from(transferRequests).where(eq(transferRequests.id, data.id)).for("update").limit(1);
      if (!t) throw new UserError("That request no longer exists.");
      assertUnit(user, t.unitId);
      if (t.status !== "pending") throw new UserError("This request was already decided.");
      if (data.decision === "approved") {
        const [p] = await tx.select({ stationId: persons.stationId, name: persons.name }).from(persons).where(eq(persons.id, t.personId)).limit(1);
        if (!p) throw new UserError("That officer no longer exists.");
        if (p.stationId !== t.fromStationId) throw new UserError("The officer has moved since this request. Reject it and raise a new one.");
        const [isIncharge] = await tx.select({ id: stations.id }).from(stations).where(eq(stations.inchargePersonId, t.personId)).limit(1);
        if (isIncharge) throw new UserError("This officer is an Office Incharge. Assign a new Office Incharge for their station first.");
        await tx.update(persons).set({ stationId: t.toStationId }).where(eq(persons.id, t.personId));
      }
      await tx.update(transferRequests).set({ status: data.decision, decidedBy: user.id, decidedAt: new Date() }).where(eq(transferRequests.id, t.id));
      if (t.requestedBy && t.requestedBy !== user.id) {
        const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, t.requestedBy)).limit(1);
        if (u) await notifyUser(tx, u.id, { title: `Transfer ${data.decision}`, body: undefined, href: "/masters/transfers", kind: data.decision === "approved" ? "success" : "alert" });
      }
      await audit({ action: `transfer.${data.decision === "approved" ? "approve" : "reject"}`, entity: "transfer_request", entityId: t.id, before: { status: t.status }, after: { status: data.decision } });
      refresh();
    },
  });
}

export async function searchTransferablePersonsAction(q: string) {
  const user = await requireUser();
  return searchPersons(user, q);
}
