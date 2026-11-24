import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import { roleAssignments, units } from "../db/schema";
import { stationFree } from "./server";

/** Free men per unit and rank for a duty window (sum of each unit's stations). */
export async function unitFree(db: DbOrTx, range: string, excludeUnitId?: string) {
  const us = await db.select({ id: units.id, name: units.name, code: units.code, type: units.type, displayOrder: units.displayOrder }).from(units).where(excludeUnitId ? ne(units.id, excludeUnitId) : undefined);
  const out: { id: string; name: string; code: string; type: string; free: Record<string, number> }[] = [];
  for (const u of us.sort((a, b) => a.displayOrder - b.displayOrder)) {
    const perStation = await stationFree(db, u.id, range);
    const free: Record<string, number> = {};
    for (const cells of perStation.values()) for (const [rank, n] of Object.entries(cells)) free[rank] = (free[rank] ?? 0) + n;
    out.push({ id: u.id, name: u.name, code: u.code, type: u.type, free });
  }
  return out;
}

export async function dgpUsers(db: DbOrTx): Promise<string[]> {
  const rows = await db.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.role, "DGP"), eq(roleAssignments.isActive, true)));
  return [...new Set(rows.map((r) => r.userId))];
}

/** Greedy pre-fill for the DGP grid: units with the most free men first, keeping a quarter in reserve. */
export function prefillUnits(need: Record<string, number>, supply: { id: string; free: Record<string, number> }[], reserve = 0.25) {
  const grid: Record<string, Record<string, number>> = {};
  for (const [rank, n] of Object.entries(need)) {
    let left = n;
    const order = [...supply].sort((a, b) => (b.free[rank] ?? 0) - (a.free[rank] ?? 0));
    for (const u of order) {
      if (left <= 0) break;
      const spare = Math.max(0, (u.free[rank] ?? 0) - Math.ceil((u.free[rank] ?? 0) * reserve));
      const take = Math.min(left, spare);
      if (take > 0) {
        (grid[u.id] ??= {})[rank] = take;
        left -= take;
      }
    }
  }
  return grid;
}
