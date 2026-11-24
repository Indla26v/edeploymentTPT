"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { rolePermissions } from "@/lib/db/schema";
import { UserError } from "@/lib/authz/authorize";
import { PERMISSION_KEYS } from "@/lib/authz/permissions";
import { ROLES } from "@/lib/authz/roles";
import { mutate } from "@/lib/server/mutate";

const schema = z.object({
  grants: z.array(z.object({ role: z.enum(ROLES), key: z.enum(PERMISSION_KEYS as [string, ...string[]]) })),
});

/** Replace the whole role × permission matrix. The State Admin can never remove their own access to this screen. */
export async function savePermissionsAction(input: z.input<typeof schema>) {
  return mutate({
    permission: "admin.roles.manage",
    schema,
    input,
    message: "Permissions saved",
    run: async ({ tx, data, audit }) => {
      if (!data.grants.some((g) => g.role === "SUPER_ADMIN" && g.key === "admin.roles.manage")) {
        throw new UserError("The State Admin must keep “Manage roles & permissions”.");
      }
      const before = await tx.select().from(rolePermissions);
      await tx.delete(rolePermissions);
      if (data.grants.length) await tx.insert(rolePermissions).values(data.grants.map((g) => ({ role: g.role, permissionKey: g.key })));
      await audit({ action: "permissions.save", entity: "role_permissions", before: before.length, after: data.grants.length });
      refresh();
    },
  });
}
