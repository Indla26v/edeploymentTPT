"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { equipmentStock, equipmentTypes, stations } from "@/lib/db/schema";
import { UserError, assertStation, assertUnit, isStateLevel } from "@/lib/authz/authorize";
import { mutate } from "@/lib/server/mutate";

const optText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => v || null);

export async function saveEquipmentTypeAction(id: string | null, name: string) {
  return mutate({
    permission: "masters.equipment.manage",
    schema: z.object({ name: z.string().trim().min(2, "Enter the equipment name").max(80) }),
    input: { name },
    message: id ? "Equipment type renamed" : "Equipment type added",
    run: async ({ tx, user, data, audit }) => {
      if (!user.unitId || isStateLevel(user)) throw new UserError("Switch to a unit role to manage equipment.");
      if (id) {
        const [t] = await tx.select().from(equipmentTypes).where(eq(equipmentTypes.id, id)).limit(1);
        if (!t) throw new UserError("That equipment type no longer exists.");
        assertUnit(user, t.unitId);
        await tx.update(equipmentTypes).set({ name: data.name }).where(eq(equipmentTypes.id, id));
        await audit({ action: "equipment_type.update", entity: "equipment_type", entityId: id, before: t, after: data });
      } else {
        const [row] = await tx.insert(equipmentTypes).values({ unitId: user.unitId, name: data.name }).returning({ id: equipmentTypes.id });
        await audit({ action: "equipment_type.create", entity: "equipment_type", entityId: row!.id, after: data });
      }
      refresh();
    },
  });
}

export async function deleteEquipmentTypeAction(id: string) {
  return mutate({
    permission: "masters.equipment.manage",
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: "Equipment type deleted",
    run: async ({ tx, user, data, audit }) => {
      const [t] = await tx.select().from(equipmentTypes).where(eq(equipmentTypes.id, data.id)).limit(1);
      if (!t) throw new UserError("That equipment type no longer exists.");
      assertUnit(user, t.unitId);
      await tx.delete(equipmentTypes).where(eq(equipmentTypes.id, data.id));
      await audit({ action: "equipment_type.delete", entity: "equipment_type", entityId: data.id, before: t });
      refresh();
    },
  });
}

const stockSchema = z
  .object({
    stationId: z.string().uuid("Choose a station"),
    equipmentTypeId: z.string().uuid("Choose the equipment"),
    total: z.coerce.number().int().min(0, "Can't be negative").max(100000),
    working: z.coerce.number().int().min(0, "Can't be negative").max(100000),
    custodianName: optText,
    custodianDesignation: optText,
    custodianPhone: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number"),
  })
  .refine((d) => d.working <= d.total, { path: ["working"], message: "Working can't exceed total" });

export async function saveStockAction(id: string | null, input: z.input<typeof stockSchema>) {
  return mutate({
    permission: "masters.equipment.manage",
    schema: stockSchema,
    input,
    message: "Stock saved",
    run: async ({ tx, user, data, audit }) => {
      const [st] = await tx.select({ unitId: stations.unitId }).from(stations).where(eq(stations.id, data.stationId)).limit(1);
      if (!st) throw new UserError("That station no longer exists.");
      assertStation(user, data.stationId, st.unitId);
      const [t] = await tx.select({ unitId: equipmentTypes.unitId }).from(equipmentTypes).where(eq(equipmentTypes.id, data.equipmentTypeId)).limit(1);
      if (!t || t.unitId !== st.unitId) throw new UserError("That equipment type isn't in this unit.");
      if (id) {
        const [before] = await tx.select().from(equipmentStock).where(eq(equipmentStock.id, id)).limit(1);
        if (!before) throw new UserError("That stock row no longer exists.");
        assertUnit(user, before.unitId);
        await tx.update(equipmentStock).set(data).where(eq(equipmentStock.id, id));
        await audit({ action: "equipment_stock.update", entity: "equipment_stock", entityId: id, before, after: data });
      } else {
        const [row] = await tx
          .insert(equipmentStock)
          .values({ ...data, unitId: st.unitId })
          .onConflictDoUpdate({ target: [equipmentStock.stationId, equipmentStock.equipmentTypeId], set: data })
          .returning({ id: equipmentStock.id });
        await audit({ action: "equipment_stock.upsert", entity: "equipment_stock", entityId: row!.id, after: data });
      }
      refresh();
    },
  });
}

export async function deleteStockAction(id: string) {
  return mutate({
    permission: "masters.equipment.manage",
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: "Stock row removed",
    run: async ({ tx, user, data, audit }) => {
      const [s] = await tx.select().from(equipmentStock).where(eq(equipmentStock.id, data.id)).limit(1);
      if (!s) throw new UserError("That stock row no longer exists.");
      assertUnit(user, s.unitId);
      await tx.delete(equipmentStock).where(eq(equipmentStock.id, data.id));
      await audit({ action: "equipment_stock.delete", entity: "equipment_stock", entityId: data.id, before: s });
      refresh();
    },
  });
}
