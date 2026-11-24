import "server-only";

import { attachDatabasePool } from "@vercel/functions";

import { createDb, type Db } from "./client";
import { appDatabaseUrl } from "./url";

const globalForDb = globalThis as unknown as { __edeployDb?: Db };

function init(): Db {
  const url = appDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDb(url);
  // On Vercel Fluid compute, keep the instance alive just long enough to close idle connections
  // instead of leaving them dangling when the function is suspended. No-op elsewhere.
  attachDatabasePool(pool);
  return db;
}

/** Lazily created so `next build` does not need a database unless a page actually queries. */
export function getDb(): Db {
  if (!globalForDb.__edeployDb) globalForDb.__edeployDb = init();
  return globalForDb.__edeployDb;
}

export * as schema from "./schema";
