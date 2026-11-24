import { describe, expect, it } from "vitest";

import {
  appDatabaseUrl,
  describeDatabaseUrl,
  directDatabaseUrl,
  isLocalDatabase,
  isNeonDatabase,
  normalizeDatabaseUrl,
} from "@/lib/db/url";

const POOLED = "postgresql://app:secret@ep-cool-sky-123-pooler.ap-south-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const DIRECT = "postgresql://app:secret@ep-cool-sky-123.ap-south-1.aws.neon.tech/neondb?sslmode=require";

describe("database URLs (Neon + local)", () => {
  it("makes full certificate verification explicit and drops libpq-only params", () => {
    const u = new URL(normalizeDatabaseUrl(POOLED));
    expect(u.searchParams.get("sslmode")).toBe("verify-full");
    expect(u.searchParams.has("channel_binding")).toBe(false);
    expect(u.username).toBe("app");
  });

  it("leaves local URLs alone", () => {
    const local = "postgresql://edeploy:edeploy@localhost:5432/edeployment";
    expect(normalizeDatabaseUrl(local)).toBe(local);
    expect(isLocalDatabase(local)).toBe(true);
    expect(isNeonDatabase(local)).toBe(false);
  });

  it("uses the pooled URL for the app and the direct URL for migrations", () => {
    const env = { DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT };
    expect(appDatabaseUrl(env)).toContain("-pooler.");
    expect(directDatabaseUrl(env)).not.toContain("-pooler.");
    expect(isNeonDatabase(directDatabaseUrl(env)!)).toBe(true);
    expect(isLocalDatabase(directDatabaseUrl(env)!)).toBe(false);
  });

  it("falls back to DATABASE_URL when there is no unpooled URL", () => {
    expect(directDatabaseUrl({ DATABASE_URL: DIRECT })).toContain("ep-cool-sky-123.");
    expect(directDatabaseUrl({})).toBeUndefined();
  });

  it("never prints credentials when describing a URL", () => {
    const d = describeDatabaseUrl(POOLED);
    expect(d).toBe("ep-cool-sky-123-pooler.ap-south-1.aws.neon.tech/neondb");
    expect(d).not.toContain("secret");
  });
});
