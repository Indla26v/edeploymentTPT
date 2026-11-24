"use server";

import { refresh } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { UserError, assertStation } from "@/lib/authz/authorize";
import { forceRequestLines, forceRequests, persons, planPersonnel, plans, preferences, ranks, stations } from "@/lib/db/schema";
import { planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser } from "@/lib/server/notify";
import { responseStatus } from "@/lib/sourcing/distribute";
import { planRange, unitOfficers } from "@/lib/sourcing/server";

async function loadRequest(tx: Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"], user: Parameters<Parameters<typeof mutate>[0]["run"]>[0]["user"], id: string) {
  const [r] = await tx.select().from(forceRequests).where(eq(forceRequests.id, id)).for("update").limit(1);
  if (!r || !r.targetStationId) throw new UserError("That request no longer exists.");
  const [st] = await tx.select({ unitId: stations.unitId, name: stations.name }).from(stations).where(eq(stations.id, r.targetStationId)).limit(1);
  assertStation(user, r.targetStationId, st!.unitId);
  const [plan] = await tx.select().from(plans).where(eq(plans.id, r.planId)).limit(1);
  return { r, plan: plan!, stationName: st!.name };
}

const respondSchema = z
  .object({
    lines: z.array(z.object({ rankId: z.string().uuid(), committed: z.number().int().min(0), reason: z.string().trim().max(200).nullable() })).min(1),
    shortReason: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .transform((v) => v || null),
  });
export type RespondInput = z.input<typeof respondSchema>;

/** Office Incharge commits men per rank (with a reason when short). The plan is never re-applied. */
export async function respondAction(requestId: string, input: RespondInput) {
  return mutate({
    permission: "force.respond",
    schema: respondSchema,
    input,
    message: "Reply sent to the Unit Officer",
    run: async ({ tx, user, data, audit }) => {
      const { r, plan, stationName } = await loadRequest(tx, user, requestId);
      if (r.status !== "sent") throw new UserError(r.status === "cancelled" ? "This request was withdrawn." : "You've already replied to this request.");
      if (r.deadlineAt < new Date()) throw new UserError("The deadline has passed; the request was auto-accepted at full strength. Name your officers.");
      const lines = await tx.select().from(forceRequestLines).where(eq(forceRequestLines.requestId, r.id));
      const answered = lines.map((l) => {
        const a = data.lines.find((x) => x.rankId === l.rankId);
        if (!a) throw new UserError("Answer every rank.");
        if (a.committed > l.requested) throw new UserError("You can't commit more than requested.");
        if (a.committed < l.requested && !a.reason && !data.shortReason) throw new UserError("Give a reason for giving fewer men.");
        return { ...l, committed: a.committed, reason: a.committed < l.requested ? (a.reason ?? data.shortReason) : null };
      });
      for (const l of answered) await tx.update(forceRequestLines).set({ committed: l.committed, reason: l.reason }).where(eq(forceRequestLines.id, l.id));
      const status = responseStatus(answered);
      await tx.update(forceRequests).set({ status, shortReason: data.shortReason, respondedBy: user.id, respondedAt: new Date() }).where(eq(forceRequests.id, r.id));
      const req = answered.reduce((a, l) => a + l.requested, 0);
      const com = answered.reduce((a, l) => a + l.committed, 0);
      await planEvent(tx, plan.id, user.id, "station_replied", `${stationName}: ${com} of ${req} men committed${status === "partial" ? " (short)" : ""}`);
      for (const u of await unitOfficers(tx, plan.unitId)) {
        await notifyUser(tx, u, { title: `${stationName} replied: ${com} of ${req}`, body: status === "committed" ? plan.title : `${plan.title} — short by ${req - com}. Accept the shortfall or top up.`, href: `/plans/${plan.id}/sourcing`, kind: status === "committed" ? "info" : "action" });
      }
      await audit({ action: "force.respond", entity: "force_request", entityId: r.id, after: { status, lines: data.lines } });
      refresh();
      return { status };
    },
  });
}

/**
 * The nominal roll: which officers the station sends. Editable until the plan is published.
 * Preferred officers (asked for by a CO) can't be left out while their rank is committed.
 */
export async function saveRollAction(requestId: string, personIds: string[]) {
  return mutate({
    permission: "force.respond",
    schema: z.object({ personIds: z.array(z.string().uuid()).max(2000) }),
    input: { personIds },
    message: "Nominal roll sent",
    run: async ({ tx, user, data, audit }) => {
      const { r, plan, stationName } = await loadRequest(tx, user, requestId);
      const effective = r.status === "sent" && r.deadlineAt < new Date() ? "auto_accepted" : r.status;
      if (!["committed", "partial", "auto_accepted"].includes(effective)) throw new UserError(effective === "sent" ? "Reply with the numbers you can give first." : "This request isn't open for names.");
      if (!["sourcing", "placement"].includes(plan.status)) throw new UserError("Names can't change after the duty allocation is published.");
      const lines = await tx.select().from(forceRequestLines).where(eq(forceRequestLines.requestId, r.id));
      const ids = [...new Set(data.personIds)];
      const ps = ids.length
        ? await tx.select({ id: persons.id, name: persons.name, stationId: persons.stationId, rankId: persons.rankId, isActive: persons.isActive, rank: ranks.code }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId)).where(inArray(persons.id, ids))
        : [];
      if (ps.length !== ids.length || ps.some((p) => p.stationId !== r.targetStationId || !p.isActive)) throw new UserError("Name only active officers of your station.");
      for (const l of lines) {
        const limit = l.committed ?? (effective === "auto_accepted" ? l.requested : 0);
        const n = ps.filter((p) => p.rankId === l.rankId).length;
        if (n > limit) {
          const code = ps.find((p) => p.rankId === l.rankId)?.rank ?? "this rank";
          throw new UserError(`You committed ${limit} ${code}; ${n} named.`);
        }
      }
      if (ps.some((p) => !lines.some((l) => l.rankId === p.rankId))) throw new UserError("Name officers only of the ranks requested.");
      // Preferred officers stay on the roll.
      const preferred = await tx
        .select({ personId: preferences.personId, name: persons.name, rankId: persons.rankId })
        .from(preferences)
        .innerJoin(persons, eq(persons.id, preferences.personId))
        .where(and(eq(preferences.planId, plan.id), eq(preferences.status, "active"), eq(persons.stationId, r.targetStationId!)));
      for (const p of preferred) {
        const line = lines.find((l) => l.rankId === p.rankId);
        const committed = line ? (line.committed ?? (effective === "auto_accepted" ? line.requested : 0)) : 0;
        if (committed > 0 && !ids.includes(p.personId!)) throw new UserError(`${p.name} was asked for by name — keep them on the roll.`);
      }
      const range = await planRange(tx, plan.id);
      if (!range) throw new UserError("The plan has no duty dates.");
      // Clear message before the database's no-double-booking constraint would fire.
      if (ids.length) {
        const clash = await tx.execute<{ name: string; title: string }>(sql`
          select p.name, pl.title from plan_personnel pp join persons p on p.id = pp.person_id join plans pl on pl.id = pp.plan_id
          where pp.person_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) and pp.plan_id <> ${plan.id} and pp.duty_window && ${range.range}::tstzrange limit 1`);
        if (clash.rows[0]) throw new UserError(`${clash.rows[0].name} is already on “${clash.rows[0].title}” at the same time.`);
        const other = await tx.select({ personId: planPersonnel.personId }).from(planPersonnel).where(and(eq(planPersonnel.planId, plan.id), ne(planPersonnel.requestId, r.id), inArray(planPersonnel.personId, ids))).limit(1);
        if (other.length) throw new UserError("One of these officers is already named for this plan by another request.");
      }
      await tx.delete(planPersonnel).where(eq(planPersonnel.requestId, r.id));
      if (ps.length) {
        await tx.insert(planPersonnel).values(
          ps.map((p) => ({ planId: plan.id, personId: p.id, requestId: r.id, stationId: r.targetStationId!, rankId: p.rankId, dutyWindow: range.range, source: preferred.some((x) => x.personId === p.id) ? ("preference" as const) : ("nominal_roll" as const), addedBy: user.id })),
        );
      }
      const first = !r.rollSentAt;
      await tx.update(forceRequests).set({ rollSentAt: new Date(), ...(effective === "auto_accepted" && r.status === "sent" ? { status: "auto_accepted" as const } : {}) }).where(eq(forceRequests.id, r.id));
      if (effective === "auto_accepted" && r.status === "sent") await tx.update(forceRequestLines).set({ committed: sql`${forceRequestLines.requested}` }).where(eq(forceRequestLines.requestId, r.id));
      await planEvent(tx, plan.id, user.id, "roll", `${stationName}: nominal roll ${first ? "sent" : "updated"} (${ps.length} officers)`);
      if (first) for (const u of await unitOfficers(tx, plan.unitId)) await notifyUser(tx, u, { title: `Nominal roll from ${stationName}`, body: `${ps.length} officers named for ${plan.title}.`, href: `/plans/${plan.id}/sourcing`, kind: "info" });
      await audit({ action: "force.roll", entity: "force_request", entityId: r.id, after: { personIds: ids } });
      refresh();
      return { named: ps.length };
    },
  });
}
