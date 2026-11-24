"use server";

import { refresh } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { UserError } from "@/lib/authz/authorize";
import { persons, planComponents, planPoints, plans, pointRequirements, preferences, ranks, roleAssignments, sectors } from "@/lib/db/schema";
import { loadComponent, loadPlan, planEvent, regenerateSlots } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { checkSendToUo, ioCanEditInline } from "@/lib/workflow/plan";

/**
 * IO corrects a count inline. The component is NOT returned to its CO (no return loop) — the change is
 * recorded on the plan timeline and the CO is told.
 */
export async function setCountAction(input: { pointId: string; batch: number; rankId: string; count: number }) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({ pointId: z.string().uuid(), batch: z.number().int().min(1).max(4), rankId: z.string().uuid(), count: z.number().int().min(0).max(5000) }),
    input,
    message: "Count updated",
    run: async ({ tx, user, data, audit }) => {
      const [pt] = await tx
        .select({ id: planPoints.id, name: planPoints.name, planComponentId: planPoints.planComponentId, batches: sectors.batches })
        .from(planPoints)
        .innerJoin(sectors, eq(sectors.id, planPoints.sectorId))
        .where(eq(planPoints.id, data.pointId))
        .limit(1);
      if (!pt) throw new UserError("That point no longer exists.");
      const { plan, component } = await loadComponent(tx, user, pt.planComponentId, { forUpdate: true });
      if (!ioCanEditInline(plan.status, component.status)) throw new UserError("Counts can be corrected here only on submitted proposals, before sourcing starts.");
      if (data.batch > pt.batches) throw new UserError("That batch doesn't exist in this sector.");
      const [existing] = await tx.select().from(pointRequirements).where(and(eq(pointRequirements.pointId, pt.id), eq(pointRequirements.batch, data.batch), eq(pointRequirements.rankId, data.rankId))).limit(1);
      const before = existing?.count ?? 0;
      if (before === data.count) return { slots: null };
      if (existing && data.count === 0) await tx.delete(pointRequirements).where(eq(pointRequirements.id, existing.id));
      else if (existing) await tx.update(pointRequirements).set({ count: data.count }).where(eq(pointRequirements.id, existing.id));
      else await tx.insert(pointRequirements).values({ planId: plan.id, pointId: pt.id, batch: data.batch, rankId: data.rankId, count: data.count });
      const n = await regenerateSlots(tx, component.id);
      const [rk] = await tx.select({ code: ranks.code }).from(ranks).where(eq(ranks.id, data.rankId)).limit(1);
      const msg = `${component.name} · ${pt.name}${pt.batches > 1 ? ` (batch ${data.batch})` : ""}: ${rk?.code} ${before} → ${data.count}`;
      await planEvent(tx, plan.id, user.id, "count_changed", `IO changed ${msg}`, data);
      if (component.coUserId) await notifyUser(tx, component.coUserId, { title: "Initiating Officer adjusted your proposal", body: msg, href: `/plans/${plan.id}/components/${component.id}`, kind: "info" });
      await audit({ action: "plan.count_change", entity: "point_requirement", entityId: existing?.id ?? null, before: { count: before }, after: data });
      refresh();
      return { slots: n };
    },
  });
}

export async function returnComponentAction(planComponentId: string, comment: string) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({ comment: z.string().trim().min(5, "Tell the CO what to change").max(1000) }),
    input: { comment },
    message: "Returned to the Component Officer",
    run: async ({ tx, user, data, audit }) => {
      const { plan, component } = await loadComponent(tx, user, planComponentId, { forUpdate: true });
      if (plan.status !== "proposing" && plan.status !== "consolidating") throw new UserError("The plan has already gone for force sourcing.");
      if (component.status !== "submitted" && component.status !== "accepted") throw new UserError("Only submitted proposals can be returned.");
      await tx.update(planComponents).set({ status: "returned", returnComment: data.comment }).where(eq(planComponents.id, component.id));
      if (component.coUserId) {
        await notifyUser(tx, component.coUserId, { title: `${component.name} returned for changes`, body: data.comment, href: `/plans/${plan.id}/components/${component.id}`, kind: "action" });
        await queueMessage(tx, { template: "proposal.returned", toUserId: component.coUserId, payload: { plan: plan.title, component: component.name, comment: data.comment } });
      }
      await planEvent(tx, plan.id, user.id, "returned", `${component.name} returned: ${data.comment}`);
      await audit({ action: "proposal.return", entity: "plan_component", entityId: component.id, after: data });
      refresh();
    },
  });
}

export async function acceptComponentAction(planComponentId: string) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({}),
    input: {},
    message: "Proposal accepted",
    run: async ({ tx, user, audit }) => {
      const { plan, component } = await loadComponent(tx, user, planComponentId, { forUpdate: true });
      if (component.status !== "submitted") throw new UserError("Only submitted proposals can be accepted.");
      await tx.update(planComponents).set({ status: "accepted" }).where(eq(planComponents.id, component.id));
      await planEvent(tx, plan.id, user.id, "accepted", `${component.name} accepted`);
      await audit({ action: "proposal.accept", entity: "plan_component", entityId: component.id });
      refresh();
    },
  });
}

/** Two components preferred the same officer: keep this preference, drop the others. */
export async function keepPreferenceAction(preferenceId: string) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({ id: z.string().uuid() }),
    input: { id: preferenceId },
    message: "Preference kept; the others were dropped",
    run: async ({ tx, user, data, audit }) => {
      const [pref] = await tx.select().from(preferences).where(eq(preferences.id, data.id)).limit(1);
      if (!pref || !pref.personId) throw new UserError("That preference no longer exists.");
      const plan = await loadPlan(tx, user, pref.planId, { forUpdate: true });
      if (plan.status !== "proposing" && plan.status !== "consolidating") throw new UserError("The plan has already gone for force sourcing.");
      await tx.update(preferences).set({ status: "active" }).where(eq(preferences.id, pref.id));
      await tx.update(preferences).set({ status: "dropped" }).where(and(eq(preferences.planId, plan.id), eq(preferences.personId, pref.personId), ne(preferences.id, pref.id)));
      const [p] = await tx.select({ name: persons.name }).from(persons).where(eq(persons.id, pref.personId)).limit(1);
      const [c] = await tx.select({ name: planComponents.name }).from(planComponents).where(eq(planComponents.id, pref.planComponentId)).limit(1);
      await planEvent(tx, plan.id, user.id, "preference_conflict", `${p?.name} kept for ${c?.name}`);
      await audit({ action: "plan.preference_keep", entity: "preference", entityId: pref.id });
      refresh();
    },
  });
}

/** WhatsApp-style reminder to a CO who hasn't submitted. */
export async function nudgeAction(planComponentId: string) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({}),
    input: {},
    message: "Reminder sent",
    run: async ({ tx, user, audit }) => {
      const { plan, component } = await loadComponent(tx, user, planComponentId);
      if (!component.coUserId) throw new UserError("This component has no Component Officer.");
      if (component.status === "submitted" || component.status === "accepted") throw new UserError("This proposal is already in.");
      await notifyUser(tx, component.coUserId, { title: `Reminder: ${component.name} proposal for ${plan.title}`, body: plan.proposalDueAt ? `Due ${plan.proposalDueAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : undefined, href: `/plans/${plan.id}/components/${component.id}`, kind: "action" });
      await queueMessage(tx, { template: "proposal.reminder", channel: "whatsapp", toUserId: component.coUserId, payload: { plan: plan.title, component: component.name } });
      await planEvent(tx, plan.id, user.id, "nudge", `Reminder sent to ${component.name}`);
      await audit({ action: "proposal.nudge", entity: "plan_component", entityId: component.id });
    },
  });
}

/**
 * Send the consolidated plan for force sourcing. All submitted proposals are accepted and slots rebuilt.
 * When the IO also holds the Unit Officer role, they go straight to sourcing (no separate hand-over).
 */
export async function sendToUoAction(planId: string) {
  return mutate({
    permission: "plans.consolidate",
    schema: z.object({}),
    input: {},
    message: "Sent for force sourcing",
    run: async ({ tx, user, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      const comps = await tx.select().from(planComponents).where(eq(planComponents.planId, plan.id));
      let total = 0;
      for (const c of comps) if (c.status === "submitted" || c.status === "accepted") total += await regenerateSlots(tx, c.id);
      const check = checkSendToUo(plan.status, comps.map((c) => ({ name: c.name, status: c.status })), total);
      if (!check.ok) throw new UserError(check.problems.join(" "));
      await tx.update(planComponents).set({ status: "accepted" }).where(eq(planComponents.planId, plan.id));
      await tx.update(plans).set({ status: "sourcing", sentToUoAt: new Date() }).where(eq(plans.id, plan.id));
      const selfUo = user.roles.includes("UNIT_OFFICER");
      const uos = await tx.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.role, "UNIT_OFFICER"), eq(roleAssignments.unitId, plan.unitId), eq(roleAssignments.isActive, true)));
      for (const u of uos) {
        if (u.userId === user.id) continue;
        await notifyUser(tx, u.userId, { title: `Force required: ${plan.title}`, body: `${total} men across ${comps.length} components. Distribute to stations.`, href: `/plans/${plan.id}`, kind: "action" });
        await queueMessage(tx, { template: "plan.sent_to_uo", toUserId: u.userId, payload: { plan: plan.title, men: total } });
      }
      await planEvent(tx, plan.id, user.id, "sent_to_uo", selfUo ? `Consolidated: ${total} men — force sourcing started` : `Sent to the Unit Officer: ${total} men`);
      await audit({ action: "plan.send_to_uo", entity: "plan", entityId: plan.id, after: { men: total } });
      refresh();
      return { selfUo, men: total };
    },
  });
}

