"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";

import { UserError } from "@/lib/authz/authorize";
import { escalationLines, escalations, forceRequestLines, forceRequests, plans, ranks, units } from "@/lib/db/schema";
import { planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { unitOfficers } from "@/lib/sourcing/server";

/** DGP sends the escalated gap to other units (one request per unit, a line per rank). */
export async function distributeToUnitsAction(escalationId: string, input: { deadlineAt: string; grid: { unitId: string; lines: { rankId: string; requested: number }[] }[] }) {
  return mutate({
    permission: "dgp.distribute",
    schema: z.object({
      deadlineAt: z.string().datetime({ offset: true }).refine((v) => new Date(v).getTime() > Date.now() + 10 * 60e3, "The deadline must be at least 10 minutes from now"),
      grid: z.array(z.object({ unitId: z.string().uuid(), lines: z.array(z.object({ rankId: z.string().uuid(), requested: z.number().int().min(0).max(5000) })) })).max(100),
    }),
    input,
    message: "Sent to the units",
    run: async ({ tx, user, data, audit }) => {
      const [e] = await tx.select().from(escalations).where(eq(escalations.id, escalationId)).for("update").limit(1);
      if (!e) throw new UserError("That request no longer exists.");
      if (e.status !== "open") throw new UserError("This request was already distributed.");
      const lines = await tx.select().from(escalationLines).where(eq(escalationLines.escalationId, e.id));
      const grid = data.grid.map((g) => ({ ...g, lines: g.lines.filter((l) => l.requested > 0) })).filter((g) => g.lines.length);
      if (!grid.length) throw new UserError("Enter how many men each unit should send.");
      if (grid.some((g) => g.unitId === e.fromUnitId)) throw new UserError("Choose units other than the requesting one.");
      for (const l of lines) {
        const sum = grid.reduce((a, g) => a + (g.lines.find((x) => x.rankId === l.rankId)?.requested ?? 0), 0);
        if (sum > l.requested) throw new UserError("You can't ask for more than the unit requested.");
      }
      if (grid.some((g) => g.lines.some((l) => !lines.some((x) => x.rankId === l.rankId)))) throw new UserError("Only the ranks that were requested can be distributed.");
      const [plan] = await tx.select().from(plans).where(eq(plans.id, e.planId)).limit(1);
      if (!plan || plan.status !== "sourcing") throw new UserError("The plan is no longer in force sourcing.");
      const us = await tx.select({ id: units.id, name: units.name }).from(units).where(inArray(units.id, grid.map((g) => g.unitId)));
      if (us.length !== grid.length) throw new UserError("Unknown unit.");
      const [{ round } = { round: 0 }] = await tx.select({ round: max(forceRequests.round) }).from(forceRequests).where(eq(forceRequests.planId, plan.id));
      const deadline = new Date(data.deadlineAt);
      let men = 0;
      for (const g of grid) {
        const [r] = await tx.insert(forceRequests).values({ planId: plan.id, round: (round ?? 0) + 1, kind: "top_up", targetUnitId: g.unitId, escalationId: e.id, deadlineAt: deadline, sentBy: user.id, note: e.note }).returning({ id: forceRequests.id });
        await tx.insert(forceRequestLines).values(g.lines.map((l) => ({ requestId: r!.id, rankId: l.rankId, requested: l.requested })));
        const n = g.lines.reduce((a, l) => a + l.requested, 0);
        men += n;
        for (const u of await unitOfficers(tx, g.unitId)) {
          await notifyUser(tx, u, { title: `Chief Office: send ${n} men for ${plan.title}`, body: "Commit what your unit can give and distribute to your stations.", href: `/requirements/incoming/${r!.id}`, kind: "action" });
          await queueMessage(tx, { template: "force.unit_request", toUserId: u, payload: { plan: plan.title, men: n } });
        }
      }
      await tx.update(escalations).set({ status: "distributed", distributedAt: new Date(), distributedBy: user.id }).where(eq(escalations.id, e.id));
      const codes = await tx.select({ id: ranks.id, code: ranks.code }).from(ranks);
      await planEvent(tx, plan.id, user.id, "dgp_distributed", `Chief Office asked ${us.map((u) => u.name).join(", ")} for ${men} men`, { grid: grid.map((g) => ({ unit: us.find((u) => u.id === g.unitId)?.name, lines: g.lines.map((l) => `${codes.find((c) => c.id === l.rankId)?.code} ${l.requested}`) })) });
      for (const u of await unitOfficers(tx, plan.unitId)) await notifyUser(tx, u, { title: `Chief Office distributed your request: ${plan.title}`, body: `${men} men asked from ${us.length} unit${us.length > 1 ? "s" : ""}.`, href: `/plans/${plan.id}/sourcing`, kind: "info" });
      await audit({ action: "dgp.distribute", entity: "escalation", entityId: e.id, after: data });
      refresh();
      return { men, units: us.length };
    },
  });
}

/** Close an escalation without (more) distribution. */
export async function closeEscalationAction(escalationId: string) {
  return mutate({
    permission: "dgp.distribute",
    schema: z.object({}),
    input: {},
    message: "Request closed",
    run: async ({ tx, audit }) => {
      const [e] = await tx.update(escalations).set({ status: "closed" }).where(and(eq(escalations.id, escalationId))).returning();
      if (!e) throw new UserError("That request no longer exists.");
      for (const u of await unitOfficers(tx, e.fromUnitId)) await notifyUser(tx, u, { title: "Chief Office closed your force request", href: `/plans/${e.planId}/sourcing`, kind: "info" });
      await audit({ action: "dgp.close", entity: "escalation", entityId: e.id });
      refresh();
    },
  });
}
