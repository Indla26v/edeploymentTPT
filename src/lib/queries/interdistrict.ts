import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { CurrentUser } from "@/lib/auth/session";
import { AuthzError, UserError, scopeUnitIds } from "@/lib/authz/authorize";
import { getDb } from "@/lib/db";
import { escalationLines, escalations, forceRequests, plans, ranks, stations, units } from "@/lib/db/schema";
import { prefillUnits, unitFree } from "@/lib/sourcing/escalation";
import { planRange, stationFree } from "@/lib/sourcing/server";
import { requestsWithLines } from "./sourcing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const planDates = {
  startsAt: sql<string | null>`(select min(starts_at) from plan_windows w where w.plan_id = ${escalations.planId})`,
  endsAt: sql<string | null>`(select max(ends_at) from plan_windows w where w.plan_id = ${escalations.planId})`,
};

/** DGP: every escalation, open first. */
export async function listEscalations() {
  const db = getDb();
  const rows = await db
    .select({ e: escalations, plan: plans.title, venue: plans.venue, planStatus: plans.status, fromUnit: units.name, ...planDates })
    .from(escalations)
    .innerJoin(plans, eq(plans.id, escalations.planId))
    .innerJoin(units, eq(units.id, escalations.fromUnitId))
    .orderBy(sql`case ${escalations.status} when 'open' then 0 when 'distributed' then 1 else 2 end`, desc(escalations.createdAt));
  const ids = rows.map((r) => r.e.id);
  const lines = ids.length ? await db.select({ escalationId: escalationLines.escalationId, rankId: escalationLines.rankId, rank: ranks.code, requested: escalationLines.requested }).from(escalationLines).innerJoin(ranks, eq(ranks.id, escalationLines.rankId)).where(inArray(escalationLines.escalationId, ids)).orderBy(asc(ranks.seniority)) : [];
  return rows.map((r) => ({ ...r.e, plan: r.plan, venue: r.venue, planStatus: r.planStatus, fromUnit: r.fromUnit, startsAt: r.startsAt ? new Date(r.startsAt) : null, endsAt: r.endsAt ? new Date(r.endsAt) : null, lines: lines.filter((l) => l.escalationId === r.e.id) }));
}

export async function getEscalation(id: string) {
  if (!UUID.test(id)) throw new UserError("That request doesn't exist.");
  const db = getDb();
  const all = await listEscalations();
  const e = all.find((x) => x.id === id);
  if (!e) throw new UserError("That request doesn't exist.");
  const range = await planRange(db, e.planId);
  const supply = range ? await unitFree(db, range.range, e.fromUnitId) : [];
  const need = Object.fromEntries(e.lines.map((l) => [l.rankId, l.requested]));
  const sent = await requestsWithLines(and(eq(forceRequests.escalationId, e.id)) as ReturnType<typeof eq>, new Date());
  return { escalation: e, supply, prefill: prefillUnits(need, supply), sent };
}

/** Receiving Unit Officer: requests from the Chief Office addressed to my unit. */
export async function listIncomingUnitRequests(user: CurrentUser) {
  const ids = scopeUnitIds(user);
  if (!ids || !ids.length) return [];
  const rows = await requestsWithLines(and(inArray(forceRequests.targetUnitId, ids), isNotNull(forceRequests.targetUnitId)) as ReturnType<typeof eq>, new Date());
  if (!rows.length) return [];
  const ps = await getDb()
    .select({ id: plans.id, title: plans.title, venue: plans.venue, status: plans.status, fromUnit: units.name, startsAt: sql<string>`(select min(starts_at) from plan_windows w where w.plan_id = "plans"."id")`, endsAt: sql<string>`(select max(ends_at) from plan_windows w where w.plan_id = "plans"."id")` })
    .from(plans)
    .innerJoin(units, eq(units.id, plans.unitId))
    .where(inArray(plans.id, [...new Set(rows.map((r) => r.planId))]));
  return rows.map((r) => {
    const p = ps.find((x) => x.id === r.planId)!;
    return { ...r, plan: { ...p, startsAt: p.startsAt ? new Date(p.startsAt) : null, endsAt: p.endsAt ? new Date(p.endsAt) : null } };
  });
}

export async function getIncomingUnitRequest(user: CurrentUser, requestId: string) {
  if (!UUID.test(requestId)) throw new UserError("That request doesn't exist.");
  const all = await listIncomingUnitRequests(user);
  const req = all.find((r) => r.id === requestId);
  if (!req) throw new AuthzError("That request isn't addressed to your unit.");
  const db = getDb();
  const range = await planRange(db, req.planId);
  const own = await db.select({ id: stations.id, name: stations.name }).from(stations).where(eq(stations.unitId, req.unitId!)).orderBy(asc(stations.displayOrder));
  const free = range ? await stationFree(db, req.unitId!, range.range) : new Map<string, Record<string, number>>();
  const children = await requestsWithLines(eq(forceRequests.parentRequestId, req.id), new Date());
  return { request: req, stations: own.map((s) => ({ ...s, free: free.get(s.id) ?? {} })), children };
}

export async function interDistrictCounts(user: CurrentUser) {
  const db = getDb();
  const ids = scopeUnitIds(user);
  const [open] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(escalations).where(eq(escalations.status, "open"));
  const incoming = ids?.length
    ? (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(forceRequests).where(and(inArray(forceRequests.targetUnitId, ids), eq(forceRequests.status, "sent"), sql`${forceRequests.deadlineAt} > now()`)))[0]!.n
    : 0;
  return { openEscalations: open!.n, incoming };
}

