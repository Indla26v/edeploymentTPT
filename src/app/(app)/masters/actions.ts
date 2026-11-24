"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getDef, buildSchema, deleteMaster, readForm, reorderUnits, saveMaster } from "@/lib/masters/server";
import { mutate, type ActionResult } from "@/lib/server/mutate";

/**
 * Generic create/update for config-driven masters. Values arrive as FormData so image fields can carry files;
 * structured fields (latlng, composition) are JSON strings.
 */
export async function saveMasterAction(key: string, id: string | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const def = getDef(key);
  if (!def) return { ok: false, error: "Unknown master." };
  const user = await requireUser();
  if (!can(user, def.managePermission)) return { ok: false, error: "You don't have permission to do this." };

  const read = await readForm(def.fields, formData, () => "headers");
  if ("error" in read) return { ok: false, error: read.error, fieldErrors: { [read.field]: read.error } };
  const values = read.values;

  return mutate({
    permission: def.managePermission,
    schema: buildSchema(def),
    input: values,
    message: `${def.singular[0]!.toUpperCase()}${def.singular.slice(1)} saved`,
    run: async ({ tx, user: u, data, audit }) => {
      const res = await saveMaster(tx, u, def, id, data as Record<string, unknown>);
      await audit({ action: id ? `${key}.update` : `${key}.create`, entity: key, entityId: res.id, before: res.before, after: data });
      refresh();
      return { id: res.id };
    },
  });
}

export async function deleteMasterAction(key: string, id: string) {
  const def = getDef(key);
  if (!def) return { ok: false as const, error: "Unknown master." };
  return mutate({
    permission: def.managePermission,
    schema: z.object({ id: z.string().uuid() }),
    input: { id },
    message: `${def.singular[0]!.toUpperCase()}${def.singular.slice(1)} deleted`,
    run: async ({ tx, user, data, audit }) => {
      const before = await deleteMaster(tx, user, def, data.id);
      await audit({ action: `${key}.delete`, entity: key, entityId: data.id, before });
      refresh();
    },
  });
}

export async function reorderUnitsAction(ids: string[]) {
  return mutate({
    permission: "masters.units.manage",
    schema: z.object({ ids: z.array(z.string().uuid()).min(1) }),
    input: { ids },
    message: "Order saved",
    run: async ({ tx, data, audit }) => {
      await reorderUnits(tx, data.ids);
      await audit({ action: "units.reorder", entity: "units", after: data.ids });
      refresh();
    },
  });
}
