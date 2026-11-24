import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { CurrentUser } from "@/lib/auth/session";
import { AuthzError, UserError, scopeStationIds } from "@/lib/authz/authorize";
import { getDb } from "@/lib/db";
import { forceRequestLines, forceRequests, persons, planPersonnel, planPoints, planWindows, plans, preferences, ranks, stations } from "@/lib/db/schema";
import { loadPlan } from "@/lib/plans/server";
import { distribute, haversineKm } from "@/lib/sourcing/distribute";
import { planLedger, planRange, stationFree } from "@/lib/sourcing/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EffectiveStatus = "sent" | "committed" | "partial" | "declined" | "auto_accepted" | "cancelled";
const effective = (status: EffectiveStatus, deadline: Date, now: Date): EffectiveStatus => (status === "sent" && deadline < now ? "auto_accepted" : status);

async function requestsWithLines(where: ReturnType<typeof eq>, now: Date) {
  const db = getDb();
  const reqs = await db
    .select({
      id: forceRequests.id,
      planId: forceRequests.planId,
      round: forceRequests.round,
      kind: forceRequests.kind,
      stationId: forceRequests.targetStationId,
      station: stations.name,
      status: forceRequests.status,
      deadlineAt: forceRequests.deadlineAt,
      sentAt: forceRequests.sentAt,
      respondedAt: forceRequests.respondedAt,
      rollSentAt: forceRequests.rollSentAt,
      shortReason: forceRequests.shortReason,
      note: forceRequests.note,
    })
    .from(forceRequests)
    .leftJoin(stations, eq(stations.id, forceRequests.targetStationId))
    .where(where)
    .orderBy(desc(forceRequests.sentAt));
  const ids = reqs.map((r) => r.id);
  const lines = ids.length
    ? await db
        .select({
          requestId: forceRequestLines.requestId,
          rankId: forceRequestLines.rankId,
          rank: ranks.code,
          seniority: ranks.seniority,
          requested: forceRequestLines.requested,
          committed: forceRequestLines.committed,
          reason: forceRequestLines.reason,
          named: sql<number>`(select count(*) from plan_personnel pp where pp.request_id = ${forceRequestLines.requestId} and pp.rank_id = ${forceRequestLines.rankId})`.mapWith(Number),
        })
        .from(forceRequestLines)
        .innerJoin(ranks, eq(ranks.id, forceRequestLines.rankId))
        .where(inArray(forceRequestLines.requestId, ids))
        .orderBy(asc(ranks.seniority))
    : [];
  return reqs.map((r) => {
    const status = effective(r.status, r.deadlineAt, now);
    const ls = lines.filter((l) => l.requestId === r.id).map((l) => ({ ...l, committed: status === "auto_accepted" && l.committed === null ? l.requested : l.committed }));
    return { ...r, status, lines: ls };
  });
}

export type RequestRow = Awaited<ReturnType<typeof requestsWithLines>>[number];

/** Everything the Unit Officer's sourcing page needs. */
export async function getSourcing(user: CurrentUser, planId: string, now = new Date()) {
  const db = getDb();
  const plan = await loadPlan(db, user, planId);
  const range = await planRange(db, plan.id);
  const [ledger, requests, stationRows, prefRows, pts, windows] = await Promise.all([
    planLedger(db, plan.id, now),
    requestsWithLines(eq(forceRequests.planId, plan.id), now),
    db.select({ id: stations.id, name: stations.name, code: stations.code, lat: stations.lat, lng: stations.lng }).from(stations).where(eq(stations.unitId, plan.unitId)).orderBy(asc(stations.displayOrder)),
    db
      .select({ kind: preferences.kind, stationId: preferences.stationId, rankId: preferences.rankId, count: preferences.count, personStationId: persons.stationId, personRankId: persons.rankId })
      .from(preferences)
      .leftJoin(persons, eq(persons.id, preferences.personId))
      .where(and(eq(preferences.planId, plan.id), eq(preferences.status, "active"))),
    db.select({ lat: planPoints.lat, lng: planPoints.lng }).from(planPoints).where(eq(planPoints.planId, plan.id)),
    db.select().from(planWindows).where(eq(planWindows.planId, plan.id)).orderBy(asc(planWindows.startsAt)),
  ]);
  const free = range ? await stationFree(db, plan.unitId, range.range) : new Map<string, Record<string, number>>();

  // Venue: the plan's location, else the centre of its points.
  const located = pts.filter((p) => p.lat !== null && p.lng !== null);
  const venue = plan.lat !== null && plan.lng !== null ? { lat: plan.lat, lng: plan.lng } : located.length ? { lat: located.reduce((a, p) => a + p.lat!, 0) / located.length, lng: located.reduce((a, p) => a + p.lng!, 0) / located.length } : null;
  const supply = stationRows.map((s) => ({
    ...s,
    distanceKm: venue && s.lat !== null && s.lng !== null ? Math.round(haversineKm(venue, { lat: s.lat, lng: s.lng }) * 10) / 10 : null,
    free: free.get(s.id) ?? {},
  }));

  // Still to request: required − accepted short − (answered: committed, waiting: requested).
  const need: Record<string, number> = {};
  for (const r of ledger) need[r.rankId] = Math.max(0, r.required - r.acceptedShortfall - r.committed - r.outstanding);
  const suggestion = distribute({
    need,
    stations: supply.map((s) => ({ stationId: s.id, distanceKm: s.distanceKm, free: s.free })),
    stationPreferences: prefRows.filter((p) => p.kind === "station" && p.stationId).map((p) => ({ stationId: p.stationId!, rankId: p.rankId, count: p.count })),
    personPreferences: prefRows.filter((p) => p.kind === "person" && p.personStationId).map((p) => ({ stationId: p.personStationId!, rankId: p.personRankId! })),
  });
  return { plan, windows, ledger, requests, stations: supply, need, suggestion, venue };
}

export type SourcingData = Awaited<ReturnType<typeof getSourcing>>;

/** Requests addressed to the Office Incharge's station(s). */
export async function listStationRequests(user: CurrentUser, now = new Date()) {
  const ids = scopeStationIds(user);
  if (!ids || ids.length === 0) return [];
  const rows = await requestsWithLines(inArray(forceRequests.targetStationId, ids) as ReturnType<typeof eq>, now);
  if (rows.length === 0) return [];
  const planRows = await getDb()
    .select({ id: plans.id, title: plans.title, code: plans.code, venue: plans.venue, status: plans.status, startsAt: sql<string>`(select min(starts_at) from plan_windows w where w.plan_id = "plans"."id")`, endsAt: sql<string>`(select max(ends_at) from plan_windows w where w.plan_id = "plans"."id")` })
    .from(plans)
    .where(inArray(plans.id, [...new Set(rows.map((r) => r.planId))]));
  return rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => {
      const p = planRows.find((x) => x.id === r.planId)!;
      return { ...r, plan: { ...p, startsAt: p.startsAt ? new Date(p.startsAt) : null, endsAt: p.endsAt ? new Date(p.endsAt) : null } };
    });
}

export type StationRequestRow = Awaited<ReturnType<typeof listStationRequests>>[number];

/** One request for the Office Incharge: lines, eligible officers and the current nominal roll. */
export async function getStationRequest(user: CurrentUser, requestId: string, now = new Date()) {
  if (!UUID.test(requestId)) throw new UserError("That request doesn't exist.");
  const db = getDb();
  const [req] = await requestsWithLines(eq(forceRequests.id, requestId), now);
  if (!req || !req.stationId) throw new UserError("That request doesn't exist.");
  const ids = scopeStationIds(user);
  if (ids && !ids.includes(req.stationId)) throw new AuthzError("This request is for another station.");
  const [plan] = await db.select().from(plans).where(eq(plans.id, req.planId)).limit(1);
  const range = await planRange(db, req.planId);
  const rankIds = req.lines.map((l) => l.rankId);
  const candidates = rankIds.length
    ? await db
        .select({
          id: persons.id,
          name: persons.name,
          genNo: persons.genNo,
          phone: persons.phone,
          gender: persons.gender,
          dob: persons.dob,
          fitness: persons.fitness,
          availability: persons.availability,
          rankId: persons.rankId,
          rank: ranks.code,
          bookedElsewhere: range
            ? sql<string | null>`(select pl.title from plan_personnel pp join plans pl on pl.id = pp.plan_id where pp.person_id = ${persons.id} and pp.plan_id <> ${req.planId} and pp.duty_window && ${range.range}::tstzrange limit 1)`
            : sql<string | null>`null`,
          inThisPlan: sql<string | null>`(select pp.request_id from plan_personnel pp where pp.person_id = ${persons.id} and pp.plan_id = ${req.planId} limit 1)`,
          preferred: sql<boolean>`exists (select 1 from preferences pf where pf.plan_id = ${req.planId} and pf.person_id = ${persons.id} and pf.status = 'active')`,
        })
        .from(persons)
        .innerJoin(ranks, eq(ranks.id, persons.rankId))
        .where(and(eq(persons.stationId, req.stationId), eq(persons.isActive, true), inArray(persons.rankId, rankIds)))
        .orderBy(asc(ranks.seniority), asc(persons.name))
    : [];
  const roll = await db.select({ personId: planPersonnel.personId }).from(planPersonnel).where(eq(planPersonnel.requestId, req.id));
  return { request: req, plan: plan!, range, candidates, roll: roll.map((r) => r.personId) };
}

export type StationRequestData = Awaited<ReturnType<typeof getStationRequest>>;
