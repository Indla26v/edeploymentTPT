import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import "../support/act-as";
import { actAs, ok } from "../support/plan-fixtures";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { planComponents, plans, ranks, users } from "@/lib/db/schema";
import { loadPlacement } from "@/lib/placement/server";
import { savePlanDetailsAction, savePlanTeamAction, sendToCosAction } from "@/app/(app)/plans/actions";
import { saveProposalAction, submitProposalAction } from "@/app/(app)/plans/[planId]/components/[componentId]/actions";
import { sendToUoAction } from "@/app/(app)/plans/[planId]/consolidate/actions";
import { suggestAction } from "@/app/(app)/plans/[planId]/placement/actions";

const time = async <T,>(label: string, fn: () => Promise<T>) => {
  const t0 = performance.now();
  const r = await fn();
  const ms = Math.round(performance.now() - t0);
  console.info(`${label}: ${ms} ms`);
  return { r, ms };
};

/** ~3,000 slots: 10 sectors × 30 points × 10 men (PC 7 + HC 2 + SI 1). */
describe.skipIf(!url)("load: a 3,000-slot plan", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";

  beforeAll(async () => {
    const c = createDb(url!, { max: 4 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
  }, 60_000);
  afterAll(async () => end?.());

  it("submits, consolidates, loads the board and suggests in reasonable time", async () => {
    const rank = new Map((await db.select({ id: ranks.id, code: ranks.code }).from(ranks)).map((r) => [r.code, r.id]));
    await actAs(db, "addlsp");
    planId = ok(await savePlanDetailsAction(null, { title: "Mega festival", eventType: "Festival", venue: null, description: null, location: { lat: 16.5, lng: 80.6 }, proposalDueAt: null, windows: [{ label: null, startsAt: "2027-04-01T00:00:00.000Z", endsAt: "2027-04-01T12:00:00.000Z" }] })).id;
    const [co] = await db.select({ personId: users.personId }).from(users).where(eq(users.username, "dsp1"));
    ok(await savePlanTeamAction(planId, { overallInchargePersonId: null, components: [{ id: null, componentId: null, name: "All", coPersonId: co!.personId!, inchargePersonId: null }] }));
    ok(await sendToCosAction(planId));
    const [comp] = await db.select().from(planComponents).where(eq(planComponents.planId, planId));
    await actAs(db, "dsp1");
    const sectors = Array.from({ length: 10 }, (_, s) => ({
      key: `s${s}`,
      name: `Sector ${s + 1}`,
      shiftId: null,
      batches: 1,
      instructions: null,
      imageUrl: null,
      inchargeRankId: null,
      liaisonRankId: null,
      points: Array.from({ length: 30 }, (_, p) => ({
        key: `s${s}p${p}`,
        name: `Point ${s}-${p}`,
        libraryPointId: null,
        lat: 16.5 + s / 100,
        lng: 80.6 + p / 1000,
        priority: (p % 4) + 1,
        intensity: (["high", "medium", "low"] as const)[p % 3]!,
        mobility: "static" as const,
        genderReq: "any" as const,
        requirements: [
          { batch: 1, rankId: rank.get("PC")!, count: 7 },
          { batch: 1, rankId: rank.get("HC")!, count: 2 },
          { batch: 1, rankId: rank.get("SI")!, count: 1 },
        ],
      })),
    }));
    const save = await time("save proposal (300 points)", async () => ok(await saveProposalAction(comp!.id, { sectors, logisticsNote: null, equipment: [], preferences: [] })));
    const submit = await time("submit → 3,000 slots", async () => ok(await submitProposalAction(comp!.id)));
    expect(submit.r.slots).toBe(3000);
    await actAs(db, "addlsp");
    const send = await time("send to UO", async () => ok(await sendToUoAction(planId)));
    // Skip sourcing: every available officer of the unit joins the pool.
    await db.execute(sql`insert into plan_personnel (plan_id, person_id, station_id, rank_id, duty_window)
      select ${planId}, p.id, p.station_id, p.rank_id, '[2027-04-01T00:00:00Z,2027-04-01T12:00:00Z)'::tstzrange from persons p where p.availability = 'available'`);
    await db.update(plans).set({ status: "placement" }).where(eq(plans.id, planId));
    const load = await time("load placement board", () => loadPlacement(db, planId));
    expect(load.r.slots).toHaveLength(3000);
    await actAs(db, "addlsp");
    const suggest = await time("suggest (IO, whole plan)", async () => ok(await suggestAction(planId, { componentId: null, expectedVersion: 0 })));
    expect(suggest.r.suggested).toBeGreaterThan(200);
    for (const x of [save, submit, send, load, suggest]) expect(x.ms).toBeLessThan(20_000);
  }, 120_000);
});
