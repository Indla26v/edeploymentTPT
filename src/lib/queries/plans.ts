import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { CurrentUser } from "@/lib/auth/session";
import { unitScope } from "@/lib/authz/scoped";
import { getDb } from "@/lib/db";
import {
  components,
  deploymentPoints,
  equipmentTypes,
  persons,
  planComponents,
  planEquipmentRequirements,
  planEvents,
  planPoints,
  planReportingSchedule,
  planWindows,
  plans,
  pointRequirements,
  preferences,
  ranks,
  sectors,
  shifts,
  slots,
  stations,
  teams,
  units,
  users,
} from "@/lib/db/schema";
import { loadComponent, loadPlan, seesWholePlans } from "@/lib/plans/server";
import type { PersonOption } from "@/components/pickers/person-picker";

const NONE = "00000000-0000-0000-0000-000000000000";

/** SQL condition for plans the user can see. */
function visiblePlans(user: CurrentUser) {
  if (seesWholePlans(user)) return unitScope(user, plans.unitId);
  if (user.activeRole === "COMPONENT_OFFICER") return sql`${plans.id} in (select plan_id from plan_components where co_user_id = ${user.id})`;
  return sql`false`;
}

export type PlanListRow = Awaited<ReturnType<typeof listPlans>>[number];

export async function listPlans(user: CurrentUser, which: "ongoing" | "completed") {
  const statuses = which === "completed" ? (["completed"] as const) : (["draft", "proposing", "consolidating", "sourcing", "placement", "published", "live"] as const);
  const rows = await getDb()
    .select({
      id: plans.id,
      code: plans.code,
      title: plans.title,
      eventType: plans.eventType,
      venue: plans.venue,
      status: plans.status,
      proposalDueAt: plans.proposalDueAt,
      startsAt: sql<Date | null>`(select min(starts_at) from plan_windows w where w.plan_id = "plans"."id")`.mapWith((v) => (v ? new Date(v) : null)),
      endsAt: sql<Date | null>`(select max(ends_at) from plan_windows w where w.plan_id = "plans"."id")`.mapWith((v) => (v ? new Date(v) : null)),
      componentsTotal: sql<number>`(select count(*) from plan_components c where c.plan_id = "plans"."id")`.mapWith(Number),
      componentsIn: sql<number>`(select count(*) from plan_components c where c.plan_id = "plans"."id" and c.status in ('submitted','accepted'))`.mapWith(Number),
      componentsReturned: sql<number>`(select count(*) from plan_components c where c.plan_id = "plans"."id" and c.status = 'returned')`.mapWith(Number),
      required: sql<number>`(select count(*) from slots s where s.plan_id = "plans"."id")`.mapWith(Number),
      myComponentId: sql<string | null>`(select id from plan_components c where c.plan_id = "plans"."id" and c.co_user_id = ${user.id} limit 1)`,
      myComponentStatus: sql<string | null>`(select status from plan_components c where c.plan_id = "plans"."id" and c.co_user_id = ${user.id} limit 1)`,
      updatedAt: plans.updatedAt,
    })
    .from(plans)
    .where(and(visiblePlans(user), inArray(plans.status, [...statuses])))
    .orderBy(desc(plans.updatedAt));
  // COs don't see drafts (the plan isn't theirs to work on yet).
  return user.activeRole === "COMPONENT_OFFICER" ? rows.filter((r) => r.status !== "draft") : rows;
}

const coPerson = alias(persons, "co_person");
const coRank = alias(ranks, "co_rank");
const inPerson = alias(persons, "incharge_person");
const inRank = alias(ranks, "incharge_rank");
const inStation = alias(stations, "incharge_station");
const coStation = alias(stations, "co_station");

export async function getPlanDetail(user: CurrentUser, planId: string) {
  const db = getDb();
  const plan = await loadPlan(db, user, planId);
  const [windows, schedule, comps, events, overall] = await Promise.all([
    db.select().from(planWindows).where(eq(planWindows.planId, planId)).orderBy(asc(planWindows.startsAt)),
    db
      .select({ id: planReportingSchedule.id, kind: planReportingSchedule.kind, rankId: planReportingSchedule.rankId, rank: ranks.code, at: planReportingSchedule.at, place: planReportingSchedule.place })
      .from(planReportingSchedule)
      .leftJoin(ranks, eq(ranks.id, planReportingSchedule.rankId))
      .where(eq(planReportingSchedule.planId, planId))
      .orderBy(asc(planReportingSchedule.at)),
    db
      .select({
        id: planComponents.id,
        name: planComponents.name,
        componentId: planComponents.componentId,
        status: planComponents.status,
        coUserId: planComponents.coUserId,
        coPersonId: planComponents.coPersonId,
        coName: coPerson.name,
        coRank: coRank.code,
        coGenNo: coPerson.genNo,
        coPhone: coPerson.phone,
        coStation: coStation.name,
        inchargePersonId: planComponents.inchargePersonId,
        inchargeName: inPerson.name,
        inchargeRank: inRank.code,
        inchargeGenNo: inPerson.genNo,
        inchargeStation: inStation.name,
        returnComment: planComponents.returnComment,
        submittedAt: planComponents.submittedAt,
        sectors: sql<number>`(select count(*) from sectors s where s.plan_component_id = ${planComponents.id})`.mapWith(Number),
        points: sql<number>`(select count(*) from plan_points p where p.plan_component_id = ${planComponents.id})`.mapWith(Number),
        required: sql<number>`(select count(*) from slots s where s.plan_component_id = ${planComponents.id})`.mapWith(Number),
        draftRequired: sql<number>`(select coalesce(sum(r.count),0) from point_requirements r join plan_points p on p.id = r.point_id where p.plan_component_id = ${planComponents.id})`.mapWith(Number),
      })
      .from(planComponents)
      .leftJoin(coPerson, eq(coPerson.id, planComponents.coPersonId))
      .leftJoin(coRank, eq(coRank.id, coPerson.rankId))
      .leftJoin(coStation, eq(coStation.id, coPerson.stationId))
      .leftJoin(inPerson, eq(inPerson.id, planComponents.inchargePersonId))
      .leftJoin(inRank, eq(inRank.id, inPerson.rankId))
      .leftJoin(inStation, eq(inStation.id, inPerson.stationId))
      .where(eq(planComponents.planId, planId))
      .orderBy(asc(planComponents.displayOrder), asc(planComponents.name)),
    db
      .select({ id: planEvents.id, kind: planEvents.kind, message: planEvents.message, createdAt: planEvents.createdAt, actor: users.name })
      .from(planEvents)
      .leftJoin(users, eq(users.id, planEvents.actorUserId))
      .where(eq(planEvents.planId, planId))
      .orderBy(desc(planEvents.createdAt))
      .limit(60),
    plan.overallInchargePersonId
      ? db
          .select({ id: persons.id, name: persons.name, rank: ranks.code, genNo: persons.genNo, station: stations.name, phone: persons.phone })
          .from(persons)
          .innerJoin(ranks, eq(ranks.id, persons.rankId))
          .innerJoin(stations, eq(stations.id, persons.stationId))
          .where(eq(persons.id, plan.overallInchargePersonId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { plan, windows, schedule, components: comps, events, overall: overall as PersonOption | null };
}

export type PlanDetail = Awaited<ReturnType<typeof getPlanDetail>>;

/** Options for the initiate wizard. */
export async function getInitiateOptions(user: CurrentUser) {
  const db = getDb();
  const [comps, rankRows, completed] = await Promise.all([
    db.select({ id: components.id, name: components.name }).from(components).where(and(unitScope(user, components.unitId), eq(components.isActive, true))).orderBy(asc(components.name)),
    db.select({ id: ranks.id, code: ranks.code, name: ranks.name }).from(ranks).where(eq(ranks.isActive, true)).orderBy(asc(ranks.seniority)),
    db
      .select({ id: plans.id, code: plans.code, title: plans.title, status: plans.status })
      .from(plans)
      .where(and(unitScope(user, plans.unitId), inArray(plans.status, ["completed", "published", "live", "placement", "sourcing"])))
      .orderBy(desc(plans.updatedAt))
      .limit(30),
  ]);
  return { components: comps, ranks: rankRows, reusable: completed };
}

/** Everything a CO needs for the proposal stepper. */
export async function getProposal(user: CurrentUser, planComponentId: string) {
  const db = getDb();
  const { plan, component, isCo } = await loadComponent(db, user, planComponentId);
  const [secs, pts, equipment, prefs] = await Promise.all([
    db.select().from(sectors).where(eq(sectors.planComponentId, component.id)).orderBy(asc(sectors.displayOrder), asc(sectors.createdAt)),
    db.select().from(planPoints).where(eq(planPoints.planComponentId, component.id)).orderBy(asc(planPoints.displayOrder), asc(planPoints.createdAt)),
    db.select({ equipmentTypeId: planEquipmentRequirements.equipmentTypeId, quantity: planEquipmentRequirements.quantity, note: planEquipmentRequirements.note }).from(planEquipmentRequirements).where(eq(planEquipmentRequirements.planComponentId, component.id)),
    db
      .select({
        id: preferences.id,
        kind: preferences.kind,
        unitId: preferences.unitId,
        stationId: preferences.stationId,
        personId: preferences.personId,
        pointId: preferences.pointId,
        rankId: preferences.rankId,
        count: preferences.count,
        note: preferences.note,
        status: preferences.status,
        personName: persons.name,
        personGenNo: persons.genNo,
        personRank: sql<string | null>`(select code from ranks r where r.id = ${persons.rankId})`,
        personStation: sql<string | null>`(select name from stations s where s.id = ${persons.stationId})`,
        personPhone: persons.phone,
      })
      .from(preferences)
      .leftJoin(persons, eq(persons.id, preferences.personId))
      .where(eq(preferences.planComponentId, component.id)),
  ]);
  const reqs = pts.length ? await db.select().from(pointRequirements).where(inArray(pointRequirements.pointId, pts.map((p) => p.id))) : [];
  const [rankRows, shiftRows, library, teamRows, eqTypes, stationRows, unitRows] = await Promise.all([
    db.select({ id: ranks.id, code: ranks.code, name: ranks.name, category: ranks.category }).from(ranks).where(eq(ranks.isActive, true)).orderBy(asc(ranks.seniority)),
    db.select({ id: shifts.id, name: shifts.name, startTime: shifts.startTime, endTime: shifts.endTime }).from(shifts).where(eq(shifts.unitId, plan.unitId)).orderBy(asc(shifts.startTime)),
    db.select().from(deploymentPoints).where(and(eq(deploymentPoints.unitId, plan.unitId), eq(deploymentPoints.isActive, true))).orderBy(asc(deploymentPoints.defaultPriority), asc(deploymentPoints.name)),
    db.select({ id: teams.id, name: teams.name, composition: teams.composition }).from(teams).where(eq(teams.unitId, plan.unitId)).orderBy(asc(teams.name)),
    db.select({ id: equipmentTypes.id, name: equipmentTypes.name }).from(equipmentTypes).where(eq(equipmentTypes.unitId, plan.unitId)).orderBy(asc(equipmentTypes.name)),
    db.select({ id: stations.id, name: stations.name }).from(stations).where(eq(stations.unitId, plan.unitId)).orderBy(asc(stations.displayOrder)),
    db.select({ id: units.id, name: units.name }).from(units).where(ne(units.id, plan.unitId)).orderBy(asc(units.displayOrder)),
  ]);
  return {
    plan,
    component,
    isCo,
    sectors: secs,
    points: pts,
    requirements: reqs,
    equipment,
    preferences: prefs,
    options: { ranks: rankRows, shifts: shiftRows, library, teams: teamRows, equipmentTypes: eqTypes, stations: stationRows, units: unitRows },
  };
}

export type ProposalData = Awaited<ReturnType<typeof getProposal>>;

/** IO consolidation: every component's points with counts, totals by rank, preference conflicts. */
export async function getConsolidation(user: CurrentUser, planId: string) {
  const db = getDb();
  const detail = await getPlanDetail(user, planId);
  const compIds = detail.components.map((c) => c.id);
  const ids = compIds.length ? compIds : [NONE];
  const [secs, pts, rankRows] = await Promise.all([
    db.select({ id: sectors.id, planComponentId: sectors.planComponentId, name: sectors.name, batches: sectors.batches, inchargeRankId: sectors.inchargeRankId, liaisonRankId: sectors.liaisonRankId }).from(sectors).where(inArray(sectors.planComponentId, ids)).orderBy(asc(sectors.displayOrder)),
    db.select({ id: planPoints.id, sectorId: planPoints.sectorId, planComponentId: planPoints.planComponentId, name: planPoints.name, priority: planPoints.priority, intensity: planPoints.intensity, genderReq: planPoints.genderReq }).from(planPoints).where(inArray(planPoints.planComponentId, ids)).orderBy(asc(planPoints.displayOrder)),
    db.select({ id: ranks.id, code: ranks.code }).from(ranks).orderBy(asc(ranks.seniority)),
  ]);
  const reqs = pts.length
    ? await db.select({ id: pointRequirements.id, pointId: pointRequirements.pointId, batch: pointRequirements.batch, rankId: pointRequirements.rankId, count: pointRequirements.count, mergeGroup: pointRequirements.mergeGroup }).from(pointRequirements).where(inArray(pointRequirements.pointId, pts.map((p) => p.id)))
    : [];
  const slotTotals = await db
    .select({ rankId: slots.rankId, planComponentId: slots.planComponentId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(slots)
    .where(eq(slots.planId, planId))
    .groupBy(slots.rankId, slots.planComponentId);

  // The same officer preferred by two components (or two preferences) — the IO keeps one.
  const personPrefs = await db
    .select({ id: preferences.id, personId: preferences.personId, planComponentId: preferences.planComponentId, status: preferences.status, name: persons.name, rank: ranks.code, genNo: persons.genNo, pointName: planPoints.name })
    .from(preferences)
    .innerJoin(persons, eq(persons.id, preferences.personId))
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .leftJoin(planPoints, eq(planPoints.id, preferences.pointId))
    .where(and(eq(preferences.planId, planId), eq(preferences.kind, "person"), isNotNull(preferences.personId)));
  const byPerson = new Map<string, typeof personPrefs>();
  for (const p of personPrefs) byPerson.set(p.personId!, [...(byPerson.get(p.personId!) ?? []), p]);
  const conflicts = [...byPerson.values()].filter((list) => list.filter((p) => p.status === "active").length > 1);

  return { ...detail, sectors: secs, points: pts, requirements: reqs, ranks: rankRows, slotTotals, conflicts };
}

export type ConsolidationData = Awaited<ReturnType<typeof getConsolidation>>;

/** Persons for CO / incharge pickers in the plan's unit (any station). */
/** Ranks that can't lead a component or be an incharge. */
const NON_OFFICER_RANKS = ["ASI", "HC", "PC", "HG", "ARSI", "HC(AR)", "PC(AR)", "HC(APSP)", "PC(APSP)"];

export async function searchUnitPersons(user: CurrentUser, q: string, officersOnly = false): Promise<PersonOption[]> {
  const term = q.trim();
  return getDb()
    .select({ id: persons.id, name: persons.name, rank: ranks.code, genNo: persons.genNo, station: stations.name, phone: persons.phone })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(stations, eq(stations.id, persons.stationId))
    .where(
      and(
        eq(persons.isActive, true),
        unitScope(user, persons.unitId),
        officersOnly ? sql`${ranks.code} not in (${sql.join(NON_OFFICER_RANKS.map((c) => sql`${c}`), sql`, `)})` : sql`true`,
        term ? sql`(${persons.name} ilike ${`%${term}%`} or ${persons.genNo} ilike ${`${term}%`} or ${persons.phone} ilike ${`%${term}%`})` : sql`true`,
      ),
    )
    .orderBy(asc(ranks.seniority), asc(persons.name))
    .limit(20);
}

