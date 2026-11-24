/**
 * Apply Drizzle migrations.
 *   pnpm db:migrate              -> DATABASE_URL
 *   pnpm db:migrate --test       -> TEST_DATABASE_URL
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../src/lib/db/client";
import { requireEnv } from "./env";

async function main() {
  const url = process.argv.includes("--test") ? requireEnv("TEST_DATABASE_URL") : requireEnv("DATABASE_URL");
  const { db, pool } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
