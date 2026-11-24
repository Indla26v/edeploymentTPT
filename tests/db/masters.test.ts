import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
// Server actions use getDb(), which reads DATABASE_URL: point it at the test database first.
if (url) process.env.DATABASE_URL = url;

import { actor } from "../support/act-as";
import { and, eq, ne } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { loadUser } from "@/lib/auth/session";
import type { Role } from "@/lib/authz/roles";
import { createDb, type Db } from "@/lib/db/client";
import { auditLog, persons, roleAssignments, stations, transferRequests, users } from "@/lib/db/schema";
import { assignInchargeAction, reorderStationsAction } from "@/app/(app)/masters/stations/actions";
import { decideTransferAction, requestTransferAction } from "@/app/(app)/masters/transfers/actions";
import { deletePointAction, savePointAction } from "@/app/(app)/masters/points/actions";
import { saveStockAction } from "@/app/(app)/masters/equipment/actions";

describe.skipIf(!url)("masters server actions", () => {
  let db: Db;
  let end: () => Promise<void>;
  const as = async (username: string, role?: Role) => {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    actor.current = await loadUser(db, u!.id, role ?? null);
  };
  const station = async (code: string) => (await db.select().from(stations).where(eq(stations.code, code)).limit(1))[0]!;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
  }, 60_000);
  afterAll(async () => end?.());
  beforeEach(() => {
    actor.current = null;
  });

  it("transfer: OI requests, UO approves, the officer's station changes and it is audited", async () => {
    const t1 = await station("PS-T1");
    const mkt = await station("PS-MKT");
    const [pc] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.stationId, t1.id), eq(persons.gender, "male"), ne(persons.id, t1.inchargePersonId!)))
      .orderBy(persons.genNo)
      .limit(1);
    await as("sho.town1");
    const req = await requestTransferAction({ personId: pc!.id, toStationId: mkt.id, reason: "Family reasons" });
    expect(req).toMatchObject({ ok: true });

    // A second pending request for the same officer is refused.
    expect(await requestTransferAction({ personId: pc!.id, toStationId: mkt.id, reason: "Again" })).toMatchObject({ ok: false });

    // OI cannot approve.
    const [tr] = await db.select().from(transferRequests).where(and(eq(transferRequests.personId, pc!.id), eq(transferRequests.status, "pending")));
    expect(await decideTransferAction(tr!.id, "approved")).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });

    await as("sp", "UNIT_OFFICER");
    expect(await decideTransferAction(tr!.id, "approved")).toMatchObject({ ok: true });
    const [moved] = await db.select({ stationId: persons.stationId }).from(persons).where(eq(persons.id, pc!.id));
    expect(moved!.stationId).toBe(mkt.id);
    expect(await decideTransferAction(tr!.id, "rejected")).toMatchObject({ ok: false, error: expect.stringMatching(/already decided/) });
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, tr!.id));
    expect(audits.map((a) => a.action).sort()).toEqual(["transfer.approve", "transfer.request"]);
  });

  it("transfer: an OI cannot move an officer of another station", async () => {
    const t2 = await station("PS-T2");
    const mkt = await station("PS-MKT");
    const [other] = await db.select({ id: persons.id }).from(persons).where(eq(persons.stationId, t2.id)).limit(1);
    await as("sho.town1");
    const r = await requestTransferAction({ personId: other!.id, toStationId: mkt.id, reason: "Not mine" });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/another station/) });
  });

  it("stations: drag reorder persists the new order", async () => {
    await as("sp", "UNIT_OFFICER");
    const before = await db.select({ id: stations.id }).from(stations).orderBy(stations.displayOrder);
    const reversed = before.map((s) => s.id).reverse();
    expect(await reorderStationsAction(reversed)).toMatchObject({ ok: true });
    const after = await db.select({ id: stations.id }).from(stations).orderBy(stations.displayOrder);
    expect(after.map((s) => s.id)).toEqual(reversed);
  });

  it("stations: assigning an Office Incharge creates a login with a one-time password and moves the role", async () => {
    const hwy = await station("PS-HWY");
    const [si] = await db.select({ id: persons.id }).from(persons).where(and(eq(persons.stationId, hwy.id))).orderBy(persons.genNo).limit(1);
    await as("sp", "UNIT_OFFICER");
    const r = await assignInchargeAction(hwy.id, si!.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.username).toMatch(/^demo-dist-|^demo-/);
    expect(r.data.tempPassword).toBeTruthy();
    const [login] = await db.select().from(users).where(eq(users.personId, si!.id));
    expect(login!.mustChangePassword).toBe(true);
    const ois = await db.select().from(roleAssignments).where(and(eq(roleAssignments.role, "OFFICE_INCHARGE"), eq(roleAssignments.stationId, hwy.id)));
    expect(ois).toHaveLength(1);
    expect(ois[0]!.userId).toBe(login!.id);
    expect((await station("PS-HWY")).inchargePersonId).toBe(si!.id);
  });

  it("points: a Component Officer can add a point; validation errors come back per field", async () => {
    await as("dsp1");
    const bad = await savePointAction(null, { name: "x", location: { lat: 200, lng: 80 }, defaultPriority: 9, defaultIntensity: "high", defaultMobility: "static", genderReq: "any", isActive: true });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "location.lat", "defaultPriority"]));
    const ok = await savePointAction(null, { name: "Test point", location: { lat: 16.5, lng: 80.6 }, defaultPriority: 2, defaultIntensity: "low", defaultMobility: "static", genderReq: "female", isActive: true });
    expect(ok).toMatchObject({ ok: true });
  });

  it("points: an Office Incharge has no permission to manage the library", async () => {
    await as("sho.town1");
    const r = await deletePointAction("00000000-0000-0000-0000-000000000000");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
  });

  it("equipment: working can never exceed total", async () => {
    await as("sp", "UNIT_OFFICER");
    const t1 = await station("PS-T1");
    const r = await saveStockAction(null, { stationId: t1.id, equipmentTypeId: "00000000-0000-0000-0000-000000000000", total: 2, working: 5 });
    expect(r).toMatchObject({ ok: false, fieldErrors: { working: expect.any(String) } });
  });
});
