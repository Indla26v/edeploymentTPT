import { migrate } from "drizzle-orm/node-postgres/migrator";
import { count, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../../scripts/env";
import { seed } from "../../scripts/seed";
import { AGE_BAND, SEED_REFERENCE_DATE } from "../../scripts/seed-data";
import { createDb, type Db } from "@/lib/db/client";
import { persons, ranks, stations, units } from "@/lib/db/schema";
import { ageFromDob } from "@/lib/utils";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database: migrations + demo seed", () => {
  let db: Db;
  let end: () => Promise<void>;

  beforeAll(async () => {
    const c = createDb(url!, { max: 2 });
    db = c.db;
    end = () => c.pool.end();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seed(url!);
  }, 60_000);

  afterAll(async () => {
    await end?.();
  });

  it("loads the demo district", async () => {
    const [demo] = await db.select().from(units).where(eq(units.code, "DEMO-DIST"));
    const [p] = await db.select({ n: count() }).from(persons).where(eq(persons.unitId, demo!.id));
    const [s] = await db.select({ n: count() }).from(stations).where(eq(stations.unitId, demo!.id));
    const [u] = await db.select({ n: count() }).from(units);
    expect(p!.n).toBe(400);
    expect(s!.n).toBe(12);
    expect(u!.n).toBe(4);
    // North district and the APSP battalion also have officers (for inter-district requests).
    const [all] = await db.select({ n: count() }).from(persons);
    expect(all!.n).toBeGreaterThan(400);
  });

  it("gives every station an Office Incharge", async () => {
    const [missing] = await db.select({ n: count() }).from(stations).where(isNull(stations.inchargePersonId));
    expect(missing!.n).toBe(0);
  });

  it("keeps derived ages inside each rank's band", async () => {
    const rows = await db.select({ code: ranks.code, dob: persons.dob }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId));
    for (const r of rows) {
      const band = AGE_BAND[r.code];
      if (!band) continue;
      const age = ageFromDob(r.dob, SEED_REFERENCE_DATE);
      expect(age).toBeGreaterThanOrEqual(band[0]);
      expect(age).toBeLessThanOrEqual(band[1]);
    }
  });

  it("includes light-duty officers for the placement rules to work with", async () => {
    const [ld] = await db.select({ n: count() }).from(persons).where(eq(persons.fitness, "light_duty_only"));
    expect(ld!.n).toBeGreaterThan(0);
  });

  it("rejects a duplicate General Number within a unit", async () => {
    const [existing] = await db.select().from(persons).limit(1);
    await expect(
      db.insert(persons).values({ ...existing!, id: undefined, phone: null, createdAt: undefined, updatedAt: undefined }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate mobile number", async () => {
    const [a, b] = await db.select().from(persons).limit(2);
    await expect(db.update(persons).set({ phone: a!.phone }).where(eq(persons.id, b!.id))).rejects.toThrow();
  });

  it("has the btree_gist extension needed for double-booking protection", async () => {
    const res = await db.execute(sql`select 1 from pg_extension where extname = 'btree_gist'`);
    expect(res.rowCount).toBe(1);
  });
});
