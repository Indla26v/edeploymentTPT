import "server-only";

import { createDb, type Db } from "./client";

const globalForDb = globalThis as unknown as { __edeployDb?: Db };

function init(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return createDb(url).db;
}

/** Lazily created so `next build` does not need a database unless a page actually queries. */
export function getDb(): Db {
  if (!globalForDb.__edeployDb) globalForDb.__edeployDb = init();
  return globalForDb.__edeployDb;
}

export * as schema from "./schema";
