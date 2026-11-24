import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import { actor } from "../support/act-as";
import { actAs, planInPlacement } from "../support/plan-fixtures";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { insertUserWithPassword } from "@/lib/auth/accounts";
import { loadUser } from "@/lib/auth/session";
import { createDb, type Db } from "@/lib/db/client";
import { roleAssignments, units } from "@/lib/db/schema";
import { listPersons, listPoints, listStations, listTransfers } from "@/lib/queries/masters";
import { getPlanDetail, listPlans } from "@/lib/queries/plans";
import { searchPersons } from "@/lib/queries/persons";
import { getSourcing } from "@/lib/queries/sourcing";
import { scopedRoster } from "@/lib/queries/execution";
import { listTasks } from "@/lib/queries/office";
import { getUnitDashboard } from "@/lib/queries/dashboard";
import { moveAction } from "@/app/(app)/plans/[planId]/placement/actions";
import { savePointAction } from "@/app/(app)/masters/points/actions";

/** A Unit Officer of another district must not see or change anything of the demo district. */
describe.skipIf(!url)("unit isolation", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let named: string[] = [];

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    ({ planId, named } = await planInPlacement(db, { title: "Isolation", day: "2027-03-01", pc: 2, hc: 1 }));
    const [north] = await db.select().from(units).where(eq(units.code, "NORTH-DIST"));
    const { userId } = await insertUserWithPassword(db, { username: "sp.north.test", name: "North SP", password: "Strong@Pass123" });
    await db.insert(roleAssignments).values({ userId, role: "UNIT_OFFICER", unitId: north!.id });
    actor.current = await loadUser(db, userId, null);
  }, 120_000);
  afterAll(async () => end?.());

  it("sees no persons, stations, points, transfers or plans of another unit", async () => {
    const u = actor.current!;
    expect(await listPersons(u)).toEqual([]);
    expect(await listStations(u)).toEqual([]);
    expect(await listPoints(u)).toEqual([]);
    expect(await listTransfers(u)).toEqual([]);
    expect(await searchPersons(u, "")).toEqual([]);
    expect(await listPlans(u, "ongoing")).toEqual([]);
  });

  it("is refused when opening another unit's plan, sourcing or roster directly", async () => {
    const u = actor.current!;
    await expect(getPlanDetail(u, planId)).rejects.toThrow(/another unit/);
    await expect(getSourcing(u, planId)).rejects.toThrow(/another unit/);
    await expect(scopedRoster(u, planId)).rejects.toThrow(/another unit/);
  });

  it("can't change another unit's data", async () => {
    expect(await moveAction(planId, { personId: named[0]!, toSlotId: null, expectedVersion: 0 })).toMatchObject({ ok: false });
    // Writes land in the caller's own unit only.
    const r = await savePointAction(null, { name: "North point", location: { lat: 17, lng: 80 }, defaultPriority: 3, defaultIntensity: "low", defaultMobility: "static", genderReq: "any", isActive: true });
    expect(r.ok).toBe(true);
    await actAs(db, "sp", "UNIT_OFFICER");
    expect((await listPoints(actor.current!)).some((p) => p.name === "North point")).toBe(false);
  });

  it("office data and the dashboard stay within the unit", async () => {
    await actAs(db, "om");
    const omTasks = await listTasks(actor.current!);
    const [north] = await db.select().from(units).where(eq(units.code, "NORTH-DIST"));
    const d = await getUnitDashboard(north!.id);
    expect(d?.totals.persons ?? 0).toBe(0);
    expect(omTasks.every((t) => t.unitId === actor.current!.unitId)).toBe(true);
  });
});
