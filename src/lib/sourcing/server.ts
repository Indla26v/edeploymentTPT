import "server-only";

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import { forceRequestLines, forceRequests, notificationsOutbox, planComponents, planWindows, plans, ranks, roleAssignments, shortfallAcceptances, slots } from "../db/schema";
import { notifyUser } from "../server/notify";
import { computeLedgerRow, type RankLedgerRow } from "./ledger";

export type LedgerRow = RankLedgerRow & { rankId: string; outstanding: number };

/** The plan's overall duty window as a Postgres tstzrange literal "[start,end)", or null without dates. */
export async function planRange(db: DbOrTx, planId: string): Promise<{ start: Date; end: Date; range: string } | null> {
  const [w] = await db
    .select({ start: sql<string | null>`min(${planWindows.startsAt})`, end: sql<string | null>`max(${planWindows.endsAt})` })
    .from(planWindows)
    .where(eq(planWindows.planId, planId));
  if (!w?.start || !w.end) return null;
  const start = new Date(w.start);
  const end = new Date(w.end);
  return { start, end, range: `[${start.toISOString()},${end.toISOString()})` };
}

/**
 * Per-rank ledger of a plan: required (slots) vs requested / committed / named / accepted short.
 * Unanswered requests whose deadline passed count as auto-accepted (lazy evaluation).
 */
export async function planLedger(db: DbOrTx, planId: string, now = new Date()): Promise<LedgerRow[]> {
  // Sequential on purpose: `db` may be a transaction (one connection — no concurrent queries).
  const req = await db.select({ rankId: slots.rankId, n: sql<number>`count(*)`.mapWith(Number) }).from(slots).where(eq(slots.planId, planId)).groupBy(slots.rankId);
  const lines = await db
      .select({ rankId: forceRequestLines.rankId, requested: forceRequestLines.requested, committed: forceRequestLines.committed, status: forceRequests.status, kind: forceRequests.kind, deadlineAt: forceRequests.deadlineAt })
      .from(forceRequestLines)
      .innerJoin(forceRequests, eq(forceRequests.id, forceRequestLines.requestId))
      .where(eq(forceRequests.planId, planId));
  const named = await db.execute<{ rank_id: string; n: number }>(sql`select rank_id, count(*)::int n from plan_personnel where plan_id = ${planId} group by rank_id`);
  const accepted = await db.select({ rankId: shortfallAcceptances.rankId, n: sql<number>`sum(${shortfallAcceptances.count})`.mapWith(Number) }).from(shortfallAcceptances).where(eq(shortfallAcceptances.planId, planId)).groupBy(shortfallAcceptances.rankId);
  const rankIds = new Set([...req.map((r) => r.rankId), ...lines.map((l) => l.rankId)]);
  const codes = rankIds.size ? await db.select({ id: ranks.id, code: ranks.code, seniority: ranks.seniority }).from(ranks).where(inArray(ranks.id, [...rankIds])) : [];
  codes.sort((a, b) => a.seniority - b.seniority);
  return codes.map(({ id, code }) => {
    let requested = 0;
    let committed = 0;
    let pendingTopUp = 0;
    let outstanding = 0;
    for (const l of lines.filter((x) => x.rankId === id)) {
      if (l.status === "cancelled") continue;
      requested += l.requested;
      const due = l.status === "sent" && l.deadlineAt < now;
      if (l.status === "sent" && !due) {
        outstanding += l.requested;
        if (l.kind === "top_up") pendingTopUp += l.requested;
      } else committed += l.status === "auto_accepted" || due ? (l.committed ?? l.requested) : (l.committed ?? 0);
    }
    const row = computeLedgerRow({
      rankCode: code,
      required: req.find((r) => r.rankId === id)?.n ?? 0,
      requested,
      committed,
      named: named.rows.find((r) => r.rank_id === id)?.n ?? 0,
      acceptedShortfall: accepted.find((a) => a.rankId === id)?.n ?? 0,
      pendingTopUp,
    });
    return { ...row, rankId: id, outstanding };
  });
}

/**
 * Free men per station and rank for a duty window: available officers minus those booked on an
 * overlapping plan, minus men already promised (but not yet named) to overlapping plans — including this one.
 */
export async function stationFree(db: DbOrTx, unitId: string, range: string): Promise<Map<string, Record<string, number>>> {
  const rows = await db.execute<{ station_id: string; rank_id: string; free: number }>(sql`
    with avail as (
      select p.station_id, p.rank_id, count(*)::int n
      from persons p
      where p.unit_id = ${unitId} and p.is_active and p.availability = 'available'
        and not exists (select 1 from plan_personnel pp where pp.person_id = p.id and pp.duty_window && ${range}::tstzrange)
      group by p.station_id, p.rank_id
    ),
    promised as (
      select fr.target_station_id station_id, l.rank_id,
             sum(greatest(0, coalesce(l.committed, l.requested) - coalesce((select count(*) from plan_personnel pp where pp.request_id = fr.id and pp.rank_id = l.rank_id), 0)))::int n
      from force_requests fr
      join force_request_lines l on l.request_id = fr.id
      join plans pl on pl.id = fr.plan_id
      where fr.target_station_id is not null and fr.status in ('sent','committed','partial','auto_accepted')
        and pl.status not in ('completed','cancelled')
        and exists (select 1 from plan_windows w where w.plan_id = fr.plan_id and tstzrange(w.starts_at, w.ends_at) && ${range}::tstzrange)
      group by fr.target_station_id, l.rank_id
    )
    select a.station_id, a.rank_id, greatest(0, a.n - coalesce(pr.n, 0))::int free
    from avail a left join promised pr on pr.station_id = a.station_id and pr.rank_id = a.rank_id
  `);
  const m = new Map<string, Record<string, number>>();
  for (const r of rows.rows) {
    const cur = m.get(r.station_id) ?? {};
    cur[r.rank_id] = r.free;
    m.set(r.station_id, cur);
  }
  return m;
}

/** Marks overdue unanswered requests as auto-accepted (committed = requested) and tells the UO. Returns how many. */
export async function autoAcceptDue(db: DbOrTx, now = new Date()): Promise<number> {
  const due = await db
    .update(forceRequests)
    .set({ status: "auto_accepted", respondedAt: now })
    .where(and(eq(forceRequests.status, "sent"), lt(forceRequests.deadlineAt, now)))
    .returning({ id: forceRequests.id, planId: forceRequests.planId });
  if (due.length === 0) return 0;
  await db.update(forceRequestLines).set({ committed: sql`${forceRequestLines.requested}` }).where(inArray(forceRequestLines.requestId, due.map((d) => d.id)));
  const planIds = [...new Set(due.map((d) => d.planId))];
  const ps = await db.select({ id: plans.id, title: plans.title, unitId: plans.unitId }).from(plans).where(inArray(plans.id, planIds));
  for (const p of ps) {
    const n = due.filter((d) => d.planId === p.id).length;
    for (const u of await unitOfficers(db, p.unitId)) {
      await notifyUser(db, u, { title: `${n} request${n > 1 ? "s" : ""} auto-accepted: ${p.title}`, body: "The deadline passed without a reply; full strength is assumed. Stations must still send names.", href: `/plans/${p.id}/sourcing`, kind: "alert" });
    }
  }
  return due.length;
}

export async function unitOfficers(db: DbOrTx, unitId: string): Promise<string[]> {
  const rows = await db.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.role, "UNIT_OFFICER"), eq(roleAssignments.unitId, unitId), eq(roleAssignments.isActive, true)));
  return [...new Set(rows.map((r) => r.userId))];
}

export async function stationIncharges(db: DbOrTx, stationId: string): Promise<string[]> {
  const rows = await db.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.role, "OFFICE_INCHARGE"), eq(roleAssignments.stationId, stationId), eq(roleAssignments.isActive, true)));
  return [...new Set(rows.map((r) => r.userId))];
}

/** People to tell when the plan moves on: its IO and its Component Officers. */
export async function planLeads(db: DbOrTx, planId: string): Promise<string[]> {
  const [p] = await db.select({ initiatedBy: plans.initiatedBy }).from(plans).where(eq(plans.id, planId)).limit(1);
  const cos = await db.select({ u: planComponents.coUserId }).from(planComponents).where(eq(planComponents.planId, planId)).orderBy(asc(planComponents.displayOrder));
  return [...new Set([p?.initiatedBy, ...cos.map((c) => c.u)].filter((x): x is string => !!x))];
}

/** Reminders 2 h before the deadline for unanswered requests (once per request). */
export async function remindDue(db: DbOrTx, now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 2 * 3600e3);
  const rows = await db
    .update(forceRequests)
    .set({ remindedAt: now })
    .where(and(eq(forceRequests.status, "sent"), sql`${forceRequests.remindedAt} is null`, sql`${forceRequests.deadlineAt} between ${now.toISOString()}::timestamptz and ${soon.toISOString()}::timestamptz`, sql`${forceRequests.targetStationId} is not null`))
    .returning({ id: forceRequests.id, stationId: forceRequests.targetStationId, planId: forceRequests.planId });
  for (const r of rows) {
    for (const u of await stationIncharges(db, r.stationId!)) {
      await notifyUser(db, u, { title: "Force request due soon", body: "Reply before the deadline, or it will be auto-accepted at full strength.", href: `/station/requests/${r.id}`, kind: "alert" });
      await db.insert(notificationsOutbox).values({ template: "force.reminder", channel: "whatsapp", toUserId: u, payload: { requestId: r.id } });
    }
  }
  return rows.length;
}
