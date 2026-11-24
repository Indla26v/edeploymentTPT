import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

import { actor } from "../support/act-as";
import { and, eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { loadUser } from "@/lib/auth/session";
import type { Role } from "@/lib/authz/roles";
import { createDb, type Db } from "@/lib/db/client";
import { planComponents, planEvents, planPoints, plans, pointRequirements, persons, preferences, ranks, slots, stations, users } from "@/lib/db/schema";
import { reusePlanAction, savePlanDetailsAction, savePlanTeamAction, sendToCosAction } from "@/app/(app)/plans/actions";
import { saveProposalAction, submitProposalAction } from "@/app/(app)/plans/[planId]/components/[componentId]/actions";
import { keepPreferenceAction, returnComponentAction, sendToUoAction, setCountAction } from "@/app/(app)/plans/[planId]/consolidate/actions";
import type { ProposalInput } from "@/app/(app)/plans/[planId]/components/[componentId]/schema";

describe.skipIf(!url)("plan → propose → consolidate", () => {
  let db: Db;
  let end: () => Promise<void>;
  let planId = "";
  let compA = "";
  let compB = "";
  const rank = new Map<string, string>();
  let preferred = "";

  const as = async (username: string, role?: Role) => {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    actor.current = await loadUser(db, u!.id, role ?? null);
  };
  const personOf = async (username: string) => (await db.select({ personId: users.personId }).from(users).where(eq(users.username, username)))[0]!.personId!;
  const ok = <T,>(r: { ok: true; data: T } | { ok: false; error: string }) => {
    if (!r.ok) throw new Error(r.error);
    return r.data;
  };
  const proposal = (pc: number, opts: { pref?: string } = {}): ProposalInput => ({
    sectors: [
      {
        key: "s1",
        name: "Sector 1",
        shiftId: null,
        batches: 2,
        instructions: "Be alert",
        imageUrl: null,
        inchargeRankId: rank.get("SI")!,
        liaisonRankId: null,
        points: [
          { key: "p1", name: "Main gate", libraryPointId: null, lat: 16.5, lng: 80.6, priority: 1, intensity: "high", mobility: "static", genderReq: "any", requirements: [{ batch: 1, rankId: rank.get("PC")!, count: pc, mergeGroup: "A" }, { batch: 2, rankId: rank.get("PC")!, count: 2 }] },
          { key: "p2", name: "Side gate", libraryPointId: null, lat: 16.51, lng: 80.61, priority: 2, intensity: "medium", mobility: "static", genderReq: "any", requirements: [{ batch: 1, rankId: rank.get("PC")!, count: 1, mergeGroup: "A" }, { batch: 1, rankId: rank.get("HC")!, count: 1 }] },
        ],
      },
    ],
    logisticsNote: "Two buses",
    equipment: [],
    preferences: opts.pref ? [{ kind: "person", unitId: null, stationId: null, personId: opts.pref, pointKey: "p1", rankId: null, count: null, note: null }] : [],
  });

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
    for (const r of await db.select({ id: ranks.id, code: ranks.code }).from(ranks)) rank.set(r.code, r.id);
    const [p] = await db.select({ id: persons.id }).from(persons).innerJoin(stations, eq(stations.id, persons.stationId)).where(eq(stations.code, "PS-T2")).limit(1);
    preferred = p!.id;
  }, 60_000);
  afterAll(async () => end?.());

  it("IO initiates a plan with two components; a CO login is created when needed", async () => {
    await as("addlsp");
    const start = new Date("2026-12-10T04:00:00Z");
    planId = ok(
      await savePlanDetailsAction(null, {
        title: "Test Festival",
        eventType: "Festival",
        venue: "Temple",
        description: null,
        location: { lat: 16.5, lng: 80.6 },
        proposalDueAt: null,
        windows: [{ label: "Day 1", startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 8 * 3600e3).toISOString() }],
      }),
    ).id;
    const [newCo] = await db.select({ id: persons.id }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId)).where(and(eq(ranks.code, "CI"), sql`${persons.id} not in (select person_id from users where person_id is not null)`)).limit(1);
    const team = ok(
      await savePlanTeamAction(planId, {
        overallInchargePersonId: await personOf("sp"),
        components: [
          { id: null, componentId: null, name: "Law & Order", coPersonId: await personOf("dsp1"), inchargePersonId: null },
          { id: null, componentId: null, name: "Traffic", coPersonId: newCo!.id, inchargePersonId: null },
        ],
      }),
    );
    expect(team.logins).toHaveLength(1);
    expect(team.logins[0]!.tempPassword).toBeTruthy();
    const comps = await db.select().from(planComponents).where(eq(planComponents.planId, planId)).orderBy(planComponents.displayOrder);
    compA = comps[0]!.id;
    compB = comps[1]!.id;
    expect(ok(await sendToCosAction(planId))).toBeUndefined();
    expect((await db.select().from(plans).where(eq(plans.id, planId)))[0]!.status).toBe("proposing");
  });

  it("a CO can't open another CO's component", async () => {
    await as("dsp2");
    expect(await saveProposalAction(compA, proposal(3))).toMatchObject({ ok: false, error: expect.stringMatching(/access|another/i) });
  });

  it("CO proposes with merged points; submit builds one slot per officer and locks the proposal", async () => {
    await as("dsp1");
    ok(await saveProposalAction(compA, proposal(3, { pref: preferred })));
    const r = ok(await submitProposalAction(compA));
    // batch 1: merge A (max(3,1)=3 PC) + 1 HC; batch 2: 2 PC; sector incharge × 2 batches
    expect(r.slots).toBe(3 + 1 + 2 + 2);
    expect(r.allIn).toBe(false);
    expect(await saveProposalAction(compA, proposal(4))).toMatchObject({ ok: false, error: expect.stringMatching(/submitted/) });
  });

  it("zero-rank points block submission", async () => {
    const [u] = await db.select({ userId: planComponents.coUserId }).from(planComponents).where(eq(planComponents.id, compB));
    actor.current = await loadUser(db, u!.userId!, null);
    const bad = proposal(0);
    bad.sectors[0]!.points[1]!.requirements = [];
    bad.sectors[0]!.points[0]!.requirements = [];
    ok(await saveProposalAction(compB, bad));
    expect(await submitProposalAction(compB)).toMatchObject({ ok: false, error: expect.stringMatching(/zero-rank/) });
    ok(await saveProposalAction(compB, proposal(2, { pref: preferred })));
    expect(ok(await submitProposalAction(compB)).allIn).toBe(true);
    expect((await db.select().from(plans).where(eq(plans.id, planId)))[0]!.status).toBe("consolidating");
  });

  it("IO corrects a count inline: slots change, the component stays submitted and the CO is informed", async () => {
    await as("addlsp");
    const before = (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(slots).where(eq(slots.planComponentId, compA)))[0]!.n;
    const [gate] = await db.select().from(planPoints).where(and(eq(planPoints.planComponentId, compA), eq(planPoints.name, "Main gate")));
    ok(await setCountAction({ pointId: gate!.id, batch: 2, rankId: rank.get("PC")!, count: 5 }));
    const after = (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(slots).where(eq(slots.planComponentId, compA)))[0]!.n;
    expect(after).toBe(before + 3);
    expect((await db.select().from(planComponents).where(eq(planComponents.id, compA)))[0]!.status).toBe("submitted");
    expect((await db.select().from(planEvents).where(and(eq(planEvents.planId, planId), eq(planEvents.kind, "count_changed")))).length).toBe(1);
  });

  it("the same officer preferred by two components: the IO keeps one", async () => {
    const prefs = await db.select().from(preferences).where(eq(preferences.planId, planId));
    expect(prefs.filter((p) => p.personId === preferred)).toHaveLength(2);
    ok(await keepPreferenceAction(prefs.find((p) => p.planComponentId === compB)!.id));
    const after = await db.select().from(preferences).where(eq(preferences.planId, planId));
    expect(after.find((p) => p.planComponentId === compA)!.status).toBe("dropped");
    expect(after.find((p) => p.planComponentId === compB)!.status).toBe("active");
  });

  it("a returned component blocks sending to the UO until resubmitted", async () => {
    ok(await returnComponentAction(compA, "Add one more HC at side gate"));
    expect(await sendToUoAction(planId)).toMatchObject({ ok: false, error: expect.stringMatching(/Law & Order/) });
    await as("dsp1");
    ok(await saveProposalAction(compA, proposal(3)));
    ok(await submitProposalAction(compA));
  });

  it("send to UO accepts everything and moves the plan to sourcing; counts are then frozen", async () => {
    await as("addlsp");
    const r = ok(await sendToUoAction(planId));
    expect(r.men).toBeGreaterThan(0);
    expect(r.selfUo).toBe(false);
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
    expect(plan!.status).toBe("sourcing");
    const comps = await db.select().from(planComponents).where(eq(planComponents.planId, planId));
    expect(comps.every((c) => c.status === "accepted")).toBe(true);
    const [gate] = await db.select().from(planPoints).where(and(eq(planPoints.planComponentId, compA), eq(planPoints.name, "Main gate")));
    expect(await setCountAction({ pointId: gate!.id, batch: 1, rankId: rank.get("PC")!, count: 9 })).toMatchObject({ ok: false });
  });

  it("reuse copies to the chosen depth", async () => {
    const shallow = ok(await reusePlanAction(planId, "components")).id;
    const deep = ok(await reusePlanAction(planId, "proposals")).id;
    const countReq = async (id: string) => (await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(pointRequirements).where(eq(pointRequirements.planId, id)))[0]!.n;
    expect(await countReq(shallow)).toBe(0);
    expect(await countReq(deep)).toBe(await countReq(planId));
    const deepComps = await db.select().from(planComponents).where(eq(planComponents.planId, deep));
    expect(deepComps.map((c) => c.status)).toEqual(["in_progress", "in_progress"]);
    const drafts = await db.select().from(plans).where(inArray(plans.id, [shallow, deep]));
    expect(drafts.every((p) => p.status === "draft" && p.reusedFromPlanId === planId)).toBe(true);
  });
});
