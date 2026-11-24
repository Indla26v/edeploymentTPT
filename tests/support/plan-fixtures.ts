/** Builds a plan through the real Phase 4 actions, ready for force sourcing. Requires ./act-as to be imported first. */
import { eq } from "drizzle-orm";

import { actor } from "./act-as";
import { loadUser } from "@/lib/auth/session";
import type { Role } from "@/lib/authz/roles";
import type { Db } from "@/lib/db/client";
import { planComponents, ranks, users } from "@/lib/db/schema";
import { savePlanDetailsAction, savePlanTeamAction, sendToCosAction } from "@/app/(app)/plans/actions";
import { saveProposalAction, submitProposalAction } from "@/app/(app)/plans/[planId]/components/[componentId]/actions";
import { sendToUoAction } from "@/app/(app)/plans/[planId]/consolidate/actions";

export const ok = <T,>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

export async function actAs(db: Db, username: string, role?: Role) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  actor.current = await loadUser(db, u!.id, role ?? null);
}

/** A plan in `sourcing` needing PC ×pc, HC ×hc and one SI sector incharge, on the given day. */
export async function planInSourcing(db: Db, opts: { title: string; day: string; pc: number; hc: number }) {
  const rank = new Map((await db.select({ id: ranks.id, code: ranks.code }).from(ranks)).map((r) => [r.code, r.id]));
  await actAs(db, "addlsp");
  const planId = ok(
    await savePlanDetailsAction(null, { title: opts.title, eventType: "Festival", venue: "Ground", description: null, location: { lat: 16.5062, lng: 80.648 }, proposalDueAt: null, windows: [{ label: null, startsAt: `${opts.day}T04:00:00.000Z`, endsAt: `${opts.day}T12:00:00.000Z` }] }),
  ).id;
  const [dsp1] = await db.select({ personId: users.personId }).from(users).where(eq(users.username, "dsp1"));
  ok(await savePlanTeamAction(planId, { overallInchargePersonId: null, components: [{ id: null, componentId: null, name: "Main", coPersonId: dsp1!.personId!, inchargePersonId: null }] }));
  ok(await sendToCosAction(planId));
  const [comp] = await db.select().from(planComponents).where(eq(planComponents.planId, planId));
  await actAs(db, "dsp1");
  ok(
    await saveProposalAction(comp!.id, {
      sectors: [
        {
          key: "s",
          name: "Sector",
          shiftId: null,
          batches: 1,
          instructions: null,
          imageUrl: null,
          inchargeRankId: rank.get("SI")!,
          liaisonRankId: null,
          points: [{ key: "p", name: "Gate", libraryPointId: null, lat: 16.5, lng: 80.6, priority: 1, intensity: "high", mobility: "static", genderReq: "any", requirements: [{ batch: 1, rankId: rank.get("PC")!, count: opts.pc }, { batch: 1, rankId: rank.get("HC")!, count: opts.hc }] }],
        },
      ],
      logisticsNote: null,
      equipment: [],
      preferences: [],
    }),
  );
  ok(await submitProposalAction(comp!.id));
  await actAs(db, "addlsp");
  ok(await sendToUoAction(planId));
  return { planId, componentId: comp!.id, rank };
}
