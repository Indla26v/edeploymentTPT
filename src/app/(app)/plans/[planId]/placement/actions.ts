"use server";

import { refresh } from "next/cache";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { UserError } from "@/lib/authz/authorize";
import { assignments, persons, planComponents, planPublications, plans, users } from "@/lib/db/schema";
import { canSeePlacement, editableComponents, engineOfficer, engineSlot, loadPlacement, type Placement } from "@/lib/placement/server";
import { CONFLICT, diffSnapshots } from "@/lib/placement/publish";
import { checkPlacement, suggestPlacements } from "@/lib/placement/rules";
import { loadPlan, planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";

type Tx = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"];
type User = Parameters<Parameters<typeof mutate>[0]["run"]>[0]["user"];


/** Locks the plan, checks the board version and returns everything needed to edit placement. */
async function openBoard(tx: Tx, user: User, planId: string, expectedVersion: number | null) {
  const plan = await loadPlan(tx, user, planId, { forUpdate: true });
  if (plan.status !== "placement" && plan.status !== "published") throw new UserError("Placement is open after force sourcing and until the bandobast goes live.");
  if (expectedVersion !== null && expectedVersion !== plan.placementVersion) throw new UserError(CONFLICT);
  const p = await loadPlacement(tx, plan.id);
  if (!canSeePlacement(user, p)) throw new UserError("You don't have access to this plan.");
  return { plan, p, editable: editableComponents(user, p) };
}

async function bump(tx: Tx, planId: string): Promise<number> {
  const [r] = await tx.update(plans).set({ placementVersion: sql`${plans.placementVersion} + 1` }).where(eq(plans.id, planId)).returning({ v: plans.placementVersion });
  return r!.v;
}

const isIo = (user: User) => user.activeRole === "INITIATING_OFFICER" && user.permissions.has("placement.override");

/**
 * Suggest placements for open slots (one component, or all the IO may edit). Locked and hand-placed officers
 * stay; earlier unlocked suggestions in scope are recomputed. Suggestions are drafts until Publish.
 */
export async function suggestAction(planId: string, input: { componentId: string | null; expectedVersion: number }) {
  return mutate({
    permission: "placement.edit_own_component",
    schema: z.object({ componentId: z.string().uuid().nullable(), expectedVersion: z.number().int() }),
    input,
    message: "Suggestions ready — review and adjust before publishing",
    run: async ({ tx, user, data, audit }) => {
      const { plan, p, editable } = await openBoard(tx, user, planId, data.expectedVersion);
      const scope = new Set([...editable].filter((c) => !data.componentId || c === data.componentId));
      if (scope.size === 0) throw new UserError("You can only place officers in your own component.");
      // Drop earlier unlocked suggestions in scope; everything else is kept.
      const stale = p.assignments.filter((a) => scope.has(a.planComponentId) && a.source === "suggested" && !a.locked);
      if (stale.length) await tx.delete(assignments).where(inArray(assignments.id, stale.map((a) => a.id)));
      const kept = p.assignments.filter((a) => !stale.includes(a));
      const taken = new Set(kept.map((a) => a.slotId));
      const openSlots = p.slots.filter((s) => scope.has(s.planComponentId) && !s.dropped && !taken.has(s.id));
      const used = new Set(kept.map((a) => a.personId));
      const mapped = openSlots.map((s) => engineSlot(s, p));
      const result = suggestPlacements({
        slots: mapped.map((m) => m.slot),
        points: mapped.map((m) => m.point),
        officers: p.officers.filter((o) => !used.has(o.personId)).map(engineOfficer),
      });
      const preferredIds = new Set(p.officers.filter((o) => o.preferredSlotIds.length).map((o) => o.personId));
      if (result.suggestions.length) {
        await tx.insert(assignments).values(
          result.suggestions.map((sg) => {
            const s = p.slots.find((x) => x.id === sg.slotId)!;
            const pref = preferredIds.has(sg.officerId) && p.officers.find((o) => o.personId === sg.officerId)!.preferredSlotIds.includes(s.id);
            return { planId: plan.id, planComponentId: s.planComponentId, slotId: s.id, personId: sg.officerId, source: pref ? ("preference" as const) : ("suggested" as const), reasons: sg.reasons, warnings: sg.warnings.map((w) => w.message), updatedBy: user.id };
          }),
        );
      }
      const version = await bump(tx, plan.id);
      await planEvent(tx, plan.id, user.id, "suggest", `Suggested ${result.suggestions.length} placements${result.unfilledSlotIds.length ? `, ${result.unfilledSlotIds.length} slots left open` : ""}`);
      await audit({ action: "placement.suggest", entity: "plan", entityId: plan.id, after: { suggested: result.suggestions.length, open: result.unfilledSlotIds.length, scope: [...scope] } });
      refresh();
      return { version, suggested: result.suggestions.length, open: result.unfilledSlotIds.length };
    },
  });
}

function ruleCheck(p: Placement, personId: string, slotId: string, alreadyPlaced = false) {
  const o = p.officers.find((x) => x.personId === personId);
  const s = p.slots.find((x) => x.id === slotId);
  if (!o || !s) throw new UserError("That officer or slot is no longer on the board.");
  const { slot, point } = engineSlot(s, p);
  return { o, s, check: checkPlacement(engineOfficer(o), slot, point, { alreadyPlaced }) };
}

/**
 * Place an officer in a slot (or back in the pool with toSlotId = null). Dropping on an occupied slot swaps
 * the two when the rules allow, otherwise the occupant goes back to the pool.
 */
export async function moveAction(planId: string, input: { personId: string; toSlotId: string | null; expectedVersion: number }) {
  return mutate({
    permission: "placement.edit_own_component",
    schema: z.object({ personId: z.string().uuid(), toSlotId: z.string().uuid().nullable(), expectedVersion: z.number().int() }),
    input,
    run: async ({ tx, user, data, audit }) => {
      const { plan, p, editable } = await openBoard(tx, user, planId, data.expectedVersion);
      const from = p.assignments.find((a) => a.personId === data.personId) ?? null;
      if (!p.officers.some((o) => o.personId === data.personId)) throw new UserError("That officer isn't in this plan's pool.");
      if (from && !editable.has(from.planComponentId)) throw new UserError("That officer is placed in another component. Ask the Initiating Officer to move them.");
      if (from?.locked && !isIo(user)) throw new UserError("This placement is locked by the Initiating Officer.");
      if (from && from.slotId === data.toSlotId) return { version: plan.placementVersion, fromSlotId: from.slotId, swappedPersonId: null };

      let swapped: string | null = null;
      if (data.toSlotId) {
        const { s, check } = ruleCheck(p, data.personId, data.toSlotId);
        if (!editable.has(s.planComponentId)) throw new UserError("You can only place officers in your own component.");
        if (s.dropped) throw new UserError("This slot was dropped. Restore it first.");
        if (!check.ok) throw new UserError(check.violations.map((v) => v.message).join(" · "));
        const occupant = p.assignments.find((a) => a.slotId === s.id);
        if (occupant) {
          if (occupant.locked && !isIo(user)) throw new UserError("That slot is locked by the Initiating Officer.");
          await tx.delete(assignments).where(eq(assignments.id, occupant.id));
        }
        if (from) await tx.delete(assignments).where(eq(assignments.id, from.id));
        await tx.insert(assignments).values({ planId: plan.id, planComponentId: s.planComponentId, slotId: s.id, personId: data.personId, source: "manual", warnings: check.warnings.map((w) => w.message), updatedBy: user.id });
        // Swap the occupant into the vacated slot when allowed; otherwise they return to the pool.
        if (occupant && from) {
          const back = ruleCheck(p, occupant.personId, from.slotId);
          if (back.check.ok) {
            await tx.insert(assignments).values({ planId: plan.id, planComponentId: from.planComponentId, slotId: from.slotId, personId: occupant.personId, source: "manual", warnings: back.check.warnings.map((w) => w.message), updatedBy: user.id });
            swapped = occupant.personId;
          }
        }
      } else if (from) {
        await tx.delete(assignments).where(eq(assignments.id, from.id));
      }
      const version = await bump(tx, plan.id);
      await audit({ action: "placement.move", entity: "plan", entityId: plan.id, after: { personId: data.personId, from: from?.slotId ?? null, to: data.toSlotId, swapped } });
      refresh();
      return { version, fromSlotId: from?.slotId ?? null, swappedPersonId: swapped };
    },
  });
}

export async function lockAction(planId: string, input: { slotId: string; locked: boolean; expectedVersion: number }) {
  return mutate({
    permission: "placement.override",
    schema: z.object({ slotId: z.string().uuid(), locked: z.boolean(), expectedVersion: z.number().int() }),
    input,
    message: input.locked ? "Locked — Component Officers can't move this officer" : "Unlocked",
    run: async ({ tx, user, data, audit }) => {
      const { plan, p } = await openBoard(tx, user, planId, data.expectedVersion);
      const a = p.assignments.find((x) => x.slotId === data.slotId);
      if (!a) throw new UserError("Place an officer before locking the slot.");
      await tx.update(assignments).set({ locked: data.locked, updatedBy: user.id }).where(eq(assignments.id, a.id));
      const version = await bump(tx, plan.id);
      await audit({ action: data.locked ? "placement.lock" : "placement.unlock", entity: "assignment", entityId: a.id });
      refresh();
      return { version };
    },
  });
}

/** The CO leaves a slot unfilled on purpose (lowest-priority points after an accepted shortfall). */
export async function dropSlotAction(planId: string, input: { slotId: string; dropped: boolean; expectedVersion: number }) {
  return mutate({
    permission: "placement.edit_own_component",
    schema: z.object({ slotId: z.string().uuid(), dropped: z.boolean(), expectedVersion: z.number().int() }),
    input,
    message: input.dropped ? "Slot left unfilled" : "Slot restored",
    run: async ({ tx, user, data, audit }) => {
      const { plan, p, editable } = await openBoard(tx, user, planId, data.expectedVersion);
      const s = p.slots.find((x) => x.id === data.slotId);
      if (!s || !editable.has(s.planComponentId)) throw new UserError("You can only change slots in your own component.");
      if (data.dropped && p.assignments.some((a) => a.slotId === s.id)) throw new UserError("Move the officer out of this slot first.");
      await tx.execute(sql`update slots set dropped = ${data.dropped} where id = ${s.id}`);
      const version = await bump(tx, plan.id);
      await audit({ action: data.dropped ? "placement.drop_slot" : "placement.restore_slot", entity: "slot", entityId: s.id });
      refresh();
      return { version };
    },
  });
}

export async function markReadyAction(planId: string, input: { componentId: string; ready: boolean }) {
  return mutate({
    permission: "placement.edit_own_component",
    schema: z.object({ componentId: z.string().uuid(), ready: z.boolean() }),
    input,
    message: input.ready ? "Marked ready — the Initiating Officer has been told" : "Marked as not ready",
    run: async ({ tx, user, data, audit }) => {
      const { plan, editable } = await openBoard(tx, user, planId, null);
      if (!editable.has(data.componentId)) throw new UserError("You can only mark your own component.");
      const [c] = await tx.update(planComponents).set({ placementReadyAt: data.ready ? new Date() : null }).where(eq(planComponents.id, data.componentId)).returning({ name: planComponents.name });
      if (data.ready && plan.initiatedBy && plan.initiatedBy !== user.id) await notifyUser(tx, plan.initiatedBy, { title: `${c!.name}: placement ready`, body: plan.title, href: `/plans/${plan.id}/placement`, kind: "info" });
      await planEvent(tx, plan.id, user.id, "placement_ready", `${c!.name}: placement ${data.ready ? "ready" : "reopened"}`);
      await audit({ action: "placement.ready", entity: "plan_component", entityId: data.componentId, after: data });
      refresh();
    },
  });
}

/**
 * Publish the duty allocation. Every publish stores a snapshot; officers are told only when their posting
 * is new, changed or removed compared with the last publish. Nothing is sent before this point.
 */
export async function publishAction(planId: string, input: { expectedVersion: number }) {
  return mutate({
    permission: "plans.publish",
    schema: z.object({ expectedVersion: z.number().int() }),
    input,
    message: "Published",
    run: async ({ tx, user, data, audit }) => {
      const { plan, p } = await openBoard(tx, user, planId, data.expectedVersion);
      if (p.assignments.length === 0) throw new UserError("Place officers before publishing.");
      const snapshot = p.assignments.map((a) => ({ slotId: a.slotId, personId: a.personId })).sort((x, y) => x.slotId.localeCompare(y.slotId));
      const [last] = await tx.select().from(planPublications).where(eq(planPublications.planId, plan.id)).orderBy(desc(planPublications.version)).limit(1);
      const d = diffSnapshots(last?.snapshot ?? [], snapshot);
      const changed = [...d.added, ...d.moved, ...d.removed];
      const people = changed.length ? await tx.select({ id: persons.id, name: persons.name, phone: persons.phone, userId: users.id }).from(persons).leftJoin(users, eq(users.personId, persons.id)).where(inArray(persons.id, changed)) : [];
      const describe = (slotId: string) => {
        const s = p.slots.find((x) => x.id === slotId)!;
        const pt = p.points.find((x) => x.id === s.pointId);
        const sec = p.sectors.find((x) => x.id === s.sectorId);
        return `${pt?.name ?? `${sec?.name} ${s.role === "sector_incharge" ? "incharge" : "liaison"}`}${(sec?.batches ?? 1) > 1 ? `, batch ${s.batch}` : ""}`;
      };
      for (const person of people) {
        const now = snapshot.find((e) => e.personId === person.id);
        const kind = d.removed.includes(person.id) ? "removed" : d.moved.includes(person.id) ? "changed" : "assigned";
        const text = kind === "removed" ? `You are no longer on duty for ${plan.title}.` : `${kind === "changed" ? "Duty changed" : "Duty"}: ${describe(now!.slotId)} — ${plan.title}`;
        if (person.userId) await notifyUser(tx, person.userId, { title: text, href: "/station/duty-pass", kind: kind === "removed" ? "alert" : "action" });
        await queueMessage(tx, { template: `duty.${kind}`, toUserId: person.userId, toPhone: person.phone, payload: { plan: plan.title, posting: now ? describe(now.slotId) : null } });
      }
      const version = (last?.version ?? 0) + 1;
      await tx.insert(planPublications).values({ planId: plan.id, version, snapshot, diff: { added: d.added.length, moved: d.moved.length, removed: d.removed.length, unchanged: d.unchanged }, notified: people.length, publishedBy: user.id });
      await tx.update(plans).set({ status: "published", publishedVersion: plan.placementVersion, publishedAt: new Date() }).where(eq(plans.id, plan.id));
      await planEvent(tx, plan.id, user.id, "published", `Published v${version}: ${snapshot.length} officers${version > 1 ? ` — ${changed.length} changed and notified` : ""}`);
      await audit({ action: "plan.publish", entity: "plan", entityId: plan.id, after: { version, added: d.added.length, moved: d.moved.length, removed: d.removed.length } });
      refresh();
      return { version, notified: people.length, placed: snapshot.length };
    },
  });
}

