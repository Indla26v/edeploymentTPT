/** Fictional master data for the demo district: components, points, equipment, accommodation, vehicles, teams, shifts… */
import { eq, sql } from "drizzle-orm";

import type { DbOrTx } from "../src/lib/auth/accounts";
import {
  accommodations,
  components,
  deploymentPoints,
  equipmentStock,
  equipmentTypes,
  idCardHeaders,
  instructions,
  shifts,
  stations,
  teams,
  transferRequests,
  unitProfiles,
  vehicles,
} from "../src/lib/db/schema";

export const COMPONENTS = ["Law & Order — North", "Law & Order — South", "Traffic", "VIP Security", "Women Safety", "Reserve & Striking"];

type P = [name: string, station: string, lat: number, lng: number, priority: 1 | 2 | 3 | 4, intensity: "high" | "medium" | "low", mobility: "static" | "mobile", gender: "any" | "male" | "female", description?: string];
export const POINTS: P[] = [
  ["Benz Circle junction", "PS-TRF", 16.4979, 80.6559, 1, "high", "static", "any", "Main traffic junction, heavy crowd"],
  ["Temple main gate", "PS-T1", 16.5175, 80.6061, 1, "high", "static", "any", "Queue control at entry"],
  ["Temple ladies queue", "PS-T1", 16.5178, 80.6066, 1, "high", "static", "female", "Women devotees queue"],
  ["Ghat road hairpin", "PS-T1", 16.5191, 80.6042, 2, "high", "mobile", "any", "Vehicle regulation on the ghat"],
  ["Railway station east exit", "PS-T2", 16.5186, 80.6200, 2, "medium", "static", "any"],
  ["Bus stand platform 1", "PS-T2", 16.5097, 80.6178, 2, "medium", "static", "any"],
  ["Bus stand ladies waiting hall", "PS-T2", 16.5101, 80.6182, 3, "low", "static", "female"],
  ["Collectorate entrance", "PS-T1", 16.5135, 80.6302, 3, "medium", "static", "any"],
  ["Stadium VIP gate", "DPO", 16.5093, 80.6450, 1, "medium", "static", "any", "VIP arrival and frisking"],
  ["Stadium general gallery", "DPO", 16.5089, 80.6441, 2, "high", "static", "any"],
  ["Stadium parking A", "PS-TRF", 16.5080, 80.6463, 3, "medium", "mobile", "any"],
  ["Market main road", "PS-MKT", 16.4991, 80.6125, 2, "high", "mobile", "any", "Foot patrol, pickpocket watch"],
  ["Market women's section", "PS-MKT", 16.4986, 80.6131, 3, "medium", "static", "female"],
  ["Harbour gate 2", "PS-HBR", 16.4851, 80.6690, 3, "low", "static", "male"],
  ["Fish market crossing", "PS-HBR", 16.4870, 80.6655, 3, "medium", "static", "any"],
  ["Highway toll plaza", "PS-HWY", 16.4602, 80.6540, 2, "medium", "mobile", "any", "Vehicle checking"],
  ["Highway flyover start", "PS-HWY", 16.4633, 80.6511, 4, "low", "static", "any"],
  ["Rural mandal office", "PS-RUR", 16.4718, 80.6255, 4, "low", "static", "any"],
  ["Village procession route", "PS-RUR", 16.4741, 80.6233, 2, "high", "mobile", "any"],
  ["River ghat steps", "PS-T1", 16.5052, 80.6088, 1, "high", "static", "any", "Drowning risk, crowd at the steps"],
  ["Hospital casualty gate", "PS-T2", 16.5154, 80.6249, 4, "low", "static", "any", "Rest-friendly post"],
  ["College road", "PS-WMN", 16.5124, 80.6410, 3, "medium", "mobile", "female", "Eve-teasing prevention"],
  ["Control room liaison", "DCR", 16.5071, 80.6463, 4, "low", "static", "any"],
];

const EQUIPMENT: [string, number][] = [
  ["Lathi", 40],
  ["Body protector", 12],
  ["Riot helmet", 15],
  ["Metal detector (HHMD)", 4],
  ["Walkie-talkie", 10],
  ["Barricade", 20],
];

export async function seedMasters(tx: DbOrTx, unitId: string, requestedBy: string | null) {
  const st = new Map((await tx.select({ id: stations.id, code: stations.code }).from(stations).where(eq(stations.unitId, unitId))).map((s) => [s.code, s.id]));
  const sid = (code: string) => st.get(code) ?? null;

  await tx.insert(components).values(COMPONENTS.map((name) => ({ unitId, name })));
  await tx.insert(deploymentPoints).values(
    POINTS.map(([name, station, lat, lng, p, i, m, g, description]) => ({ unitId, stationId: sid(station), name, lat, lng, defaultPriority: p, defaultIntensity: i, defaultMobility: m, genderReq: g, description: description ?? null })),
  );

  const types = await tx.insert(equipmentTypes).values(EQUIPMENT.map(([name]) => ({ unitId, name }))).returning();
  const stock: (typeof equipmentStock.$inferInsert)[] = [];
  let n = 0;
  for (const [code, stationId] of st) {
    if (code === "DCR" || code === "SB") continue;
    types.forEach((t, i) => {
      if ((n + i) % 3 === 2) return; // not every station holds every item
      const base = EQUIPMENT[i]![1];
      const total = code === "CAR" ? base * 3 : Math.max(2, Math.round(base * (0.4 + ((n * 7 + i * 3) % 6) / 10)));
      const broken = (n + i) % 4 === 0 ? Math.ceil(total * 0.15) : 0;
      stock.push({ unitId, stationId, equipmentTypeId: t.id, total, working: total - broken, custodianName: i % 2 ? "Head Constable (Store)" : null, custodianDesignation: i % 2 ? "Store in-charge" : null });
    });
    n++;
  }
  await tx.insert(equipmentStock).values(stock);

  await tx.insert(accommodations).values([
    { unitId, stationId: sid("PS-T1"), category: "function_hall", name: "Sri Durga Kalyana Mandapam", capacity: 120, genderAllowed: "male", contactName: "Manager", contactPhone: "9848000101", lat: 16.5161, lng: 80.6089 },
    { unitId, stationId: sid("PS-T2"), category: "school", name: "ZP High School, Town II", capacity: 80, genderAllowed: "male", contactName: "Headmaster", contactPhone: "9848000102", lat: 16.5207, lng: 80.6171 },
    { unitId, stationId: sid("PS-WMN"), category: "college", name: "Govt. Women's College Hostel", capacity: 40, genderAllowed: "female", contactName: "Warden", contactPhone: "9848000103", lat: 16.5118, lng: 80.6415 },
    { unitId, stationId: sid("CAR"), category: "dormitory", name: "AR Barracks Dormitory", capacity: 150, genderAllowed: "any", contactName: "RI (AR)", contactPhone: "9848000104", lat: 16.5291, lng: 80.6549 },
    { unitId, stationId: sid("PS-TRF"), category: "hotel", name: "Hotel Krishna Residency", capacity: 30, genderAllowed: "any", contactName: "Front office", contactPhone: "9848000105", lat: 16.5069, lng: 80.6481 },
  ]);

  await tx.insert(vehicles).values([
    { unitId, stationId: sid("PS-T1"), number: "AP16 PD 1001", kind: "Jeep", officerName: "Town I SHO", officerRank: "CI" },
    { unitId, stationId: sid("PS-T2"), number: "AP16 PD 1002", kind: "Jeep", officerName: "Town II SHO", officerRank: "CI" },
    { unitId, stationId: sid("PS-TRF"), number: "AP16 PD 2001", kind: "Interceptor", officerName: "Traffic SI", officerRank: "SI" },
    { unitId, stationId: sid("CAR"), number: "AP16 PD 3001", kind: "Van (Striking force)", officerName: "RSI (AR)", officerRank: "RSI(AR)" },
    { unitId, stationId: sid("CAR"), number: "AP16 PD 3002", kind: "Bus", officerName: "RSI (AR)", officerRank: "RSI(AR)", isAvailable: false },
    { unitId, stationId: sid("DPO"), number: "AP16 PD 0001", kind: "Escort", officerName: "DSP (Admin)", officerRank: "DSP" },
  ]);

  await tx.insert(teams).values([
    { unitId, name: "Rope Party", composition: [{ rankCode: "HC", count: 1 }, { rankCode: "PC", count: 6 }] },
    { unitId, name: "Pickup Party", composition: [{ rankCode: "SI", count: 1 }, { rankCode: "HC", count: 1 }, { rankCode: "PC", count: 4 }] },
    { unitId, name: "Striking Force", composition: [{ rankCode: "RSI(AR)", count: 1 }, { rankCode: "HC(AR)", count: 2 }, { rankCode: "PC(AR)", count: 10 }] },
    { unitId, name: "Bomb Disposal Squad", composition: [{ rankCode: "SI", count: 1 }, { rankCode: "PC", count: 3 }] },
  ]);

  await tx.insert(shifts).values([
    { unitId, name: "Morning", startTime: "06:00", endTime: "14:00" },
    { unitId, name: "Evening", startTime: "14:00", endTime: "22:00" },
    { unitId, name: "Night", startTime: "22:00", endTime: "06:00" },
  ]);

  await tx.insert(instructions).values([
    { unitId, title: "General conduct", body: "Report 30 minutes before duty time in full uniform with ID card. Do not leave the point without relief." },
    { unitId, title: "Crowd control", body: "Keep queues moving; never block emergency exits. Inform the sector incharge of any stampede-like situation immediately." },
    { unitId, title: "VIP security", body: "Only pass holders beyond the inner cordon. Frisk all visitors; mobile phones in the designated counter." },
    { unitId, title: "Women devotees", body: "Women officers handle frisking and queue management for women devotees." },
  ]);

  await tx.insert(idCardHeaders).values([{ unitId, title: "Demo District Police — Bandobast Duty" }]);
  await tx.insert(unitProfiles).values({ unitId, about: "Demo District Police (fictional) — used to demonstrate eDeployment." });

  // One pending transfer request so the approval screen has something to show.
  const [mover] = (
    await tx.execute<{ id: string; station_id: string }>(
      sql`select p.id, p.station_id from persons p join ranks r on r.id = p.rank_id join stations s on s.id = p.station_id where s.code = 'PS-T1' and r.code = 'PC' and p.id not in (select incharge_person_id from stations where incharge_person_id is not null) order by p.gen_no::int desc limit 1`,
    )
  ).rows;
  if (mover && sid("PS-MKT")) {
    await tx.insert(transferRequests).values({ unitId, personId: mover.id, fromStationId: mover.station_id, toStationId: sid("PS-MKT")!, reason: "Resides near Market PS limits; requested by the officer.", requestedBy });
  }
  return { points: POINTS.length, stock: stock.length };
}
