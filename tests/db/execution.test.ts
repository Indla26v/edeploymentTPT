import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import "../support/act-as";
import { actAs, ok, planInPlacement } from "../support/plan-fixtures";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { accommodationAllotments, accommodations, equipmentStock, equipmentTypes, persons, plans, stations } from "@/lib/db/schema";
import { signCheckinToken } from "@/lib/execution/qr";
import { getRoster, summarize } from "@/lib/execution/server";
import { absentAlerts } from "@/lib/execution/alerts";
import { publishAction, suggestAction } from "@/app/(app)/plans/[planId]/placement/actions";
import { allocateEquipmentAction, autoAllotAction, issueReturnAction, markAttendanceAction, setPlanStageAction } from "@/app/(app)/plans/[planId]/execution/actions";
import { POST as checkin } from "@/app/api/checkin/route";
import { GET as idCards } from "@/app/api/plans/[planId]/id-cards/route";

describe.skipIf(!url)("execution: check-in, live, documents, lodging, equipment", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let componentId = "";
  let named: string[] = [];
  const post = (body: unknown) => checkin(new Request("http://x/api/checkin", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    ({ planId, componentId, named } = await planInPlacement(db, { title: "Execution test", day: "2027-02-10", pc: 4, hc: 2 }));
    await actAs(db, "dsp1");
    const v = (await db.select().from(plans).where(eq(plans.id, planId)))[0]!.placementVersion;
    ok(await suggestAction(planId, { componentId, expectedVersion: v }));
    await actAs(db, "addlsp");
    ok(await publishAction(planId, { expectedVersion: v + 1 }));
  }, 120_000);
  afterAll(async () => end?.());

  it("QR check-in: valid token records attendance, far away is flagged, tampered tokens are refused", async () => {
    const t = signCheckinToken(planId, named[0]!);
    const r1 = await post({ token: t, event: "check_in", lat: 16.5001, lng: 80.6001 });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ ok: true, flagged: false });
    const r2 = await post({ token: signCheckinToken(planId, named[1]!), event: "check_in", lat: 16.6, lng: 80.7 });
    expect(await r2.json()).toMatchObject({ ok: true, flagged: true });
    const forged = `${t.split(".")[0]}.AAAAAAAAAAAAAAAA`;
    expect((await post({ token: forged, event: "check_in" })).status).toBe(403);
    const notOnRoster = signCheckinToken(planId, "00000000-0000-4000-8000-000000000000");
    expect((await post({ token: notOnRoster, event: "check_in" })).status).toBe(409);
  });

  it("live counts follow check-ins; before reporting time the rest are pending, after it absent", async () => {
    const early = summarize((await getRoster(db, planId, new Date("2027-02-10T03:00:00Z"))).rows);
    expect(early).toMatchObject({ total: 7, present: 2, pending: 5, absent: 0 });
    await actAs(db, "addlsp");
    ok(await markAttendanceAction(planId, { personId: named[0]!, event: "check_out" }));
    const later = summarize((await getRoster(db, planId, new Date("2027-02-10T06:00:00Z"))).rows);
    expect(later).toMatchObject({ present: 1, checked_out: 1, absent: 5 });
  });

  it("live plans raise one absentee alert per hour", async () => {
    await actAs(db, "addlsp");
    ok(await setPlanStageAction(planId, "live"));
    const at = new Date("2027-02-10T06:00:00Z");
    expect(await db.transaction((tx) => absentAlerts(tx, at))).toBe(1);
    expect(await db.transaction((tx) => absentAlerts(tx, new Date(at.getTime() + 10 * 60e3)))).toBe(0);
  });

  it("ID cards render as a PDF for the plan's officers", async () => {
    await actAs(db, "dsp1");
    const res = await idCards(new Request(`http://localhost/api/plans/${planId}/id-cards?layout=6`), { params: Promise.resolve({ planId }) } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    await actAs(db, "dsp2");
    const other = await idCards(new Request(`http://localhost/api/plans/${planId}/id-cards`), { params: Promise.resolve({ planId }) } as never);
    expect(other.status).toBe(404);
  });

  it("auto-allotment respects gender restrictions and capacity", async () => {
    await actAs(db, "sp", "UNIT_OFFICER");
    const r = ok(await autoAllotAction(planId, { fromDate: "2027-02-09", toDate: "2027-02-10" }));
    expect(r.allotted).toBe(7);
    const rows = await db.select({ gender: persons.gender, allowed: accommodations.genderAllowed, cap: accommodations.capacity, lodging: accommodations.id }).from(accommodationAllotments).innerJoin(persons, eq(persons.id, accommodationAllotments.personId)).innerJoin(accommodations, eq(accommodations.id, accommodationAllotments.accommodationId)).where(eq(accommodationAllotments.planId, planId));
    expect(rows.every((x) => x.allowed === "any" || x.allowed === x.gender)).toBe(true);
    // A second run houses nobody twice.
    expect(ok(await autoAllotAction(planId, { fromDate: "2027-02-09", toDate: "2027-02-10" })).allotted).toBe(0);
  });

  it("equipment: can't draw more than the station's free working stock; the station issues and takes back", async () => {
    const [t1] = await db.select().from(stations).where(eq(stations.code, "PS-T1"));
    const [stock] = await db.select({ s: equipmentStock, name: equipmentTypes.name }).from(equipmentStock).innerJoin(equipmentTypes, eq(equipmentTypes.id, equipmentStock.equipmentTypeId)).where(and(eq(equipmentStock.stationId, t1!.id))).limit(1);
    const w = stock!.s.working;
    await actAs(db, "sp", "UNIT_OFFICER");
    expect(await allocateEquipmentAction(planId, { equipmentTypeId: stock!.s.equipmentTypeId, stationId: t1!.id, quantity: w + 1, planComponentId: null })).toMatchObject({ ok: false, error: expect.stringMatching(/Only \d+ working/) });
    ok(await allocateEquipmentAction(planId, { equipmentTypeId: stock!.s.equipmentTypeId, stationId: t1!.id, quantity: w, planComponentId: null }));
    expect(await allocateEquipmentAction(planId, { equipmentTypeId: stock!.s.equipmentTypeId, stationId: t1!.id, quantity: 1, planComponentId: null })).toMatchObject({ ok: false, error: expect.stringMatching(/Only 0 working/) });
    const [alloc] = await db.execute<{ id: string }>(`select id from equipment_allocations where plan_id = '${planId}'` as never).then((r) => r.rows);
    await actAs(db, "sho.town2");
    expect(await issueReturnAction(alloc!.id, { action: "issue" })).toMatchObject({ ok: false, error: expect.stringMatching(/another station/) });
    await actAs(db, "sho.town1");
    expect(await issueReturnAction(alloc!.id, { action: "return" })).toMatchObject({ ok: false, error: expect.stringMatching(/Issue it/) });
    ok(await issueReturnAction(alloc!.id, { action: "issue" }));
    expect(await issueReturnAction(alloc!.id, { action: "return", returnedQty: w + 5 })).toMatchObject({ ok: false });
    ok(await issueReturnAction(alloc!.id, { action: "return", returnedQty: w }));
  });

  it("completing the plan closes check-in", async () => {
    await actAs(db, "addlsp");
    ok(await setPlanStageAction(planId, "completed"));
    const r = await post({ token: signCheckinToken(planId, named[2]!), event: "check_in" });
    expect(r.status).toBe(409);
  });
});
