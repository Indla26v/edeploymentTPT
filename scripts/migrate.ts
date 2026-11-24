/**
 * Apply Drizzle migrations.
 *   pnpm db:migrate              -> DATABASE_URL_UNPOOLED (Neon direct) or DATABASE_URL
 *   pnpm db:migrate --test       -> TEST_DATABASE_URL
 * Also runs on every Vercel deployment (see "vercel-build" in package.json), so each Neon
 * preview branch gets the schema of the code being deployed.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../src/lib/db/client";
import { scriptDatabaseUrl } from "./env";

async function main() {
  const { url, label } = scriptDatabaseUrl();
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log(`Migrations applied to ${label}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
