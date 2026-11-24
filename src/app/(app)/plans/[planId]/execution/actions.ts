"use server";

import { refresh } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { UserError, assertStation } from "@/lib/authz/authorize";
import { accommodationAllotments, accommodations, equipmentAllocations, equipmentStock, equipmentTypes, persons, plans, stations } from "@/lib/db/schema";
import { autoAllot, equipmentFree } from "@/lib/execution/allocate";
import { getRoster, recordAttendance } from "@/lib/execution/server";
import { loadPlan, planEvent } from "@/lib/plans/server";
import { mutate } from "@/lib/server/mutate";
import { notifyUser } from "@/lib/server/notify";
import { planLeads, stationIncharges } from "@/lib/sourcing/server";
import { canMovePlan } from "@/lib/workflow/plan";

const id = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

/** Published → live (the bandobast is on) and live → completed. */
export async function setPlanStageAction(planId: string, to: "live" | "completed") {
  return mutate({
    permission: "execution.live",
    schema: z.object({ to: z.enum(["live", "completed"]) }),
    input: { to },
    message: to === "live" ? "The bandobast is live — check-ins are being tracked" : "Bandobast completed",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (!["UNIT_OFFICER", "INITIATING_OFFICER"].includes(user.activeRole)) throw new UserError("Only the Unit Officer or the Initiating Officer can change this.");
      if (!canMovePlan(plan.status, data.to)) throw new UserError(data.to === "live" ? "Publish the duty allocation first." : "Only a published or live bandobast can be completed.");
      await tx.update(plans).set({ status: data.to }).where(eq(plans.id, plan.id));
      await planEvent(tx, plan.id, user.id, data.to, data.to === "live" ? "Bandobast went live" : "Bandobast completed");
      for (const u of await planLeads(tx, plan.id)) if (u !== user.id) await notifyUser(tx, u, { title: `${plan.title} is ${data.to === "live" ? "live" : "completed"}`, href: `/plans/${plan.id}/live`, kind: "info" });
      await audit({ action: `plan.${data.to}`, entity: "plan", entityId: plan.id });
      refresh();
    },
  });
}

/** Supervisor marks an officer present / checked out (no QR). */
export async function markAttendanceAction(planId: string, input: { personId: string; event: "check_in" | "check_out" }) {
  return mutate({
    permission: "execution.live",
    schema: z.object({ personId: id, event: z.enum(["check_in", "check_out"]) }),
    input,
    message: input.event === "check_in" ? "Marked present" : "Marked checked out",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId);
      const r = await recordAttendance(tx, { planId: plan.id, personId: data.personId, event: data.event, via: "manual", recordedBy: user.id });
      if (!r.ok) throw new UserError(r.error);
      await audit({ action: "attendance.manual", entity: "plan", entityId: plan.id, after: data });
      refresh();
    },
  });
}

async function lodgingLoad(tx: Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"], unitId: string, planId: string, from: string, to: string) {
  const rows = await tx.select().from(accommodations).where(eq(accommodations.unitId, unitId));
  // Beds taken on overlapping dates by other plans.
  const other = await tx.execute<{ accommodation_id: string; n: number }>(sql`
    select accommodation_id, count(*)::int n from accommodation_allotments
    where plan_id <> ${planId} and from_date <= ${to}::date and to_date >= ${from}::date group by accommodation_id`);
  return rows.map((l) => ({ ...l, otherPlans: other.rows.find((o) => o.accommodation_id === l.id)?.n ?? 0 }));
}

/** Auto-allot lodging to every rostered officer without one (gender and capacity respected). */
export async function autoAllotAction(planId: string, input: { fromDate: string; toDate: string }) {
  return mutate({
    permission: "execution.accommodation",
    schema: z.object({ fromDate: day, toDate: day }).refine((d) => d.toDate >= d.fromDate, { path: ["toDate"], message: "Check-out must be on or after check-in" }),
    input,
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (!["published", "live"].includes(plan.status)) throw new UserError("Allot lodging after the duty allocation is published.");
      const roster = await getRoster(tx, plan.id);
      const existing = await tx.select().from(accommodationAllotments).where(eq(accommodationAllotments.planId, plan.id));
      const housed = new Set(existing.map((e) => e.personId));
      const lodgings = await lodgingLoad(tx, plan.unitId, plan.id, data.fromDate, data.toDate);
      const guests = roster.rows.filter((r) => !housed.has(r.id)).map((r) => ({ personId: r.id, gender: r.gender, stationId: r.stationId }));
      const { allotments, unhoused } = autoAllot(
        guests,
        lodgings.map((l) => ({ id: l.id, capacity: l.capacity, genderAllowed: l.genderAllowed, occupied: l.otherPlans + existing.filter((e) => e.accommodationId === l.id).length })),
      );
      if (allotments.length) await tx.insert(accommodationAllotments).values(allotments.map((a) => ({ planId: plan.id, personId: a.personId, accommodationId: a.lodgingId, fromDate: data.fromDate, toDate: data.toDate, createdBy: user.id })));
      await planEvent(tx, plan.id, user.id, "accommodation", `Lodging allotted to ${allotments.length} officers${unhoused.length ? `, ${unhoused.length} without a place` : ""}`);
      await audit({ action: "accommodation.auto", entity: "plan", entityId: plan.id, after: { allotted: allotments.length, unhoused: unhoused.length } });
      refresh();
      return { allotted: allotments.length, unhoused: unhoused.length };
    },
  });
}

/** Move one officer to another lodging (or remove), with a capacity and gender check. */
export async function setAllotmentAction(planId: string, input: { personId: string; accommodationId: string | null }) {
  return mutate({
    permission: "execution.accommodation",
    schema: z.object({ personId: id, accommodationId: id.nullable() }),
    input,
    message: input.accommodationId ? "Lodging changed" : "Lodging removed",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      const [cur] = await tx.select().from(accommodationAllotments).where(and(eq(accommodationAllotments.planId, plan.id), eq(accommodationAllotments.personId, data.personId))).limit(1);
      if (!data.accommodationId) {
        if (cur) await tx.delete(accommodationAllotments).where(eq(accommodationAllotments.id, cur.id));
      } else {
        const [l] = await tx.select().from(accommodations).where(and(eq(accommodations.id, data.accommodationId), eq(accommodations.unitId, plan.unitId))).limit(1);
        if (!l) throw new UserError("That lodging isn't in this unit.");
        const [p] = await tx.select({ gender: persons.gender }).from(persons).where(eq(persons.id, data.personId)).limit(1);
        if (l.genderAllowed !== "any" && l.genderAllowed !== p?.gender) throw new UserError(`${l.name} is for ${l.genderAllowed === "female" ? "women" : "men"} only.`);
        const from = cur?.fromDate ?? new Date().toISOString().slice(0, 10);
        const to = cur?.toDate ?? from;
        const load = (await lodgingLoad(tx, plan.unitId, plan.id, from, to)).find((x) => x.id === l.id)!;
        const mine = (await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(accommodationAllotments).where(and(eq(accommodationAllotments.planId, plan.id), eq(accommodationAllotments.accommodationId, l.id), ne(accommodationAllotments.personId, data.personId))))[0]!.n;
        if (load.otherPlans + mine >= l.capacity) throw new UserError(`${l.name} is full (${l.capacity}).`);
        if (cur) await tx.update(accommodationAllotments).set({ accommodationId: l.id }).where(eq(accommodationAllotments.id, cur.id));
        else await tx.insert(accommodationAllotments).values({ planId: plan.id, personId: data.personId, accommodationId: l.id, fromDate: from, toDate: to, createdBy: user.id });
      }
      await audit({ action: "accommodation.set", entity: "plan", entityId: plan.id, after: data });
      refresh();
    },
  });
}

/** Stay dates for one officer, or "apply to all". */
export async function setStayDatesAction(planId: string, input: { personId: string | null; fromDate: string; toDate: string }) {
  return mutate({
    permission: "execution.accommodation",
    schema: z.object({ personId: id.nullable(), fromDate: day, toDate: day }).refine((d) => d.toDate >= d.fromDate, { path: ["toDate"], message: "Check-out must be on or after check-in" }),
    input,
    message: input.personId ? "Stay dates saved" : "Stay dates applied to everyone",
    run: async ({ tx, user, data, audit }) => {
      const plan = await loadPlan(tx, user, planId);
      await tx
        .update(accommodationAllotments)
        .set({ fromDate: data.fromDate, toDate: data.toDate })
        .where(and(eq(accommodationAllotments.planId, plan.id), data.personId ? eq(accommodationAllotments.personId, data.personId) : sql`true`));
      await audit({ action: "accommodation.dates", entity: "plan", entityId: plan.id, after: data });
      refresh();
    },
  });
}

/** Outstanding (issued or planned, not yet returned) quantity of a type at a station across active plans. */
async function outstanding(tx: Parameters<Parameters<typeof mutate>[0]["run"]>[0]["tx"], stationId: string, typeId: string, exceptId?: string) {
  const [r] = await tx.execute<{ n: number }>(sql`
    select coalesce(sum(a.quantity - a.returned_qty), 0)::int n from equipment_allocations a join plans p on p.id = a.plan_id
    where a.station_id = ${stationId} and a.equipment_type_id = ${typeId} and p.status not in ('completed','cancelled') ${exceptId ? sql`and a.id <> ${exceptId}` : sql``}`).then((x) => x.rows);
  return r?.n ?? 0;
}

/** UO draws equipment from a station's working stock for the plan. Stock can never go negative. */
export async function allocateEquipmentAction(planId: string, input: { equipmentTypeId: string; stationId: string; quantity: number; planComponentId: string | null }) {
  return mutate({
    permission: "execution.equipment",
    schema: z.object({ equipmentTypeId: id, stationId: id, quantity: z.number().int().min(1).max(100000), planComponentId: id.nullable() }),
    input,
    message: "Equipment allocated — the station has been told",
    run: async ({ tx, user, data, audit }) => {
      if (user.activeRole !== "UNIT_OFFICER") throw new UserError("The Unit Officer allocates equipment.");
      const plan = await loadPlan(tx, user, planId, { forUpdate: true });
      if (!["placement", "published", "live"].includes(plan.status)) throw new UserError("Equipment is allocated from placement until the bandobast ends.");
      const [stock] = await tx.select().from(equipmentStock).where(and(eq(equipmentStock.stationId, data.stationId), eq(equipmentStock.equipmentTypeId, data.equipmentTypeId))).for("update").limit(1);
      if (!stock || stock.unitId !== plan.unitId) throw new UserError("That station holds no such equipment.");
      const free = equipmentFree(stock.working, await outstanding(tx, data.stationId, data.equipmentTypeId));
      if (data.quantity > free) throw new UserError(`Only ${free} working available at that station.`);
      await tx.insert(equipmentAllocations).values({ planId: plan.id, planComponentId: data.planComponentId, equipmentTypeId: data.equipmentTypeId, stationId: data.stationId, quantity: data.quantity, createdBy: user.id });
      const [t] = await tx.select({ name: equipmentTypes.name }).from(equipmentTypes).where(eq(equipmentTypes.id, data.equipmentTypeId));
      for (const u of await stationIncharges(tx, data.stationId)) await notifyUser(tx, u, { title: `Issue ${data.quantity} ${t?.name} for ${plan.title}`, href: "/station/equipment", kind: "action" });
      await audit({ action: "equipment.allocate", entity: "plan", entityId: plan.id, after: data });
      refresh();
    },
  });
}

export async function removeAllocationAction(allocationId: string) {
  return mutate({
    permission: "execution.equipment",
    schema: z.object({ id }),
    input: { id: allocationId },
    message: "Allocation removed",
    run: async ({ tx, user, data, audit }) => {
      const [a] = await tx.select().from(equipmentAllocations).where(eq(equipmentAllocations.id, data.id)).limit(1);
      if (!a) throw new UserError("That allocation no longer exists.");
      await loadPlan(tx, user, a.planId);
      if (a.issuedAt) throw new UserError("Already issued — the station must take it back first.");
      await tx.delete(equipmentAllocations).where(eq(equipmentAllocations.id, a.id));
      await audit({ action: "equipment.unallocate", entity: "equipment_allocation", entityId: a.id, before: a });
      refresh();
    },
  });
}

/** Office Incharge: hand over (issue) or take back (return) equipment drawn from the station. */
export async function issueReturnAction(allocationId: string, input: { action: "issue" | "return"; returnedQty?: number }) {
  return mutate({
    permission: "execution.equipment",
    schema: z.object({ action: z.enum(["issue", "return"]), returnedQty: z.number().int().min(0).optional() }),
    input,
    message: input.action === "issue" ? "Marked issued" : "Return recorded",
    run: async ({ tx, user, data, audit }) => {
      const [a] = await tx.select().from(equipmentAllocations).where(eq(equipmentAllocations.id, allocationId)).for("update").limit(1);
      if (!a) throw new UserError("That allocation no longer exists.");
      const [st] = await tx.select({ unitId: stations.unitId }).from(stations).where(eq(stations.id, a.stationId)).limit(1);
      assertStation(user, a.stationId, st!.unitId);
      if (data.action === "issue") {
        if (a.issuedAt) throw new UserError("Already issued.");
        await tx.update(equipmentAllocations).set({ issuedAt: new Date(), issuedBy: user.id }).where(eq(equipmentAllocations.id, a.id));
      } else {
        if (!a.issuedAt) throw new UserError("Issue it before recording a return.");
        const qty = data.returnedQty ?? a.quantity;
        if (qty > a.quantity) throw new UserError(`Only ${a.quantity} were issued.`);
        await tx.update(equipmentAllocations).set({ returnedQty: qty, returnedAt: new Date() }).where(eq(equipmentAllocations.id, a.id));
      }
      await audit({ action: `equipment.${data.action}`, entity: "equipment_allocation", entityId: a.id, after: data });
      refresh();
    },
  });
}

