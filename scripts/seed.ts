/**
 * Seeds a fictional demo district: ranks, 4 units, 3 divisions, 12 stations/offices, ~400 police persons
 * with varied ages, gender and fitness (so the placement rules have something to work with).
 *
 *   pnpm db:seed           -> DATABASE_URL (dev)
 *   pnpm db:seed --test    -> TEST_DATABASE_URL
 *
 * Destructive: truncates the org tables first. Refuses to run when NODE_ENV=production or on a
 * Vercel production deployment, and needs --allow-remote for any non-local database (e.g. a Neon
 * development branch), so a cloud database is never wiped by accident.
 */
import { fakerEN_IN as faker } from "@faker-js/faker";
import { and, eq, sql } from "drizzle-orm";

import { insertUserWithPassword } from "../src/lib/auth/accounts";
import { PERMISSIONS } from "../src/lib/authz/permissions";
import type { Role } from "../src/lib/authz/roles";
import { createDb } from "../src/lib/db/client";
import { divisions, permissions, persons, ranks, roleAssignments, rolePermissions, stations, units } from "../src/lib/db/schema";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
import { scriptDatabaseUrl } from "./env";
import { seedMasters } from "./seed-masters";
import { AGE_BAND, APSP_DIVISIONS, DEMO_UNIT, DIVISIONS, NORTH_DIVISIONS, OTHER_UNITS, RANKS, SEED_REFERENCE_DATE } from "./seed-data";

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed a production environment.");
  process.exit(1);
}

faker.seed(2026);

function dobForAge(age: number): string {
  const d = new Date(SEED_REFERENCE_DATE);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCDate(d.getUTCDate() - faker.number.int({ min: 0, max: 364 }));
  return d.toISOString().slice(0, 10);
}

const usedPhones = new Set<string>();
function phone(): string {
  for (;;) {
    const p = `${faker.helpers.arrayElement(["9", "8", "7", "6"])}${faker.string.numeric(9)}`;
    if (!usedPhones.has(p)) {
      usedPhones.add(p);
      return p;
    }
  }
}

export async function seed(url: string) {
  const { db, pool } = createDb(url, { max: 2 });
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`TRUNCATE notifications_outbox, notifications, audit_log, role_permissions, permissions, role_assignments, rate_limits, verifications, sessions, accounts, users, persons, stations, divisions, units, ranks RESTART IDENTITY CASCADE`,
      );

      // Permission catalogue + default grants (editable later by the State Admin).
      await tx.insert(permissions).values(PERMISSIONS.map((p) => ({ key: p.key, module: p.module, label: p.label })));
      await tx.insert(rolePermissions).values(PERMISSIONS.flatMap((p) => p.roles.map((role) => ({ role, permissionKey: p.key }))));

      const rankRows = await tx.insert(ranks).values(RANKS.map((r) => ({ ...r }))).returning();
      const rankId = new Map(rankRows.map((r) => [r.code, r.id]));

      const [demo] = await tx
        .insert(units)
        .values({ ...DEMO_UNIT, displayOrder: 1, officerDesignation: "Superintendent of Police" })
        .returning();
      const others = await tx.insert(units).values(OTHER_UNITS.map((u, i) => ({ ...u, displayOrder: i + 2 }))).returning();
      const unitOf = (code: string) => others.find((u) => u.code === code)!;

      let order = 1;
      let total = 0;
      const seniorityOf = new Map(rankRows.map((r) => [r.id, r.seniority]));

      /** Stations and officers for one unit (ages, gender, fitness and availability vary realistically). */
      const addUnitStrength = async (unitId: string, divs: typeof DIVISIONS, firstGenNo: number) => {
        let genNo = firstGenNo;
        for (const div of divs) {
          const [division] = await tx.insert(divisions).values({ unitId, name: div.name }).returning();
          for (const st of div.stations) {
            const [station] = await tx
              .insert(stations)
              .values({ unitId, divisionId: division!.id, code: st.code, name: st.name, kind: st.kind, lat: st.lat, lng: st.lng, displayOrder: order++ })
              .returning();
            const rows: (typeof persons.$inferInsert)[] = [];
            for (const [rankCode, count] of Object.entries(st.strength)) {
              const [minAge, maxAge] = AGE_BAND[rankCode] ?? [25, 55];
              for (let i = 0; i < count; i++) {
                const isFemale = faker.number.float() < (st.femaleShare ?? (rankCode.includes("AR") ? 0.08 : 0.16));
                const sex = isFemale ? "female" : "male";
                const age = faker.number.int({ min: minAge, max: maxAge });
                const lightDuty = faker.number.float() < (age >= 50 ? 0.25 : 0.03);
                const roll = faker.number.float();
                rows.push({
                  unitId,
                  stationId: station!.id,
                  rankId: rankId.get(rankCode)!,
                  genNo: String(genNo++),
                  name: faker.person.fullName({ sex }),
                  gender: sex,
                  dob: dobForAge(age),
                  phone: phone(),
                  fitness: lightDuty ? "light_duty_only" : "fit",
                  availability: roll < 0.88 ? "available" : roll < 0.94 ? "on_leave" : roll < 0.97 ? "medical_leave" : "other",
                });
              }
            }
            const inserted = await tx.insert(persons).values(rows).returning({ id: persons.id, rankId: persons.rankId });
            total += inserted.length;
            // Office Incharge: the most senior officer present.
            const incharge = [...inserted].sort((a, b) => seniorityOf.get(a.rankId)! - seniorityOf.get(b.rankId)!)[0];
            if (incharge) await tx.update(stations).set({ inchargePersonId: incharge.id }).where(eq(stations.id, station!.id));
          }
        }
      };

      await addUnitStrength(demo!.id, DIVISIONS, 1001);

      // Unit officer on the unit record = the SP in the District Police Office.
      const [sp] = await tx
        .select({ name: persons.name, phone: persons.phone })
        .from(persons)
        .where(and(eq(persons.rankId, rankId.get("SP")!), eq(persons.unitId, demo!.id)))
        .limit(1);
      if (sp) await tx.update(units).set({ officerName: sp.name, officerPhone: sp.phone }).where(eq(units.id, demo!.id));

      // Demo logins (development only), linked to seeded officers.
      const personBy = async (where: ReturnType<typeof sql>) =>
        (await tx.execute<{ id: string; name: string; station_id: string }>(sql`select p.id, p.name, p.station_id from persons p join ranks r on r.id = p.rank_id join stations s on s.id = p.station_id where ${where} order by p.gen_no::int limit 1`)).rows[0];
      const stationId = async (code: string) => (await tx.select({ id: stations.id }).from(stations).where(eq(stations.code, code)).limit(1))[0]!.id;
      const inchargeOf = async (code: string) => personBy(sql`p.id = (select incharge_person_id from stations where code = ${code})`);

      type Demo = { username: string; person?: { id: string; name: string } | undefined; name?: string; roles: { role: Role; stationCode?: string }[] };
      const demos: Demo[] = [
        { username: "admin", name: "State Administrator", roles: [{ role: "SUPER_ADMIN" }] },
        { username: "sp", person: await personBy(sql`r.code = 'SP'`), roles: [{ role: "UNIT_OFFICER" }, { role: "INITIATING_OFFICER" }] },
        { username: "addlsp", person: await personBy(sql`r.code = 'Addl.SP'`), roles: [{ role: "INITIATING_OFFICER" }] },
        { username: "dsp1", person: await personBy(sql`r.code = 'DSP'`), roles: [{ role: "COMPONENT_OFFICER" }] },
        { username: "dsp2", person: await personBy(sql`r.code = 'DSP' and p.gen_no::int > (select min(gen_no::int) from persons p2 join ranks r2 on r2.id = p2.rank_id where r2.code = 'DSP')`), roles: [{ role: "COMPONENT_OFFICER" }] },
        { username: "sho.town1", person: await inchargeOf("PS-T1"), roles: [{ role: "OFFICE_INCHARGE", stationCode: "PS-T1" }] },
        { username: "sho.town2", person: await inchargeOf("PS-T2"), roles: [{ role: "OFFICE_INCHARGE", stationCode: "PS-T2" }] },
        { username: "sho.rural", person: await inchargeOf("PS-RUR"), roles: [{ role: "OFFICE_INCHARGE", stationCode: "PS-RUR" }] },
        { username: "om", person: await personBy(sql`r.code = 'SI' and s.code = 'DPO'`), roles: [{ role: "OFFICE_MANAGER" }] },
        { username: "staff1", person: await personBy(sql`r.code = 'HC' and s.code = 'DPO'`), roles: [{ role: "EMPLOYEE" }] },
        { username: "pc1015", person: await personBy(sql`p.gen_no = '1015'`), roles: [{ role: "PERSONNEL" }] },
      ];
      const userIdOf = new Map<string, string>();
      for (const d of demos) {
        const { userId } = await insertUserWithPassword(tx, {
          username: d.username,
          name: d.person?.name ?? d.name ?? d.username,
          personId: d.person?.id ?? null,
          password: DEMO_PASSWORD,
          mustChangePassword: false,
        });
        userIdOf.set(d.username, userId);
        for (const r of d.roles) {
          const state = r.role === "SUPER_ADMIN" || r.role === "DGP";
          await tx.insert(roleAssignments).values({
            userId,
            role: r.role,
            unitId: state ? null : demo!.id,
            stationId: r.stationCode ? await stationId(r.stationCode) : null,
          });
        }
      }

      const m = await seedMasters(tx, demo!.id, userIdOf.get("sho.town1") ?? null);

      // Another district and an APSP battalion, with their own Unit Officer / Office Incharge logins.
      const north = unitOf("NORTH-DIST");
      const apsp = unitOf("APSP-1");
      const demoPersons = total;
      await addUnitStrength(north.id, NORTH_DIVISIONS, 5001);
      await addUnitStrength(apsp.id, APSP_DIVISIONS, 7001);
      const unitPerson = async (unitId: string, where: ReturnType<typeof sql>) =>
        (await tx.execute<{ id: string; name: string }>(sql`select p.id, p.name from persons p join ranks r on r.id = p.rank_id join stations s on s.id = p.station_id where p.unit_id = ${unitId} and ${where} order by p.gen_no::int limit 1`)).rows[0];
      const more: { username: string; person?: { id: string; name: string }; name?: string; role: Role; unitId: string | null; stationCode?: string }[] = [
        { username: "dgp", name: "Director General of Police (demo)", role: "DGP", unitId: null },
        { username: "sp.north", person: await unitPerson(north.id, sql`r.code = 'SP'`), role: "UNIT_OFFICER", unitId: north.id },
        { username: "sho.north1", person: await unitPerson(north.id, sql`p.id = (select incharge_person_id from stations where code = 'NPS-1')`), role: "OFFICE_INCHARGE", unitId: north.id, stationCode: "NPS-1" },
        { username: "comdt.apsp", person: await unitPerson(apsp.id, sql`r.code = 'Comdt'`), role: "UNIT_OFFICER", unitId: apsp.id },
      ];
      for (const d of more) {
        const { userId } = await insertUserWithPassword(tx, { username: d.username, name: d.person?.name ?? d.name ?? d.username, personId: d.person?.id ?? null, password: DEMO_PASSWORD, mustChangePassword: false });
        const stationIdFor = d.stationCode ? (await tx.select({ id: stations.id }).from(stations).where(and(eq(stations.code, d.stationCode), eq(stations.unitId, d.unitId!))).limit(1))[0]!.id : null;
        await tx.insert(roleAssignments).values({ userId, role: d.role, unitId: d.unitId, stationId: stationIdFor });
      }
      for (const [u, code] of [
        [north, "NDPO"],
        [apsp, "APSP-HQ"],
      ] as const) {
        const [lead] = (await tx.execute<{ name: string; phone: string | null }>(sql`select p.name, p.phone from persons p join stations s on s.id = p.station_id where s.code = ${code} and p.id = s.incharge_person_id`)).rows;
        if (lead) await tx.update(units).set({ officerName: lead.name, officerPhone: lead.phone, officerDesignation: u.code === "APSP-1" ? "Commandant" : "Superintendent of Police" }).where(eq(units.id, u.id));
      }

      console.log(
        `Seeded ${m.points} deployment points, ${m.stock} equipment stock rows; ${rankRows.length} ranks, ${OTHER_UNITS.length + 1} units, ${order - 1} stations, ${demoPersons} persons in the demo district (${total} in all), ${PERMISSIONS.length} permissions, ${demos.length + more.length} demo users.`,
      );
    });
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1]?.endsWith("seed.ts");
if (isMain) {
  const { url, label, local } = scriptDatabaseUrl();
  if (!local && !process.argv.includes("--allow-remote")) {
    console.error(`Refusing to wipe and seed remote database ${label}. Re-run with --allow-remote if this is a disposable dev branch.`);
    process.exit(1);
  }
  console.log(`Seeding ${label} …`);
  seed(url).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
