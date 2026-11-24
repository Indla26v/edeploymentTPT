import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import { actor } from "../support/act-as";
import { actAs, ok, planInSourcing } from "../support/plan-fixtures";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { createDb, type Db } from "@/lib/db/client";
import { forceRequests, persons, planComponents, planPersonnel, plans, ranks, slots, stations } from "@/lib/db/schema";
import { autoAcceptDue, planLedger, stationFree } from "@/lib/sourcing/server";
import { drainOutbox } from "@/lib/server/outbox";
import { notificationsOutbox } from "@/lib/db/schema";
import { acceptShortfallAction, proceedToPlacementAction, sendRequestsAction } from "@/app/(app)/plans/[planId]/sourcing/actions";
import { respondAction, saveRollAction } from "@/app/(app)/station/requests/actions";
import { getSourcing } from "@/lib/queries/sourcing";

describe.skipIf(!url)("force sourcing and the reconciliation ledger", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let rank: Map<string, string>;
  const st = new Map<string, string>();
  const deadline = () => new Date(Date.now() + 3600e3).toISOString();
  const ledgerOf = async (code: string) => (await planLedger(db, planId)).find((r) => r.rankCode === code)!;
  const requestFor = async (code: string, kind: "initial" | "top_up" = "initial") =>
    (await db.select().from(forceRequests).where(and(eq(forceRequests.planId, planId), eq(forceRequests.targetStationId, st.get(code)!), eq(forceRequests.kind, kind))))[0]!;
  const officers = async (code: string, rk: string, n: number) =>
    (
      await db
        .select({ id: persons.id })
        .from(persons)
        .innerJoin(ranks, eq(ranks.id, persons.rankId))
        .where(and(eq(persons.stationId, st.get(code)!), eq(ranks.code, rk), eq(persons.availability, "available"), sql`${persons.id} not in (select incharge_person_id from stations where incharge_person_id is not null)`))
        .orderBy(persons.genNo)
        .limit(n)
    ).map((p) => p.id);

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    for (const s of await db.select({ id: stations.id, code: stations.code }).from(stations)) st.set(s.code, s.id);
    ({ planId, rank } = await planInSourcing(db, { title: "Sourcing test", day: "2026-12-20", pc: 6, hc: 2 }));
  }, 90_000);
  afterAll(async () => end?.());

  it("pre-fills a distribution that covers the need from nearby stations", async () => {
    await actAs(db, "sp", "UNIT_OFFICER");
    const s = await getSourcing(actor.current!, planId);
    expect(s.need[rank.get("PC")!]).toBe(6);
    const pcSuggested = Object.values(s.suggestion.grid).reduce((a, g) => a + (g[rank.get("PC")!] ?? 0), 0);
    expect(pcSuggested).toBe(6);
  });

  it("UO sends requests; a station commits less with a reason and names its officers", async () => {
    ok(
      await sendRequestsAction(planId, {
        deadlineAt: deadline(),
        note: null,
        kind: "initial",
        grid: [
          { stationId: st.get("PS-T1")!, lines: [{ rankId: rank.get("PC")!, requested: 4 }, { rankId: rank.get("HC")!, requested: 2 }, { rankId: rank.get("SI")!, requested: 1 }] },
          { stationId: st.get("PS-T2")!, lines: [{ rankId: rank.get("PC")!, requested: 2 }] },
        ],
      }),
    );
    await actAs(db, "sho.town1");
    expect(await respondAction((await requestFor("PS-T1")).id, { lines: [{ rankId: rank.get("PC")!, committed: 2, reason: null }, { rankId: rank.get("HC")!, committed: 2, reason: null }, { rankId: rank.get("SI")!, committed: 1, reason: null }], shortReason: null })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/reason/),
    });
    expect(ok(await respondAction((await requestFor("PS-T1")).id, { lines: [{ rankId: rank.get("PC")!, committed: 2, reason: "Men on station duty" }, { rankId: rank.get("HC")!, committed: 2, reason: null }, { rankId: rank.get("SI")!, committed: 1, reason: null }], shortReason: null })).status).toBe("partial");
    // An OI cannot answer another station's request.
    expect(await respondAction((await requestFor("PS-T2")).id, { lines: [{ rankId: rank.get("PC")!, committed: 2, reason: null }], shortReason: null })).toMatchObject({ ok: false, error: expect.stringMatching(/another station/) });

    const roll = [...(await officers("PS-T1", "PC", 3))];
    expect(await saveRollAction((await requestFor("PS-T1")).id, roll)).toMatchObject({ ok: false, error: expect.stringMatching(/committed 2/) });
    ok(await saveRollAction((await requestFor("PS-T1")).id, [...roll.slice(0, 2), ...(await officers("PS-T1", "HC", 2)), ...(await officers("PS-T1", "SI", 1))]));
    expect((await ledgerOf("PC")).named).toBe(2);
    expect((await ledgerOf("PC")).gap).toBe(4);
  });

  it("availability excludes officers named and men promised to an overlapping plan", async () => {
    const [p] = await db.select().from(plans).where(eq(plans.id, planId));
    expect(p).toBeTruthy();
    const range = "[2026-12-20T00:00:00.000Z,2026-12-21T00:00:00.000Z)";
    const later = "[2027-01-20T00:00:00.000Z,2027-01-21T00:00:00.000Z)";
    const [t2now, t2later] = await Promise.all([stationFree(db, p!.unitId, range), stationFree(db, p!.unitId, later)]);
    // PS-T2 owes 2 PC (unanswered) on the 20th, nothing in January.
    expect((t2later.get(st.get("PS-T2")!)![rank.get("PC")!] ?? 0) - (t2now.get(st.get("PS-T2")!)![rank.get("PC")!] ?? 0)).toBe(2);
    // PS-T1 named 2 PC and still owes nothing more (committed 2 = named 2).
    expect((t2later.get(st.get("PS-T1")!)![rank.get("PC")!] ?? 0) - (t2now.get(st.get("PS-T1")!)![rank.get("PC")!] ?? 0)).toBe(2);
  });

  it("top-up and accept-shortfall settle the gap without touching the IO / CO plan", async () => {
    const slotsBefore = (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(slots).where(eq(slots.planId, planId)))[0]!.n;
    await actAs(db, "sp", "UNIT_OFFICER");
    expect(await proceedToPlacementAction(planId)).toMatchObject({ ok: false, error: expect.stringMatching(/PC short by 4/) });
    ok(await sendRequestsAction(planId, { deadlineAt: deadline(), note: "Top-up", kind: "top_up", grid: [{ stationId: st.get("PS-MKT")!, lines: [{ rankId: rank.get("PC")!, requested: 1 }] }] }));
    expect((await ledgerOf("PC")).pendingTopUp).toBe(1);
    expect(ok(await acceptShortfallAction(planId, { rankId: rank.get("PC")!, count: 9, reason: "Election duty elsewhere" })).accepted).toBe(4); // clamped to the gap
    // Nothing went back to the IO / COs.
    expect((await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(slots).where(eq(slots.planId, planId)))[0]!.n).toBe(slotsBefore);
    expect((await db.select().from(planComponents).where(eq(planComponents.planId, planId))).map((c) => c.status)).toEqual(["accepted"]);
    // Still waiting on replies → can't proceed.
    expect(await proceedToPlacementAction(planId)).toMatchObject({ ok: false, error: expect.stringMatching(/awaiting/) });
  });

  it("unanswered requests are auto-accepted at the deadline, then the plan moves to placement", async () => {
    await actAs(db, "sho.town2");
    ok(await respondAction((await requestFor("PS-T2")).id, { lines: [{ rankId: rank.get("PC")!, committed: 2, reason: null }], shortReason: null }));
    const n = await db.transaction((tx) => autoAcceptDue(tx, new Date(Date.now() + 2 * 3600e3)));
    expect(n).toBe(1);
    expect((await requestFor("PS-MKT", "top_up")).status).toBe("auto_accepted");
    const pc = await ledgerOf("PC");
    expect(pc.committed).toBe(5); // 2 + 2 + 1 auto
    expect(pc.state).toBe("settled");
    expect(pc.gap).toBe(0);
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await proceedToPlacementAction(planId));
    expect((await db.select().from(plans).where(eq(plans.id, planId)))[0]!.status).toBe("placement");
  });

  it("the database refuses to book one officer on two overlapping plans", async () => {
    const [someone] = await db.select().from(planPersonnel).where(eq(planPersonnel.planId, planId)).limit(1);
    const other = await planInSourcing(db, { title: "Overlap test", day: "2026-12-20", pc: 1, hc: 1 });
    await expect(
      db.insert(planPersonnel).values({ planId: other.planId, personId: someone!.personId, stationId: someone!.stationId, rankId: someone!.rankId, dutyWindow: "[2026-12-20T06:00:00.000Z,2026-12-20T08:00:00.000Z)" }),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
    // The roll action explains it in plain words.
    await actAs(db, "sp", "UNIT_OFFICER");
    ok(await sendRequestsAction(other.planId, { deadlineAt: deadline(), note: null, kind: "initial", grid: [{ stationId: someone!.stationId, lines: [{ rankId: someone!.rankId, requested: 1 }] }] }));
    await actAs(db, "sho.town1");
    const [req] = await db.select().from(forceRequests).where(eq(forceRequests.planId, other.planId));
    ok(await respondAction(req!.id, { lines: [{ rankId: someone!.rankId, committed: 1, reason: null }], shortReason: null }));
    expect(await saveRollAction(req!.id, [someone!.personId])).toMatchObject({ ok: false, error: expect.stringMatching(/already on “Sourcing test”/) });
  });

  it("the outbox drains through the console adapter (nothing is queued twice)", async () => {
    const pending = (await db.select().from(notificationsOutbox).where(eq(notificationsOutbox.status, "pending"))).length;
    expect(pending).toBeGreaterThan(0);
    const r = await drainOutbox(db, 1000);
    expect(r).toEqual({ sent: pending, failed: 0 });
    expect(await drainOutbox(db, 1000)).toEqual({ sent: 0, failed: 0 });
  });
});
