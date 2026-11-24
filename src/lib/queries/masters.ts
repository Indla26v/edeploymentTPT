import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db";
import { deploymentPoints, divisions, equipmentStock, equipmentTypes, persons, ranks, stations, transferRequests, units, unitProfiles, users } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { stationScope, unitScope } from "@/lib/authz/scoped";
import { ageFromDob } from "@/lib/utils";

export type PersonListRow = {
  id: string;
  genNo: string;
  name: string;
  rankId: string;
  rank: string;
  rankCategory: string;
  rankSeniority: number;
  stationId: string;
  station: string;
  gender: "male" | "female";
  dob: string;
  age: number;
  phone: string | null;
  availability: string;
  fitness: "fit" | "light_duty_only";
  photoUrl: string | null;
  signatureUrl: string | null;
  hasLogin: boolean;
};

export async function listPersons(user: CurrentUser): Promise<PersonListRow[]> {
  const rows = await getDb()
    .select({
      id: persons.id,
      genNo: persons.genNo,
      name: persons.name,
      rankId: persons.rankId,
      rank: ranks.code,
      rankCategory: ranks.category,
      rankSeniority: ranks.seniority,
      stationId: persons.stationId,
      station: stations.name,
      gender: persons.gender,
      dob: persons.dob,
      phone: persons.phone,
      availability: persons.availability,
      fitness: persons.fitness,
      photoUrl: persons.photoUrl,
      signatureUrl: persons.signatureUrl,
      hasLogin: sql<boolean>`exists(select 1 from ${users} u where u.person_id = ${persons.id})`,
    })
    .from(persons)
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(stations, eq(stations.id, persons.stationId))
    .where(and(eq(persons.isActive, true), unitScope(user, persons.unitId), stationScope(user, persons.stationId)))
    .orderBy(asc(ranks.seniority), asc(persons.name));
  return rows.map((r) => ({ ...r, age: ageFromDob(r.dob) }));
}

export type StationListRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  divisionId: string;
  division: string;
  lat: number | null;
  lng: number | null;
  displayOrder: number;
  inchargeId: string | null;
  inchargeName: string | null;
  inchargeRank: string | null;
  inchargePhone: string | null;
  strength: number;
  available: number;
};

export async function listStations(user: CurrentUser): Promise<StationListRow[]> {
  const incharge = alias(persons, "incharge");
  const inchargeRank = alias(ranks, "incharge_rank");
  return getDb()
    .select({
      id: stations.id,
      code: stations.code,
      name: stations.name,
      kind: stations.kind,
      divisionId: stations.divisionId,
      division: divisions.name,
      lat: stations.lat,
      lng: stations.lng,
      displayOrder: stations.displayOrder,
      inchargeId: stations.inchargePersonId,
      inchargeName: incharge.name,
      inchargeRank: inchargeRank.code,
      inchargePhone: incharge.phone,
      strength: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id} and p.is_active)`.mapWith(Number),
      available: sql<number>`(select count(*) from ${persons} p where p.station_id = ${stations.id} and p.is_active and p.availability = 'available')`.mapWith(Number),
    })
    .from(stations)
    .innerJoin(divisions, eq(divisions.id, stations.divisionId))
    .leftJoin(incharge, eq(incharge.id, stations.inchargePersonId))
    .leftJoin(inchargeRank, eq(inchargeRank.id, incharge.rankId))
    .where(and(unitScope(user, stations.unitId), stationScope(user, stations.id)))
    .orderBy(asc(stations.displayOrder));
}

export async function listDivisions(user: CurrentUser) {
  return getDb().select({ id: divisions.id, name: divisions.name, unitId: divisions.unitId }).from(divisions).where(unitScope(user, divisions.unitId)).orderBy(asc(divisions.name));
}

export async function listRanks() {
  return getDb().select({ id: ranks.id, code: ranks.code, name: ranks.name, category: ranks.category, seniority: ranks.seniority }).from(ranks).where(eq(ranks.isActive, true)).orderBy(asc(ranks.seniority));
}

export async function listPoints(user: CurrentUser) {
  return getDb()
    .select({
      id: deploymentPoints.id,
      name: deploymentPoints.name,
      description: deploymentPoints.description,
      lat: deploymentPoints.lat,
      lng: deploymentPoints.lng,
      stationId: deploymentPoints.stationId,
      station: stations.name,
      defaultPriority: deploymentPoints.defaultPriority,
      defaultIntensity: deploymentPoints.defaultIntensity,
      defaultMobility: deploymentPoints.defaultMobility,
      genderReq: deploymentPoints.genderReq,
      isActive: deploymentPoints.isActive,
    })
    .from(deploymentPoints)
    .leftJoin(stations, eq(stations.id, deploymentPoints.stationId))
    .where(unitScope(user, deploymentPoints.unitId))
    .orderBy(asc(deploymentPoints.defaultPriority), asc(deploymentPoints.name));
}

export async function listEquipment(user: CurrentUser) {
  const db = getDb();
  const [types, stock] = await Promise.all([
    db.select({ id: equipmentTypes.id, name: equipmentTypes.name }).from(equipmentTypes).where(unitScope(user, equipmentTypes.unitId)).orderBy(asc(equipmentTypes.name)),
    db
      .select({
        id: equipmentStock.id,
        stationId: equipmentStock.stationId,
        station: stations.name,
        equipmentTypeId: equipmentStock.equipmentTypeId,
        equipment: equipmentTypes.name,
        total: equipmentStock.total,
        working: equipmentStock.working,
        custodianName: equipmentStock.custodianName,
        custodianDesignation: equipmentStock.custodianDesignation,
        custodianPhone: equipmentStock.custodianPhone,
      })
      .from(equipmentStock)
      .innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentStock.equipmentTypeId))
      .innerJoin(stations, eq(stations.id, equipmentStock.stationId))
      .where(and(unitScope(user, equipmentStock.unitId), stationScope(user, equipmentStock.stationId)))
      .orderBy(asc(equipmentTypes.name), asc(stations.displayOrder)),
  ]);
  return { types, stock };
}

export async function listTransfers(user: CurrentUser) {
  const from = alias(stations, "from_station");
  const to = alias(stations, "to_station");
  return getDb()
    .select({
      id: transferRequests.id,
      status: transferRequests.status,
      reason: transferRequests.reason,
      createdAt: transferRequests.createdAt,
      decidedAt: transferRequests.decidedAt,
      personId: persons.id,
      name: persons.name,
      genNo: persons.genNo,
      phone: persons.phone,
      rank: ranks.code,
      fromStationId: transferRequests.fromStationId,
      fromStation: from.name,
      toStation: to.name,
    })
    .from(transferRequests)
    .innerJoin(persons, eq(persons.id, transferRequests.personId))
    .innerJoin(ranks, eq(ranks.id, persons.rankId))
    .innerJoin(from, eq(from.id, transferRequests.fromStationId))
    .innerJoin(to, eq(to.id, transferRequests.toStationId))
    .where(and(unitScope(user, transferRequests.unitId), user.activeRole === "OFFICE_INCHARGE" ? stationScope(user, transferRequests.fromStationId) : sql`true`))
    .orderBy(desc(transferRequests.createdAt));
}

export async function getUnitProfile(unitId: string) {
  const db = getDb();
  const [u] = await db.select({ id: units.id, name: units.name, code: units.code, officerName: units.officerName, officerDesignation: units.officerDesignation, officerPhone: units.officerPhone }).from(units).where(eq(units.id, unitId)).limit(1);
  const [p] = await db.select().from(unitProfiles).where(eq(unitProfiles.unitId, unitId)).limit(1);
  return u ? { ...u, about: p?.about ?? null, logoUrl: p?.logoUrl ?? null, signatureUrl: p?.signatureUrl ?? null, profileImageUrl: p?.profileImageUrl ?? null } : null;
}

/** All stations of the signed-in user's unit (id + name), e.g. as transfer targets — not station-scoped. */
export async function listUnitStationOptions(user: CurrentUser) {
  return getDb().select({ value: stations.id, label: stations.name }).from(stations).where(unitScope(user, stations.unitId)).orderBy(asc(stations.displayOrder));
}
