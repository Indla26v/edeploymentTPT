"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, max } from "drizzle-orm";
import { z } from "zod";

import { UserError } from "@/lib/authz/authorize";
import { escalationLines, escalations, forceRequestLines, forceRequests, plans, shortfallAcceptances, stations } from "@/lib/db/schema";
import { dgpUsers } from "@/lib/sourcing/escalation";
import { loadPlan, planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { clampShortfallAcceptance, ledgerTotals } from "@/lib/sourcing/ledger";
import { autoAcceptDue, planLeads, planLedger, stationIncharges } from "@/lib/sourcing/server";
import { fmtDateTime } from "@/lib/format";

const sendSchema = z.object({
  deadlineAt: z
    .string()
    .datetime({ offset: true, message: "Set a reply deadline" })
    .refine((v) => new Date(v).getTime() > Date.now() + 10 * 60e3, "The deadline must be at least 10 minutes from now"),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((v) => v || null),
  kind: z.enum(["initial", "top_up"]),
  grid: z
    .array(z.object({ stationId: z.string().uuid(), lines: z.array(z.object({ rankId: z.string().uuid(), requested: z.number().int().min(0).max(5000) })) }))
    .max(500),
});
export type SendRequestsInput = z.input<typeof sendSchema>;

/**
 * Send a round of force requests (the initial distribution, or a top-up). Each station gets one request
 * with a line per rank. Can be sent with a gap — the ledger settles the rest.
 */
export async function sendRequestsAction(planId: string, input: SendRequestsInput) {
  return mutate({
    permission: "force.distribute",
    schema: sendSchema,
    input,
    message: input.kind === "top_up" ? "Top-up requests sent" : "Requests sent to stations",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (plan.status !== "sourcing") throw new UserError("Force can be requested only while the plan is in sourcing.");
      const grid = data.grid.map((g) => ({ ...g, lines: g.lines.filter((l) => l.requested > 0) })).filter((g) => g.lines.length);
      if (grid.length === 0) throw new UserError("Enter how many men to ask for from at least one station.");
      const sts = await tx.select({ id: stations.id, unitId: stations.unitId, name: stations.name }).from(stations).where(inArray(stations.id, grid.map((g) => g.stationId)));
      if (sts.length !== grid.length || sts.some((s) => s.unitId !== plan.unitId)) throw new UserError("Choose stations of this unit.");
      const [{ round } = { round: 0 }] = await tx.select({ round: max(forceRequests.round) }).from(forceRequests).where(eq(forceRequests.planId, plan.id));
      const next = (round ?? 0) + 1;
      const deadline = new Date(data.deadlineAt);
      let men = 0;
      for (const g of grid) {
        const [r] = await tx
          .insert(forceRequests)
          .values({ planId: plan.id, round: next, kind: data.kind, targetStationId: g.stationId, deadlineAt: deadline, note: data.note, sentBy: user.id })
          .returning({ id: forceRequests.id });
        await tx.insert(forceRequestLines).values(g.lines.map((l) => ({ requestId: r!.id, rankId: l.rankId, requested: l.requested })));
        const total = g.lines.reduce((a, l) => a + l.requested, 0);
        men += total;
        for (const u of await stationIncharges(tx, g.stationId)) {
          await notifyUser(tx, u, { title: `${data.kind === "top_up" ? "Top-up" : "Force"} request: ${total} men for ${plan.title}`, body: `Reply by ${fmtDateTime(deadline)}. Commit what you can and name the officers.`, href: `/station/requests/${r!.id}`, kind: "action" });
          await queueMessage(tx, { template: "force.request", toUserId: u, payload: { plan: plan.title, men: total, deadline: deadline.toISOString() } });
        }
      }
      await planEvent(tx, plan.id, user.id, data.kind === "top_up" ? "top_up" : "requests_sent", `${data.kind === "top_up" ? "Top-up" : "Round " + next}: ${men} men requested from ${grid.length} station${grid.length > 1 ? "s" : ""}`);
      await audit({ action: data.kind === "top_up" ? "force.top_up" : "force.distribute", entity: "plan", entityId: plan.id, after: { round: next, men, stations: grid.length } });
      refresh();
      return { round: next, men };
    },
  });
}

/** "Proceed with the strength we got" for one rank. Recorded with a reason; IO / COs are only informed. */
export async function acceptShortfallAction(planId: string, input: { rankId: string; count: number; reason: string }) {
  return mutate({
    permission: "force.accept_shortfall",
    schema: z.object({ rankId: z.string().uuid(), count: z.number().int().min(1), reason: z.string().trim().min(3, "Give a reason").max(300) }),
    input,
    message: "Shortfall accepted — the plan continues",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (plan.status !== "sourcing") throw new UserError("Shortfalls are settled while the plan is in sourcing.");
      const row = (await planLedger(tx, plan.id)).find((r) => r.rankId === data.rankId);
      if (!row) throw new UserError("That rank isn't required in this plan.");
      const n = clampShortfallAcceptance(row, data.count);
      if (n === 0) throw new UserError(`Nothing to accept — ${row.rankCode} has no gap.`);
      await tx.insert(shortfallAcceptances).values({ planId: plan.id, rankId: data.rankId, count: n, reason: data.reason, acceptedBy: user.id });
      await planEvent(tx, plan.id, user.id, "shortfall_accepted", `Accepted ${n} ${row.rankCode} short (${data.reason}) — continuing with ${row.committed}`);
      for (const u of await planLeads(tx, plan.id)) await notifyUser(tx, u, { title: `${plan.title}: continuing with fewer ${row.rankCode}`, body: `${n} ${row.rankCode} short accepted by the Unit Officer. Leave the lowest-priority points short in placement.`, href: `/plans/${plan.id}`, kind: "info" });
      await audit({ action: "force.accept_shortfall", entity: "plan", entityId: plan.id, after: { rank: row.rankCode, count: n, reason: data.reason } });
      refresh();
      return { accepted: n };
    },
  });
}

export async function cancelRequestAction(requestId: string) {
  return mutate({
    permission: "force.distribute",
    schema: z.object({ id: z.string().uuid() }),
    input: { id: requestId },
    message: "Request withdrawn",
    run: async ({ tx, user, data, audit }) => {
      const [r] = await tx.select().from(forceRequests).where(eq(forceRequests.id, data.id)).for("update").limit(1);
      if (!r) throw new UserError("That request no longer exists.");
      const plan = await loadPlan(tx, user, r.planId);
      if (r.status !== "sent" || r.deadlineAt < new Date()) throw new UserError("Only requests still awaiting a reply can be withdrawn.");
      await tx.update(forceRequests).set({ status: "cancelled" }).where(eq(forceRequests.id, r.id));
      if (r.targetStationId) for (const u of await stationIncharges(tx, r.targetStationId)) await notifyUser(tx, u, { title: `Request withdrawn: ${plan.title}`, kind: "info", href: "/station/requests" });
      await planEvent(tx, plan.id, user.id, "request_cancelled", "A pending request was withdrawn");
      await audit({ action: "force.cancel_request", entity: "force_request", entityId: r.id });
      refresh();
    },
  });
}

/** All ranks settled (gap 0) and no replies pending → the plan moves to placement. */
export async function proceedToPlacementAction(planId: string) {
  return mutate({
    permission: "force.distribute",
    schema: z.object({}),
    input: {},
    message: "Moved to placement",
    run: async ({ tx, user, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (plan.status !== "sourcing") throw new UserError("The plan isn't in sourcing.");
      await autoAcceptDue(tx);
      const ledger = await planLedger(tx, plan.id);
      const t = ledgerTotals(ledger);
      const open = ledger.filter((r) => r.gap > 0);
      if (open.length) throw new UserError(`Settle the gap first: ${open.map((r) => `${r.rankCode} short by ${r.gap}`).join(", ")}. Accept the shortfall or top up.`);
      const pending = ledger.reduce((a, r) => a + r.outstanding, 0);
      if (pending) throw new UserError(`${pending} men are still awaiting a station's reply. Wait for the reply or withdraw the request.`);
      await tx.update(plans).set({ status: "placement" }).where(eq(plans.id, plan.id));
      await planEvent(tx, plan.id, user.id, "placement", `Sourcing closed: ${t.committed} of ${t.required} men committed${t.acceptedShortfall ? `, ${t.acceptedShortfall} short accepted` : ""}`);
      for (const u of await planLeads(tx, plan.id)) await notifyUser(tx, u, { title: `${plan.title} is ready for placement`, body: "Place officers on points, then the IO publishes.", href: `/plans/${plan.id}`, kind: "action" });
      await audit({ action: "plan.to_placement", entity: "plan", entityId: plan.id, after: t });
      refresh();
    },
  });
}


/**
 * "Send to Chief Office": what the unit's stations couldn't give (gap not covered by pending replies)
 * goes to the DGP, who distributes it across other units. The plan keeps going meanwhile.
 */
export async function escalateAction(planId: string, input: { note: string | null; deadlineAt: string }) {
  return mutate({
    permission: "force.escalate",
    schema: z.object({ note: z.string().trim().max(500).nullable().transform((v) => v || null), deadlineAt: z.string().datetime({ offset: true }) }),
    input,
    message: "Sent to the Chief Office",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (plan.status !== "sourcing") throw new UserError("Only plans in force sourcing can be escalated.");
      const [open] = await tx.select({ id: escalations.id }).from(escalations).where(and(eq(escalations.planId, plan.id), eq(escalations.status, "open"))).limit(1);
      if (open) throw new UserError("This plan already has a request with the Chief Office.");
      const gap = (await planLedger(tx, plan.id)).map((r) => ({ rankId: r.rankId, code: r.rankCode, n: Math.max(0, r.gap - r.outstanding) })).filter((r) => r.n > 0);
      if (gap.length === 0) throw new UserError("Nothing to escalate — no rank is short.");
      const [e] = await tx.insert(escalations).values({ planId: plan.id, fromUnitId: plan.unitId, note: data.note, deadlineAt: new Date(data.deadlineAt), createdBy: user.id }).returning({ id: escalations.id });
      await tx.insert(escalationLines).values(gap.map((g) => ({ escalationId: e!.id, rankId: g.rankId, requested: g.n })));
      const men = gap.reduce((a, g) => a + g.n, 0);
      for (const u of await dgpUsers(tx)) await notifyUser(tx, u, { title: `Force needed from other units: ${plan.title}`, body: gap.map((g) => `${g.code} ${g.n}`).join(", "), href: `/dgp/requirements/${e!.id}`, kind: "action" });
      await planEvent(tx, plan.id, user.id, "escalated", `Sent ${men} men to the Chief Office (${gap.map((g) => `${g.code} ${g.n}`).join(", ")})`);
      await audit({ action: "force.escalate", entity: "plan", entityId: plan.id, after: { gap, note: data.note } });
      refresh();
      return { men };
    },
  });
}
