import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import "../support/act-as";
import { actAs, ok, planInPlacement } from "../support/plan-fixtures";
import { and, eq, like, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { assignments, notificationsOutbox, persons, planPublications, plans, slots } from "@/lib/db/schema";
import { diffSnapshots } from "@/lib/placement/publish";
import { planLedger } from "@/lib/sourcing/server";
import { dropSlotAction, lockAction, moveAction, publishAction, suggestAction } from "@/app/(app)/plans/[planId]/placement/actions";

describe.skipIf(!url)("placement board and publish", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let componentId = "";
  const version = async () => (await db.select({ v: plans.placementVersion }).from(plans).where(eq(plans.id, planId)))[0]!.v;
  const dutyMessages = async () => (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(notificationsOutbox).where(like(notificationsOutbox.template, "duty.%")))[0]!.n;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    ({ planId, componentId } = await planInPlacement(db, { title: "Placement test", day: "2027-01-15", pc: 5, hc: 2 }));
  }, 120_000);
  afterAll(async () => end?.());

  it("only the plan's own Component Officer (or the IO) can place", async () => {
    await actAs(db, "dsp2");
    expect(await suggestAction(planId, { componentId: null, expectedVersion: await version() })).toMatchObject({ ok: false, error: expect.stringMatching(/access/) });
    await actAs(db, "sho.town1");
    expect(await suggestAction(planId, { componentId: null, expectedVersion: await version() })).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
  });

  it("CO suggestion fills the slots with explained drafts and respects fitness on high-intensity points", async () => {
    await actAs(db, "dsp1");
    const r = ok(await suggestAction(planId, { componentId, expectedVersion: await version() }));
    expect(r.suggested).toBe(8); // 5 PC + 2 HC + 1 SI incharge
    expect(r.open).toBe(0);
    const rows = await db.select({ a: assignments, fitness: persons.fitness, intensity: slots.intensity }).from(assignments).innerJoin(persons, eq(persons.id, assignments.personId)).innerJoin(slots, eq(slots.id, assignments.slotId)).where(eq(assignments.planId, planId));
    expect(rows.every((x) => !(x.fitness === "light_duty_only" && x.intensity === "high"))).toBe(true);
    expect(rows.every((x) => x.a.source === "suggested")).toBe(true);
  });

  it("nothing is sent to officers before publish", async () => {
    expect(await dutyMessages()).toBe(0);
  });

  it("a stale board version is refused (concurrent edit)", async () => {
    const [a] = await db.select().from(assignments).where(eq(assignments.planId, planId)).limit(1);
    expect(await moveAction(planId, { personId: a!.personId, toSlotId: null, expectedVersion: (await version()) - 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/board changed/) });
  });

  it("moves, swaps and returns officers to the pool; the IO can lock and the CO can't move a locked officer", async () => {
    const pcs = await db
      .select({ a: assignments })
      .from(assignments)
      .innerJoin(slots, eq(slots.id, assignments.slotId))
      .where(and(eq(assignments.planId, planId), eq(slots.role, "member"), sql`${slots.rankId} = (select id from ranks where code = 'PC')`));
    const [x, y] = pcs.map((r) => r.a);
    // swap two PCs
    const swap = ok(await moveAction(planId, { personId: x!.personId, toSlotId: y!.slotId, expectedVersion: await version() }));
    expect(swap.swappedPersonId).toBe(y!.personId);
    expect((await db.select().from(assignments).where(eq(assignments.personId, y!.personId)))[0]!.slotId).toBe(x!.slotId);
    // rank rule: an HC can't take a PC slot
    const [hc] = await db.select({ a: assignments }).from(assignments).innerJoin(slots, eq(slots.id, assignments.slotId)).where(and(eq(assignments.planId, planId), sql`${slots.rankId} = (select id from ranks where code = 'HC')`)).limit(1);
    expect(await moveAction(planId, { personId: hc!.a.personId, toSlotId: x!.slotId, expectedVersion: await version() })).toMatchObject({ ok: false, error: expect.stringMatching(/needs PC/) });
    // IO locks; CO can't move
    await actAs(db, "addlsp");
    ok(await lockAction(planId, { slotId: x!.slotId, locked: true, expectedVersion: await version() }));
    await actAs(db, "dsp1");
    expect(await moveAction(planId, { personId: y!.personId, toSlotId: null, expectedVersion: await version() })).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) });
  });

  it("publishing notifies everyone the first time, then only officers whose posting changed", async () => {
    await actAs(db, "dsp1");
    expect(await publishAction(planId, { expectedVersion: await version() })).toMatchObject({ ok: false, error: expect.stringMatching(/permission/) });
    await actAs(db, "addlsp");
    const first = ok(await publishAction(planId, { expectedVersion: await version() }));
    expect(first).toMatchObject({ version: 1, placed: 8, notified: 8 });
    expect(await dutyMessages()).toBe(8);
    expect((await db.select().from(plans).where(eq(plans.id, planId)))[0]!.status).toBe("published");

    // Move one unlocked PC to the pool and drop the slot, then republish.
    const [free] = await db.select({ a: assignments }).from(assignments).innerJoin(slots, eq(slots.id, assignments.slotId)).where(and(eq(assignments.planId, planId), eq(assignments.locked, false), sql`${slots.rankId} = (select id from ranks where code = 'PC')`)).limit(1);
    ok(await moveAction(planId, { personId: free!.a.personId, toSlotId: null, expectedVersion: await version() }));
    ok(await dropSlotAction(planId, { slotId: free!.a.slotId, dropped: true, expectedVersion: await version() }));
    expect((await planLedger(db, planId)).find((r) => r.rankCode === "PC")!.required).toBe(4);
    const second = ok(await publishAction(planId, { expectedVersion: await version() }));
    expect(second).toMatchObject({ version: 2, placed: 7, notified: 1 });
    expect(await dutyMessages()).toBe(9);
    const pubs = await db.select().from(planPublications).where(eq(planPublications.planId, planId));
    expect(pubs.find((p) => p.version === 2)!.diff).toEqual({ added: 0, moved: 0, removed: 1, unchanged: 7 });
  });

  it("snapshot diff classifies added, moved, removed", () => {
    const d = diffSnapshots(
      [
        { personId: "a", slotId: "1" },
        { personId: "b", slotId: "2" },
        { personId: "c", slotId: "3" },
      ],
      [
        { personId: "a", slotId: "1" },
        { personId: "b", slotId: "3" },
        { personId: "d", slotId: "2" },
      ],
    );
    expect(d).toEqual({ added: ["d"], moved: ["b"], removed: ["c"], unchanged: 1 });
  });
});
