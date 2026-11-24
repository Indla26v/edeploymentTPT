"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { ensureLoginForPerson } from "@/lib/auth/ensure-login";
import { requireUser } from "@/lib/auth/session";
import { UserError, can } from "@/lib/authz/authorize";
import {
  persons,
  planComponents,
  planEquipmentRequirements,
  planPoints,
  planReportingSchedule,
  planWindows,
  plans,
  pointRequirements,
  preferences,
  roleAssignments,
  sectors,
} from "@/lib/db/schema";
import { assertPlanStatus, loadPlan, nextPlanCode, planEvent } from "@/lib/plans/server";
import { searchUnitPersons } from "@/lib/queries/plans";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import { notifyUser, queueMessage } from "@/lib/server/notify";
import { saveImage } from "@/lib/storage";
import { PLANNING_STATUSES, checkSendToCos } from "@/lib/workflow/plan";

const optText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);
const iso = z.string().datetime({ offset: true, message: "Enter a valid date and time" });

const detailsSchema = z.object({
  title: z.string().trim().min(3, "Enter the bandobast name").max(140),
  eventType: z.string().trim().min(2, "Choose the event type").max(60),
  venue: optText(160),
  description: optText(2000),
  location: z.object({ lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable() }),
  proposalDueAt: iso.optional().nullable(),
  windows: z
    .array(z.object({ label: optText(60), startsAt: iso, endsAt: iso }).refine((w) => new Date(w.endsAt) > new Date(w.startsAt), { path: ["endsAt"], message: "End must be after start" }))
    .min(1, "Add at least one duty date")
    .max(31),
});
export type PlanDetailsInput = z.input<typeof detailsSchema>;

/** Step 1 of "Initiate": creates the draft (first save) or updates the plan's details and duty dates. */
export async function savePlanDetailsAction(planId: string | null, input: PlanDetailsInput) {
  return mutate({
    permission: "plans.initiate",
    schema: detailsSchema,
    input,
    message: planId ? "Saved" : "Draft created",
    run: async ({ tx, user, data, audit }) => {
      if (!user.unitId) throw new UserError("Switch to a unit role to plan a bandobast.");
      const cols = {
        title: data.title,
        eventType: data.eventType,
        venue: data.venue,
        description: data.description,
        lat: data.location.lat,
        lng: data.location.lng,
        proposalDueAt: data.proposalDueAt ? new Date(data.proposalDueAt) : null,
      };
      let id = planId;
      if (id) {
        const plan = await loadPlan(tx, user, id, { forUpdate: true });
        assertPlanStatus(plan, PLANNING_STATUSES, "This plan is already with the Unit Officer; its details can't change here.");
        await tx.update(plans).set(cols).where(eq(plans.id, id));
        await tx.delete(planWindows).where(eq(planWindows.planId, id));
      } else {
        const code = await nextPlanCode(tx, user.unitId);
        const [row] = await tx
          .insert(plans)
          .values({ ...cols, unitId: user.unitId, code, initiatedBy: user.id })
          .returning({ id: plans.id });
        id = row!.id;
        await planEvent(tx, id, user.id, "created", `Plan ${code} created`);
      }
      await tx.insert(planWindows).values(data.windows.map((w) => ({ planId: id!, label: w.label, startsAt: new Date(w.startsAt), endsAt: new Date(w.endsAt) })));
      await audit({ action: planId ? "plan.update" : "plan.create", entity: "plan", entityId: id, after: data });
      refresh();
      return { id: id! };
    },
  });
}

const teamSchema = z.object({
  overallInchargePersonId: z.string().uuid().nullable(),
  components: z
    .array(
      z.object({
        id: z.string().uuid().nullable(),
        componentId: z.string().uuid().nullable(),
        name: z.string().trim().min(2, "Enter the component name").max(80),
        coPersonId: z.string().uuid().nullable(),
        inchargePersonId: z.string().uuid().nullable(),
      }),
    )
    .min(1, "Add at least one component")
    .max(40)
    .refine((cs) => new Set(cs.map((c) => c.name.toLowerCase())).size === cs.length, "Component names must be different"),
});
export type PlanTeamInput = z.input<typeof teamSchema>;

/**
 * Step 2: components, their Component Officers (a login is created when needed) and the Overall Incharge.
 * Returns one-time passwords for any logins created, to be shared privately.
 */
export async function savePlanTeamAction(planId: string, input: PlanTeamInput) {
  return mutate({
    permission: "plans.initiate",
    schema: teamSchema,
    input,
    message: "Components saved",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      assertPlanStatus(plan, PLANNING_STATUSES, "This plan is already with the Unit Officer; components can't change here.");
      const personIds = [data.overallInchargePersonId, ...data.components.flatMap((c) => [c.coPersonId, c.inchargePersonId])].filter((x): x is string => !!x);
      if (personIds.length) {
        const ps = await tx.select({ id: persons.id, unitId: persons.unitId }).from(persons).where(inArray(persons.id, personIds));
        if (ps.some((p) => p.unitId !== plan.unitId) || ps.length !== new Set(personIds).size) throw new UserError("Choose officers of this unit.");
      }
      await tx.update(plans).set({ overallInchargePersonId: data.overallInchargePersonId }).where(eq(plans.id, plan.id));

      const existing = await tx.select().from(planComponents).where(eq(planComponents.planId, plan.id));
      const keep = new Set(data.components.map((c) => c.id).filter(Boolean));
      for (const old of existing.filter((e) => !keep.has(e.id))) {
        if (plan.status !== "draft" && old.status !== "assigned") throw new UserError(`${old.name} already has work from its Component Officer and can't be removed.`);
        await tx.delete(planComponents).where(eq(planComponents.id, old.id));
      }

      const logins: { name: string; username: string; tempPassword: string }[] = [];
      for (const [i, c] of data.components.entries()) {
        const before = c.id ? existing.find((e) => e.id === c.id) : undefined;
        if (c.id && !before) throw new UserError("A component changed meanwhile. Reload and try again.");
        let componentId = c.id;
        if (before) {
          await tx.update(planComponents).set({ name: c.name, componentId: c.componentId, inchargePersonId: c.inchargePersonId, displayOrder: i }).where(eq(planComponents.id, before.id));
        } else {
          const [row] = await tx
            .insert(planComponents)
            .values({ planId: plan.id, name: c.name, componentId: c.componentId, inchargePersonId: c.inchargePersonId, displayOrder: i })
            .returning({ id: planComponents.id });
          componentId = row!.id;
        }
        if ((before?.coPersonId ?? null) !== c.coPersonId) {
          await tx.delete(roleAssignments).where(and(eq(roleAssignments.planComponentId, componentId!), eq(roleAssignments.role, "COMPONENT_OFFICER")));
          let coUserId: string | null = null;
          if (c.coPersonId) {
            const login = await ensureLoginForPerson(tx, c.coPersonId);
            coUserId = login.userId;
            if (login.tempPassword) logins.push({ name: login.name, username: login.username, tempPassword: login.tempPassword });
            await tx.insert(roleAssignments).values({ userId: login.userId, role: "COMPONENT_OFFICER", unitId: plan.unitId, planId: plan.id, planComponentId: componentId, createdBy: user.id });
            if (plan.status !== "draft") {
              await notifyUser(tx, login.userId, { title: `Propose ${c.name} for ${plan.title}`, body: "You are the Component Officer. Add sectors, points and men required.", href: `/plans/${plan.id}/components/${componentId}`, kind: "action" });
              await queueMessage(tx, { template: "plan.proposal_requested", toUserId: login.userId, payload: { plan: plan.title, component: c.name } });
            }
          }
          await tx.update(planComponents).set({ coPersonId: c.coPersonId, coUserId }).where(eq(planComponents.id, componentId!));
        }
      }
      await planEvent(tx, plan.id, user.id, "components", `Components updated (${data.components.length})`);
      await audit({ action: "plan.components", entity: "plan", entityId: plan.id, after: { ...data, loginsCreated: logins.map((l) => l.username) } });
      refresh();
      return { logins };
    },
  });
}

const scheduleSchema = z.object({
  rows: z
    .array(
      z.object({
        kind: z.enum(["reporting", "briefing", "deployment", "relief", "de_induction"]),
        rankId: z.string().uuid().nullable(),
        at: iso,
        place: z.string().trim().min(2, "Enter the place").max(160),
      }),
    )
    .max(100),
});
export type ScheduleInput = z.input<typeof scheduleSchema>;

export async function saveReportingScheduleAction(planId: string, input: ScheduleInput) {
  return mutate({
    permission: "plans.initiate",
    schema: scheduleSchema,
    input,
    message: "Reporting schedule saved",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      assertPlanStatus(plan, [...PLANNING_STATUSES, "sourcing", "placement"], "The schedule can't change after publishing.");
      await tx.delete(planReportingSchedule).where(eq(planReportingSchedule.planId, plan.id));
      if (data.rows.length) await tx.insert(planReportingSchedule).values(data.rows.map((r) => ({ planId: plan.id, kind: r.kind, rankId: r.rankId, at: new Date(r.at), place: r.place })));
      await audit({ action: "plan.schedule", entity: "plan", entityId: plan.id, after: data });
      refresh();
    },
  });
}

export async function savePlanImageAction(planId: string, formData: FormData): Promise<ActionResult<{ imageUrl: string | null }>> {
  const user = await requireUser();
  if (!can(user, "plans.initiate")) return { ok: false, error: "You don't have permission to do this." };
  const file = formData.get("image");
  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      imageUrl = await saveImage(file, "plans");
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return mutate({
    permission: "plans.initiate",
    schema: z.object({}),
    input: {},
    message: imageUrl ? "Image saved" : "Image removed",
    run: async ({ tx, user, audit }) => {
      const plan = await loadPlan(tx, user, planId);
      await tx.update(plans).set({ imageUrl }).where(eq(plans.id, plan.id));
      await audit({ action: "plan.image", entity: "plan", entityId: plan.id, after: { imageUrl } });
      refresh();
      return { imageUrl };
    },
  });
}

/** Final step of "Initiate": the plan goes to the Component Officers (in-app alert + queued message). */
export async function sendToCosAction(planId: string) {
  return mutate({
    permission: "plans.initiate",
    schema: z.object({}),
    input: {},
    message: "Sent to Component Officers",
    run: async ({ tx, user, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      assertPlanStatus(plan, ["draft"], "This plan was already sent.");
      const comps = await tx.select().from(planComponents).where(eq(planComponents.planId, plan.id));
      const windows = await tx.select({ id: planWindows.id }).from(planWindows).where(eq(planWindows.planId, plan.id));
      const check = checkSendToCos({ windows: windows.length, components: comps.map((c) => ({ name: c.name, hasCo: !!c.coUserId })) });
      if (!check.ok) throw new UserError(check.problems.join(" "));
      await tx.update(plans).set({ status: "proposing" }).where(eq(plans.id, plan.id));
      for (const c of comps) {
        await notifyUser(tx, c.coUserId!, {
          title: `Propose ${c.name} for ${plan.title}`,
          body: plan.proposalDueAt ? `Due ${plan.proposalDueAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Add sectors, points and men required.",
          href: `/plans/${plan.id}/components/${c.id}`,
          kind: "action",
        });
        await queueMessage(tx, { template: "plan.proposal_requested", toUserId: c.coUserId, payload: { plan: plan.title, component: c.name } });
      }
      await planEvent(tx, plan.id, user.id, "sent_to_cos", `Sent to ${comps.length} Component Officer${comps.length > 1 ? "s" : ""}`);
      await audit({ action: "plan.send_to_cos", entity: "plan", entityId: plan.id });
      refresh();
    },
  });
}

export async function deleteDraftAction(planId: string) {
  return mutate({
    permission: "plans.initiate",
    schema: z.object({}),
    input: {},
    message: "Draft deleted",
    run: async ({ tx, user, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      assertPlanStatus(plan, ["draft"], "Only drafts can be deleted.");
      await tx.delete(plans).where(eq(plans.id, plan.id));
      await audit({ action: "plan.delete", entity: "plan", entityId: plan.id, before: plan });
      refresh();
    },
  });
}

/**
 * Reuse a previous plan: "components" copies components, COs and incharges; "proposals" also copies
 * sectors, points, men required, logistics and preferences — up to (not including) station distribution.
 */
export async function reusePlanAction(sourcePlanId: string, depth: "components" | "proposals") {
  return mutate({
    permission: "plans.initiate",
    schema: z.object({ depth: z.enum(["components", "proposals"]) }),
    input: { depth },
    message: "Plan copied as a new draft",
    run: async ({ tx, user, data, audit }) => {
      const src = await loadPlan(tx, user, sourcePlanId);
      const code = await nextPlanCode(tx, src.unitId);
      const [np] = await tx
        .insert(plans)
        .values({ unitId: src.unitId, code, title: `${src.title} (copy)`, eventType: src.eventType, venue: src.venue, description: src.description, lat: src.lat, lng: src.lng, imageUrl: src.imageUrl, overallInchargePersonId: src.overallInchargePersonId, initiatedBy: user.id, reusedFromPlanId: src.id })
        .returning({ id: plans.id });
      const planId = np!.id;
      const sched = await tx.select().from(planReportingSchedule).where(eq(planReportingSchedule.planId, src.id));
      if (sched.length) await tx.insert(planReportingSchedule).values(sched.map(({ id: _i, planId: _p, ...r }) => ({ ...r, planId })));

      const comps = await tx.select().from(planComponents).where(eq(planComponents.planId, src.id));
      for (const c of comps) {
        const [nc] = await tx
          .insert(planComponents)
          .values({ planId, componentId: c.componentId, name: c.name, coUserId: c.coUserId, coPersonId: c.coPersonId, inchargePersonId: c.inchargePersonId, displayOrder: c.displayOrder, logisticsNote: data.depth === "proposals" ? c.logisticsNote : null, status: data.depth === "proposals" ? "in_progress" : "assigned" })
          .returning({ id: planComponents.id });
        if (c.coUserId) await tx.insert(roleAssignments).values({ userId: c.coUserId, role: "COMPONENT_OFFICER", unitId: src.unitId, planId, planComponentId: nc!.id, createdBy: user.id });
        if (data.depth !== "proposals") continue;
        const pointMap = new Map<string, string>();
        for (const s of await tx.select().from(sectors).where(eq(sectors.planComponentId, c.id))) {
          const { id: oldSectorId, planId: _p, planComponentId: _c, createdAt: _a, updatedAt: _u, ...rest } = s;
          const [ns] = await tx.insert(sectors).values({ ...rest, planId, planComponentId: nc!.id }).returning({ id: sectors.id });
          for (const p of await tx.select().from(planPoints).where(eq(planPoints.sectorId, oldSectorId))) {
            const { id: oldPointId, planId: _pp, planComponentId: _pc, sectorId: _s, createdAt: _ca, updatedAt: _ua, ...prest } = p;
            const [npnt] = await tx.insert(planPoints).values({ ...prest, planId, planComponentId: nc!.id, sectorId: ns!.id }).returning({ id: planPoints.id });
            pointMap.set(oldPointId, npnt!.id);
            const reqs = await tx.select().from(pointRequirements).where(eq(pointRequirements.pointId, oldPointId));
            if (reqs.length) await tx.insert(pointRequirements).values(reqs.map(({ id: _r, planId: _rp, pointId: _rpt, ...r }) => ({ ...r, planId, pointId: npnt!.id })));
          }
        }
        const eqs = await tx.select().from(planEquipmentRequirements).where(eq(planEquipmentRequirements.planComponentId, c.id));
        if (eqs.length) await tx.insert(planEquipmentRequirements).values(eqs.map(({ id: _e, planId: _ep, planComponentId: _ec, ...e }) => ({ ...e, planId, planComponentId: nc!.id })));
        const prefs = await tx.select().from(preferences).where(eq(preferences.planComponentId, c.id));
        if (prefs.length)
          await tx.insert(preferences).values(
            prefs.map(({ id: _x, planId: _y, planComponentId: _z, createdAt: _a, updatedAt: _b, ...p }) => ({ ...p, planId, planComponentId: nc!.id, pointId: p.pointId ? (pointMap.get(p.pointId) ?? null) : null, status: "active" as const })),
          );
      }
      await planEvent(tx, planId, user.id, "created", `Plan ${code} created from ${src.code} (${data.depth === "proposals" ? "up to proposals" : "components only"})`);
      await audit({ action: "plan.reuse", entity: "plan", entityId: planId, after: { from: src.id, depth: data.depth } });
      refresh();
      return { id: planId };
    },
  });
}

export async function searchOfficersAction(q: string) {
  const user = await requireUser();
  return searchUnitPersons(user, q, true);
}
