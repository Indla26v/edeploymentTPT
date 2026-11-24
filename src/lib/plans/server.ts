import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import type { CurrentUser } from "../auth/session";
import { AuthzError, UserError, assertUnit, isStateLevel } from "../authz/authorize";
import { planComponents, planEvents, planPoints, plans, pointRequirements, sectors, slotPoints, slots } from "../db/schema";
import { buildSlots } from "../workflow/slots";
import type { ComponentStatus, PlanStatus } from "../workflow/plan";

export type PlanRow = typeof plans.$inferSelect;
export type ComponentRow = typeof planComponents.$inferSelect;

/** True when the active role works on whole plans of a unit (UO / IO / state roles). */
export function seesWholePlans(user: CurrentUser): boolean {
  return isStateLevel(user) || user.activeRole === "UNIT_OFFICER" || user.activeRole === "INITIATING_OFFICER";
}

/** Loads a plan the user may see, or throws. COs see plans in which they lead a component. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadPlan(db: DbOrTx, user: CurrentUser, planId: string, opts: { forUpdate?: boolean } = {}): Promise<PlanRow> {
  if (!UUID.test(planId)) throw new UserError("That plan doesn't exist.");
  const q = db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const [plan] = opts.forUpdate ? await q.for("update") : await q;
  if (!plan) throw new UserError("That plan no longer exists.");
  if (seesWholePlans(user)) {
    assertUnit(user, plan.unitId);
    return plan;
  }
  if (user.activeRole === "COMPONENT_OFFICER") {
    const [c] = await db.select({ id: planComponents.id }).from(planComponents).where(and(eq(planComponents.planId, planId), eq(planComponents.coUserId, user.id))).limit(1);
    if (c) return plan;
  }
  throw new AuthzError("You don't have access to this plan.");
}

/** Loads a component; the CO must be its Component Officer, IO/UO must be in the plan's unit. */
export async function loadComponent(db: DbOrTx, user: CurrentUser, planComponentId: string, opts: { forUpdate?: boolean } = {}) {
  if (!UUID.test(planComponentId)) throw new UserError("That component doesn't exist.");
  const q = db.select().from(planComponents).where(eq(planComponents.id, planComponentId)).limit(1);
  const [component] = opts.forUpdate ? await q.for("update") : await q;
  if (!component) throw new UserError("That component no longer exists.");
  const plan = await loadPlan(db, user, component.planId, opts);
  const isCo = component.coUserId === user.id && user.activeRole === "COMPONENT_OFFICER";
  if (!isCo && !seesWholePlans(user)) throw new AuthzError("This component belongs to another Component Officer.");
  return { plan, component, isCo };
}

export async function planEvent(db: DbOrTx, planId: string, actorUserId: string | null, kind: string, message: string, data?: unknown) {
  await db.insert(planEvents).values({ planId, actorUserId, kind, message, data: data ?? null });
}

/** Rebuilds the slots of one component from its sectors, points and requirements. */
export async function regenerateSlots(db: DbOrTx, planComponentId: string): Promise<number> {
  const [comp] = await db.select({ planId: planComponents.planId }).from(planComponents).where(eq(planComponents.id, planComponentId)).limit(1);
  if (!comp) return 0;
  const sec = await db.select().from(sectors).where(eq(sectors.planComponentId, planComponentId));
  const pts = await db.select().from(planPoints).where(eq(planPoints.planComponentId, planComponentId));
  const reqs = pts.length
    ? await db.select().from(pointRequirements).where(inArray(pointRequirements.pointId, pts.map((p) => p.id)))
    : [];
  await db.delete(slots).where(eq(slots.planComponentId, planComponentId));
  const specs = buildSlots(
    sec.map((s) => ({ id: s.id, planComponentId, batches: s.batches, inchargeRankId: s.inchargeRankId, liaisonRankId: s.liaisonRankId })),
    pts.map((p) => ({ id: p.id, sectorId: p.sectorId, priority: p.priority, intensity: p.intensity, genderReq: p.genderReq })),
    reqs.map((r) => ({ pointId: r.pointId, batch: r.batch, rankId: r.rankId, count: r.count, mergeGroup: r.mergeGroup })),
  );
  if (specs.length === 0) return 0;
  for (let i = 0; i < specs.length; i += 500) {
    const chunk = specs.slice(i, i + 500);
    const inserted = await db
      .insert(slots)
      .values(chunk.map(({ pointIds: _p, ...s }) => ({ ...s, planId: comp.planId })))
      .returning({ id: slots.id });
    const links = inserted.flatMap((row, j) => chunk[j]!.pointIds.map((pointId) => ({ slotId: row.id, pointId })));
    if (links.length) await db.insert(slotPoints).values(links);
  }
  return specs.length;
}

/** Next plan code for a unit: BB-<year>-<nnn>. */
export async function nextPlanCode(db: DbOrTx, unitId: string, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const [r] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(plans)
    .where(and(eq(plans.unitId, unitId), sql`${plans.code} like ${`BB-${year}-%`}`));
  return `BB-${year}-${String((r?.n ?? 0) + 1).padStart(3, "0")}`;
}

export function assertPlanStatus(plan: { status: PlanStatus }, allowed: PlanStatus[], message: string) {
  if (!allowed.includes(plan.status)) throw new UserError(message);
}

export function assertComponentStatus(c: { status: ComponentStatus }, allowed: ComponentStatus[], message: string) {
  if (!allowed.includes(c.status)) throw new UserError(message);
}
