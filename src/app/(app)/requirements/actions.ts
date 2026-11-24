"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { UserError, assertUnit } from "@/lib/authz/authorize";
import { forceRequestLines, forceRequests, plans, stations, units } from "@/lib/db/schema";
import { planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { responseStatus } from "@/lib/sourcing/distribute";
import { dgpUsers } from "@/lib/sourcing/escalation";
import { stationIncharges, unitOfficers } from "@/lib/sourcing/server";

type Tx = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"];
type User = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["user"];

async function loadUnitRequest(tx: Tx, user: User, id: string) {
  const [r] = await tx.select().from(forceRequests).where(eq(forceRequests.id, id)).for("update").limit(1);
  if (!r || !r.targetUnitId) throw new UserError("That request no longer exists.");
  assertUnit(user, r.targetUnitId);
  const [plan] = await tx.select().from(plans).where(eq(plans.id, r.planId)).limit(1);
  const [u] = await tx.select({ name: units.name }).from(units).where(eq(units.id, r.targetUnitId)).limit(1);
  return { r, plan: plan!, unitName: u?.name ?? "" };
}

/** Receiving Unit Officer commits what the unit can give (with a reason when short). */
export async function respondUnitAction(requestId: string, input: { lines: { rankId: string; committed: number; reason: string | null }[] }) {
  return mutate({
    permission: "force.respond_unit",
    schema: z.object({ lines: z.array(z.object({ rankId: z.string().uuid(), committed: z.number().int().min(0), reason: z.string().trim().max(200).nullable() })).min(1) }),
    input,
    message: "Reply sent to the requesting unit",
    run: async ({ tx, user, data, audit }) => {
      const { r, plan, unitName } = await loadUnitRequest(tx, user, requestId);
      if (r.status !== "sent") throw new UserError("You've already replied to this request.");
      if (r.deadlineAt < new Date()) throw new UserError("The deadline has passed; the request was auto-accepted at full strength.");
      const lines = await tx.select().from(forceRequestLines).where(eq(forceRequestLines.requestId, r.id));
      const answered = lines.map((l) => {
        const a = data.lines.find((x) => x.rankId === l.rankId);
        if (!a) throw new UserError("Answer every rank.");
        if (a.committed > l.requested) throw new UserError("You can't commit more than requested.");
        if (a.committed < l.requested && !a.reason) throw new UserError("Give a reason for giving fewer men.");
        return { ...l, committed: a.committed, reason: a.committed < l.requested ? a.reason : null };
      });
      for (const l of answered) await tx.update(forceRequestLines).set({ committed: l.committed, reason: l.reason }).where(eq(forceRequestLines.id, l.id));
      const status = responseStatus(answered);
      await tx.update(forceRequests).set({ status, respondedBy: user.id, respondedAt: new Date() }).where(eq(forceRequests.id, r.id));
      const req = answered.reduce((a, l) => a + l.requested, 0);
      const com = answered.reduce((a, l) => a + l.committed, 0);
      await planEvent(tx, plan.id, user.id, "unit_replied", `${unitName}: ${com} of ${req} men committed`);
      for (const u of [...(await unitOfficers(tx, plan.unitId)), ...(await dgpUsers(tx))]) await notifyUser(tx, u, { title: `${unitName} replied: ${com} of ${req}`, body: plan.title, href: `/plans/${plan.id}/sourcing`, kind: status === "committed" ? "info" : "action" });
      await audit({ action: "force.respond_unit", entity: "force_request", entityId: r.id, after: data });
      refresh();
      return { status };
    },
  });
}

/** The receiving unit asks its own stations for the men it committed; their names flow into the requesting plan. */
export async function distributeOwnStationsAction(requestId: string, input: { deadlineAt: string; grid: { stationId: string; lines: { rankId: string; requested: number }[] }[] }) {
  return mutate({
    permission: "force.respond_unit",
    schema: z.object({
      deadlineAt: z.string().datetime({ offset: true }),
      grid: z.array(z.object({ stationId: z.string().uuid(), lines: z.array(z.object({ rankId: z.string().uuid(), requested: z.number().int().min(0).max(5000) })) })).max(300),
    }),
    input,
    message: "Requests sent to your stations",
    run: async ({ tx, user, data, audit }) => {
      const { r, plan, unitName } = await loadUnitRequest(tx, user, requestId);
      const effective = r.status === "sent" && r.deadlineAt < new Date() ? "auto_accepted" : r.status;
      if (!["committed", "partial", "auto_accepted"].includes(effective)) throw new UserError("Reply with what your unit can give first.");
      if (!["sourcing", "placement"].includes(plan.status)) throw new UserError("The requesting plan no longer takes men.");
      const lines = await tx.select().from(forceRequestLines).where(eq(forceRequestLines.requestId, r.id));
      const grid = data.grid.map((g) => ({ ...g, lines: g.lines.filter((l) => l.requested > 0) })).filter((g) => g.lines.length);
      if (!grid.length) throw new UserError("Enter how many men each station should send.");
      const sts = await tx.select({ id: stations.id, unitId: stations.unitId, name: stations.name }).from(stations).where(inArray(stations.id, grid.map((g) => g.stationId)));
      if (sts.length !== grid.length || sts.some((s) => s.unitId !== r.targetUnitId)) throw new UserError("Choose stations of your unit.");
      // Already distributed (not withdrawn) + this round must stay within what the unit committed.
      const children = await tx.select({ id: forceRequests.id }).from(forceRequests).where(and(eq(forceRequests.parentRequestId, r.id), ne(forceRequests.status, "cancelled")));
      const already = children.length ? await tx.select().from(forceRequestLines).where(inArray(forceRequestLines.requestId, children.map((c) => c.id))) : [];
      for (const l of lines) {
        const limit = l.committed ?? (effective === "auto_accepted" ? l.requested : 0);
        const sum = already.filter((a) => a.rankId === l.rankId).reduce((a, x) => a + x.requested, 0) + grid.reduce((a, g) => a + (g.lines.find((x) => x.rankId === l.rankId)?.requested ?? 0), 0);
        if (sum > limit) throw new UserError(`You committed ${limit} for one rank; that would ask your stations for ${sum}.`);
      }
      if (grid.some((g) => g.lines.some((l) => !lines.some((x) => x.rankId === l.rankId)))) throw new UserError("Only the ranks that were requested can be distributed.");
      if (effective === "auto_accepted" && r.status === "sent") {
        await tx.update(forceRequests).set({ status: "auto_accepted", respondedAt: new Date() }).where(eq(forceRequests.id, r.id));
        for (const l of lines) await tx.update(forceRequestLines).set({ committed: l.requested }).where(eq(forceRequestLines.id, l.id));
      }
      const deadline = new Date(data.deadlineAt);
      for (const g of grid) {
        const [c] = await tx.insert(forceRequests).values({ planId: plan.id, round: r.round, kind: "initial", targetStationId: g.stationId, parentRequestId: r.id, deadlineAt: deadline, sentBy: user.id, note: `On behalf of ${plan.title}` }).returning({ id: forceRequests.id });
        await tx.insert(forceRequestLines).values(g.lines.map((l) => ({ requestId: c!.id, rankId: l.rankId, requested: l.requested })));
        const n = g.lines.reduce((a, l) => a + l.requested, 0);
        for (const u of await stationIncharges(tx, g.stationId)) {
          await notifyUser(tx, u, { title: `Force request: ${n} men for ${plan.title} (another district)`, body: "Commit what you can and name the officers.", href: `/station/requests/${c!.id}`, kind: "action" });
          await queueMessage(tx, { template: "force.request", toUserId: u, payload: { plan: plan.title, men: n } });
        }
      }
      await planEvent(tx, plan.id, user.id, "unit_distributed", `${unitName} asked ${grid.length} of its stations`);
      await audit({ action: "force.unit_distribute", entity: "force_request", entityId: r.id, after: data });
      refresh();
    },
  });
}
