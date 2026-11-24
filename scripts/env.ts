import { config } from "dotenv";

import { describeDatabaseUrl, directDatabaseUrl, isLocalDatabase } from "../src/lib/db/url";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  return v;
}

/**
 * Database URL for scripts: TEST_DATABASE_URL with --test, otherwise the *direct* (unpooled)
 * connection — on Neon that is DATABASE_URL_UNPOOLED.
 */
export function scriptDatabaseUrl(argv: string[] = process.argv): { url: string; label: string; local: boolean } {
  const url = argv.includes("--test") ? requireEnv("TEST_DATABASE_URL") : directDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return { url, label: describeDatabaseUrl(url), local: isLocalDatabase(url) };
}
