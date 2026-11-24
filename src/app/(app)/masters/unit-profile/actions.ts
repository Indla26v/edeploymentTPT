"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { unitProfiles, units } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { UserError, can, isStateLevel } from "@/lib/authz/authorize";
import { readForm } from "@/lib/masters/server";
import { mutate, type ActionResult } from "@/lib/server/mutate";
import { unitProfileFields } from "./fields";

const schema = z.object({
  officerName: z.string().trim().min(2, "Enter the officer's name").max(120),
  officerDesignation: z.string().trim().min(2, "Enter the designation").max(120),
  officerPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number"),
  about: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  logoUrl: z.string().nullable().optional(),
  signatureUrl: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
});

export async function saveUnitProfileAction(formData: FormData): Promise<ActionResult<void>> {
  const user = await requireUser();
  if (!can(user, "masters.unitprofile.manage")) return { ok: false, error: "You don't have permission to do this." };
  const read = await readForm(unitProfileFields, formData, () => "units");
  if ("error" in read) return { ok: false, error: read.error, fieldErrors: { [read.field]: read.error } };
  return mutate({
    permission: "masters.unitprofile.manage",
    schema,
    input: read.values,
    message: "Unit profile saved",
    run: async ({ tx, user, data, audit }) => {
      if (!user.unitId || isStateLevel(user)) throw new UserError("Switch to a unit role to edit the unit profile.");
      const { officerName, officerDesignation, officerPhone, ...profile } = data;
      // Image fields left untouched are undefined → keep the stored value.
      const images = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined));
      await tx.update(units).set({ officerName, officerDesignation, officerPhone }).where(eq(units.id, user.unitId));
      await tx
        .insert(unitProfiles)
        .values({ unitId: user.unitId, ...images })
        .onConflictDoUpdate({ target: unitProfiles.unitId, set: images });
      await audit({ action: "unit.profile.update", entity: "unit", entityId: user.unitId, after: data });
      refresh();
    },
  });
}
