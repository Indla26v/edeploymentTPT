"use server";

import { refresh } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { UserError, can } from "@/lib/authz/authorize";
import { persons, planComponents, planEquipmentRequirements, planPoints, plans, pointRequirements, preferences, sectors } from "@/lib/db/schema";
import { loadComponent, planEvent, regenerateSlots } from "@/lib/plans/server";
import { searchUnitPersons } from "@/lib/queries/plans";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import { notifyUser } from "@/lib/server/notify";
import { saveImage } from "@/lib/storage";
import { canMoveComponent, coCanEdit, planStatusAfterSubmit } from "@/lib/workflow/plan";
import { validateProposal } from "@/lib/workflow/slots";
import { proposalSchema, type ProposalInput } from "./schema";

/** Saves the whole proposal (auto-saved on every step). Replaces the component's sectors, points and counts. */
export async function saveProposalAction(planComponentId: string, input: ProposalInput) {
  return mutate({
    permission: "plans.propose",
    schema: proposalSchema,
    input,
    message: "Draft saved",
    run: async ({ tx, user, data, audit }) => {
      const { plan, component, isCo } = await loadComponent(tx, user, planComponentId, { forUpdate: true });
      if (!isCo) throw new UserError("Only this component's Component Officer can edit the proposal.");
      if (!coCanEdit(plan.status, component.status)) throw new UserError(component.status === "submitted" || component.status === "accepted" ? "You've submitted this proposal. Ask the Initiating Officer to return it to make changes." : "This plan is no longer taking proposals.");

      const personIds = data.preferences.map((p) => p.personId).filter((x): x is string => !!x);
      if (personIds.length) {
        const ps = await tx.select({ id: persons.id, unitId: persons.unitId }).from(persons).where(inArray(persons.id, personIds));
        if (ps.some((p) => p.unitId !== plan.unitId)) throw new UserError("Preferred officers must belong to this unit.");
      }

      await tx.delete(preferences).where(eq(preferences.planComponentId, component.id));
      await tx.delete(sectors).where(eq(sectors.planComponentId, component.id));
      await tx.delete(planEquipmentRequirements).where(eq(planEquipmentRequirements.planComponentId, component.id));

      const pointIdByKey = new Map<string, string>();
      for (const [si, s] of data.sectors.entries()) {
        const [ns] = await tx
          .insert(sectors)
          .values({ planId: plan.id, planComponentId: component.id, name: s.name, shiftId: s.shiftId, batches: s.batches, instructions: s.instructions, imageUrl: s.imageUrl, inchargeRankId: s.inchargeRankId, liaisonRankId: s.liaisonRankId, displayOrder: si })
          .returning({ id: sectors.id });
        for (const [pi, p] of s.points.entries()) {
          const [np] = await tx
            .insert(planPoints)
            .values({ planId: plan.id, planComponentId: component.id, sectorId: ns!.id, libraryPointId: p.libraryPointId, name: p.name, lat: p.lat, lng: p.lng, priority: p.priority, intensity: p.intensity, mobility: p.mobility, genderReq: p.genderReq, displayOrder: pi })
            .returning({ id: planPoints.id });
          pointIdByKey.set(p.key, np!.id);
          // One row per batch + rank (the UI may send duplicates while editing: keep the last).
          const reqs = new Map<string, (typeof p.requirements)[number]>();
          for (const r of p.requirements) if (r.count > 0 && r.batch <= s.batches) reqs.set(`${r.batch}|${r.rankId}`, r);
          if (reqs.size) await tx.insert(pointRequirements).values([...reqs.values()].map((r) => ({ planId: plan.id, pointId: np!.id, batch: r.batch, rankId: r.rankId, count: r.count, teamId: r.teamId, mergeGroup: r.mergeGroup })));
        }
      }
      if (data.equipment.length) {
        const merged = new Map<string, (typeof data.equipment)[number]>();
        for (const e of data.equipment) merged.set(e.equipmentTypeId, e);
        await tx.insert(planEquipmentRequirements).values([...merged.values()].map((e) => ({ planId: plan.id, planComponentId: component.id, equipmentTypeId: e.equipmentTypeId, quantity: e.quantity, note: e.note })));
      }
      if (data.preferences.length) {
        await tx.insert(preferences).values(
          data.preferences.map((p) => ({
            planId: plan.id,
            planComponentId: component.id,
            kind: p.kind,
            unitId: p.kind === "unit" ? p.unitId : null,
            stationId: p.kind === "station" ? p.stationId : null,
            personId: p.kind === "person" ? p.personId : null,
            pointId: p.pointKey ? (pointIdByKey.get(p.pointKey) ?? null) : null,
            rankId: p.rankId,
            count: p.count,
            note: p.note,
          })),
        );
      }
      await tx
        .update(planComponents)
        .set({ logisticsNote: data.logisticsNote, status: component.status === "assigned" || component.status === "returned" ? "in_progress" : component.status })
        .where(eq(planComponents.id, component.id));
      await audit({ action: "proposal.save", entity: "plan_component", entityId: component.id, after: { sectors: data.sectors.length, points: pointIdByKey.size } });
      refresh();
      return { pointIds: Object.fromEntries(pointIdByKey) };
    },
  });
}

/** Submit the proposal to the Initiating Officer. Builds the slots (one per officer needed). */
export async function submitProposalAction(planComponentId: string) {
  return mutate({
    permission: "plans.propose",
    schema: z.object({}),
    input: {},
    message: "Proposal submitted to the Initiating Officer",
    run: async ({ tx, user, audit }) => {
      const { plan, component, isCo } = await loadComponent(tx, user, planComponentId, { forUpdate: true });
      if (!isCo) throw new UserError("Only this component's Component Officer can submit it.");
      if (!coCanEdit(plan.status, component.status) || !canMoveComponent(component.status, "submitted")) throw new UserError("This proposal can't be submitted now.");
      const secs = await tx.select().from(sectors).where(eq(sectors.planComponentId, component.id));
      const pts = await tx.select().from(planPoints).where(eq(planPoints.planComponentId, component.id));
      const reqs = pts.length ? await tx.select().from(pointRequirements).where(inArray(pointRequirements.pointId, pts.map((p) => p.id))) : [];
      const problems = validateProposal(
        secs.map((s) => ({ id: s.id, name: s.name, planComponentId: s.planComponentId, batches: s.batches, inchargeRankId: s.inchargeRankId, liaisonRankId: s.liaisonRankId })),
        pts.map((p) => ({ id: p.id, name: p.name, sectorId: p.sectorId, priority: p.priority, intensity: p.intensity, genderReq: p.genderReq })),
        reqs.map((r) => ({ pointId: r.pointId, batch: r.batch, rankId: r.rankId, count: r.count, mergeGroup: r.mergeGroup })),
      );
      if (problems.length) throw new UserError(`Fix before submitting: ${problems.slice(0, 3).map((p) => `${p.where} — ${p.message}`).join(" · ")}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ""}`);
      const n = await regenerateSlots(tx, component.id);
      await tx.update(planComponents).set({ status: "submitted", submittedAt: new Date() }).where(eq(planComponents.id, component.id));
      const all = await tx.select({ status: planComponents.status, id: planComponents.id }).from(planComponents).where(eq(planComponents.planId, plan.id));
      const next = planStatusAfterSubmit(plan.status, all.map((c) => (c.id === component.id ? "submitted" : c.status)));
      if (next !== plan.status) await tx.update(plans).set({ status: next }).where(eq(plans.id, plan.id));
      await planEvent(tx, plan.id, user.id, "proposal_submitted", `${component.name}: proposal submitted (${n} men)`);
      if (plan.initiatedBy) {
        await notifyUser(tx, plan.initiatedBy, {
          title: `${component.name} proposal submitted`,
          body: next === "consolidating" ? "All components are in — ready to consolidate." : `${plan.title}: ${n} men proposed.`,
          href: `/plans/${plan.id}/consolidate`,
          kind: next === "consolidating" ? "action" : "info",
        });
      }
      await audit({ action: "proposal.submit", entity: "plan_component", entityId: component.id, after: { slots: n } });
      refresh();
      return { slots: n, allIn: next === "consolidating" };
    },
  });
}

export async function uploadSectorImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser();
  if (!can(user, "plans.propose")) return { ok: false, error: "You don't have permission to do this." };
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  try {
    return { ok: true, data: { url: await saveImage(file, "sectors") } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function searchUnitPersonsAction(q: string) {
  const user = await requireUser();
  return searchUnitPersons(user, q);
}

