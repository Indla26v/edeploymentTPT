import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/** Creates a Drizzle client. Used by the app (via ./index) and by scripts/tests that run outside Next.js. */
export function createDb(connectionString: string, opts: { max?: number } = {}) {
  const pool = new Pool({ connectionString, max: opts.max ?? 10 });
  return { db: drizzle(pool, { schema, casing: "snake_case" }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
