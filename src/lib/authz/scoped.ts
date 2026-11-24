import "server-only";

import { inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { CurrentUser } from "../auth/session";
import { scopeStationIds, scopeUnitIds } from "./authorize";

/**
 * Scoped query conditions. Every list query for scoped data must use one of these, so forgetting a
 * WHERE clause can never leak another unit's or station's records.
 */
export function unitScope(user: CurrentUser, column: AnyPgColumn): SQL {
  const ids = scopeUnitIds(user);
  if (ids === null) return sql`true`;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids);
}

export function stationScope(user: CurrentUser, column: AnyPgColumn): SQL {
  const ids = scopeStationIds(user);
  if (ids === null) return sql`true`;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids);
}
