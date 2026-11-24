import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import { actor } from "../support/act-as";
import { actAs, ok, planInSourcing } from "../support/plan-fixtures";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { escalations, forceRequests, persons, planPersonnel, ranks, stations, units } from "@/lib/db/schema";
import { planLedger } from "@/lib/sourcing/server";
import { getPlanDetail } from "@/lib/queries/plans";
import { escalateAction, proceedToPlacementAction, acceptShortfallAction, sendRequestsAction } from "@/app/(app)/plans/[planId]/sourcing/actions";
import { distributeToUnitsAction } from "@/app/(app)/dgp/actions";
import { distributeOwnStationsAction, respondUnitAction } from "@/app/(app)/requirements/actions";
import { respondAction, saveRollAction } from "@/app/(app)/station/requests/actions";

describe.skipIf(!url)("DGP / inter-district: escalate → distribute to units → other unit commits and names", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let rank: Map<string, string>;
  let north = "";
  let escalationId = "";
  let unitRequestId = "";
  const deadline = () => new Date(Date.now() + 3600e3).toISOString();
  const pc = async () => (await planLedger(db, planId)).find((r) => r.rankCode === "PC")!;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    ({ planId, rank } = await planInSourcing(db, { title: "Inter-district test", day: "2027-05-10", pc: 6, hc: 1 }));
    north = (await db.select().from(units).where(eq(units.code, "NORTH-DIST")))[0]!.id;
    const [t1] = await db.select().from(stations).where(eq(stations.code, "PS-T1"));
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await sendRequestsAction(planId, { deadlineAt: deadline(), note: null, kind: "initial", grid: [{ stationId: t1!.id, lines: [{ rankId: rank.get("PC")!, requested: 2 }, { rankId: rank.get("HC")!, requested: 1 }, { rankId: rank.get("SI")!, requested: 1 }] }] }));
    const [req] = await db.select().from(forceRequests).where(eq(forceRequests.planId, planId));
    await actAs(db, "sho.town1");
    ok(await respondAction(req!.id, { lines: [{ rankId: rank.get("PC")!, committed: 2, reason: null }, { rankId: rank.get("HC")!, committed: 1, reason: null }, { rankId: rank.get("SI")!, committed: 1, reason: null }], shortReason: null }));
  }, 120_000);
  afterAll(async () => end?.());

  it("the UO sends the remaining gap to the Chief Office", async () => {
    await actAs(db, "sp", "UNIT_OFFICER");
    expect((await pc()).gap).toBe(4);
    expect(ok(await escalateAction(planId, { note: "Festival peak", deadlineAt: deadline() })).men).toBe(4);
    expect(await escalateAction(planId, { note: null, deadlineAt: deadline() })).toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
    escalationId = (await db.select().from(escalations).where(eq(escalations.planId, planId)))[0]!.id;
  });

  it("only the DGP distributes, to other units, within what was asked", async () => {
    await actAs(db, "sp.north");
    expect(await distributeToUnitsAction(escalationId, { deadlineAt: deadline(), grid: [{ unitId: north, lines: [{ rankId: rank.get("PC")!, requested: 3 }] }] })).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
    await actAs(db, "dgp");
    const demo = (await db.select().from(units).where(eq(units.code, "DEMO-DIST")))[0]!.id;
    expect(await distributeToUnitsAction(escalationId, { deadlineAt: deadline(), grid: [{ unitId: demo, lines: [{ rankId: rank.get("PC")!, requested: 1 }] }] })).toMatchObject({ ok: false, error: expect.stringMatching(/other than/) });
    expect(await distributeToUnitsAction(escalationId, { deadlineAt: deadline(), grid: [{ unitId: north, lines: [{ rankId: rank.get("PC")!, requested: 9 }] }] })).toMatchObject({ ok: false, error: expect.stringMatching(/more than/) });
    ok(await distributeToUnitsAction(escalationId, { deadlineAt: deadline(), grid: [{ unitId: north, lines: [{ rankId: rank.get("PC")!, requested: 3 }] }] }));
    unitRequestId = (await db.select().from(forceRequests).where(and(eq(forceRequests.planId, planId), isNotNull(forceRequests.targetUnitId))))[0]!.id;
    // Pending top-up from the unit shows on the requesting ledger.
    expect((await pc()).pendingTopUp).toBe(3);
  });

  it("the other district commits; its commitment raises the requesting plan's committed count (no double counting)", async () => {
    await actAs(db, "sp.north");
    ok(await respondUnitAction(unitRequestId, { lines: [{ rankId: rank.get("PC")!, committed: 3, reason: null }] }));
    expect((await pc()).committed).toBe(5);
    const [nps1] = await db.select().from(stations).where(and(eq(stations.code, "NPS-1"), eq(stations.unitId, north)));
    expect(await distributeOwnStationsAction(unitRequestId, { deadlineAt: deadline(), grid: [{ stationId: nps1!.id, lines: [{ rankId: rank.get("PC")!, requested: 4 }] }] })).toMatchObject({ ok: false, error: expect.stringMatching(/committed 3/) });
    ok(await distributeOwnStationsAction(unitRequestId, { deadlineAt: deadline(), grid: [{ stationId: nps1!.id, lines: [{ rankId: rank.get("PC")!, requested: 3 }] }] }));
    const [child] = await db.select().from(forceRequests).where(eq(forceRequests.parentRequestId, unitRequestId));
    await actAs(db, "sho.north1");
    ok(await respondAction(child!.id, { lines: [{ rankId: rank.get("PC")!, committed: 3, reason: null }], shortReason: null }));
    const pcs = await db.select({ id: persons.id }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId)).where(and(eq(persons.stationId, nps1!.id), eq(ranks.code, "PC"), eq(persons.availability, "available"))).limit(3);
    ok(await saveRollAction(child!.id, pcs.map((p) => p.id)));
    // Still 5 committed (the child request isn't counted again); 3 names from the other district.
    const row = await pc();
    expect(row.committed).toBe(5);
    expect(row.named).toBe(3);
    const pool = await db.select({ unitId: persons.unitId }).from(planPersonnel).innerJoin(persons, eq(persons.id, planPersonnel.personId)).where(eq(planPersonnel.planId, planId));
    expect(pool.filter((p) => p.unitId === north)).toHaveLength(3);
  });

  it("the other district can't open the requesting plan beyond the request", async () => {
    await actAs(db, "sp.north");
    await expect(getPlanDetail(actor.current!, planId)).rejects.toThrow(/another unit/);
  });

  it("the same ledger settles the rest: accept 1 PC short and move to placement", async () => {
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await acceptShortfallAction(planId, { rankId: rank.get("PC")!, count: 1, reason: "Other districts stretched" }));
    ok(await proceedToPlacementAction(planId));
    const n = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(planPersonnel).where(eq(planPersonnel.planId, planId));
    expect(n[0]!.n).toBe(3);
  });
});
