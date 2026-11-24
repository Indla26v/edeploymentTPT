/**
 * Connection-string handling for local Postgres and Neon.
 *
 * Neon (via the Vercel Marketplace integration) provides two URLs:
 *   DATABASE_URL           pooled (PgBouncer, "-pooler" host) — used by the running app
 *   DATABASE_URL_UNPOOLED  direct  — used for migrations, seeding and drizzle-kit
 * Migrations need a direct connection (session-level locks and DDL do not belong behind
 * a transaction-mode pooler).
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

/**
 * Neon serves certificates from a public CA, so full verification works. node-postgres already
 * treats sslmode=require as verify-full but warns on every cold start; say so explicitly instead.
 */
export function normalizeDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const mode = url.searchParams.get("sslmode");
  if (mode === "require" || mode === "prefer" || mode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
  // node-postgres does not read this libpq parameter; drop it so it is not mistaken for a setting we honour.
  url.searchParams.delete("channel_binding");
  return url.toString();
}

export function isLocalDatabase(raw: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function isNeonDatabase(raw: string): boolean {
  try {
    return new URL(raw).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

/** URL for the running app (pooled on Neon). */
export function appDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const u = env.DATABASE_URL;
  return u ? normalizeDatabaseUrl(u) : undefined;
}

/** URL for migrations / seeding / drizzle-kit (direct connection on Neon). */
export function directDatabaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const u = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  return u ? normalizeDatabaseUrl(u) : undefined;
}

/** For logs: host and database only, never credentials. */
export function describeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}
