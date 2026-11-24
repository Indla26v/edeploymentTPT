import type { Officer, PointProfile, Slot } from "@/lib/placement/rules";
import type { RankLedgerInput } from "@/lib/sourcing/ledger";

/** Fictional sample data for the design showcase only. */

export type SamplePerson = {
  id: string;
  genNo: string;
  name: string;
  rank: string;
  station: string;
  age: number;
  gender: "male" | "female";
  fitness: "fit" | "light_duty_only";
  available: boolean;
  phone: string;
};

const NAMES: [string, "male" | "female"][] = [
  ["Ravi Kumar Allam", "male"], ["Suresh Babu Kota", "male"], ["Anitha Devi Pulla", "female"], ["Lakshmi Prasanna G", "female"],
  ["Mahesh Naidu V", "male"], ["Prasad Rao Bandi", "male"], ["Kiran Teja M", "male"], ["Nagaraju Chinta", "male"],
  ["Divya Sree K", "female"], ["Venkateswarlu P", "male"], ["Srinivasa Rao T", "male"], ["Ramana Murthy D", "male"],
  ["Bhavani Shankar Y", "male"], ["Swathi Reddy N", "female"], ["Gopala Krishna S", "male"], ["Hari Babu Pothula", "male"],
  ["Madhavi Latha R", "female"], ["Chandra Sekhar B", "male"], ["Durga Prasad J", "male"], ["Satyanarayana K", "male"],
  ["Padmaja Rani L", "female"], ["Rambabu Gorle", "male"], ["Sai Kiran Ponnada", "male"], ["Jyothi Lakshmi A", "female"],
];
const RANKS = ["PC", "PC", "PC", "HC", "PC", "HC", "PC", "ASI", "PC", "HC", "SI", "HC", "PC", "PC", "ASI", "PC", "PC", "SI", "HC", "ASI", "PC", "HC", "PC", "PC"];
const STATIONS = ["Town I PS", "Town II PS", "Rural PS", "Harbour PS", "Traffic PS", "Women PS", "City Armed Reserve"];
const AGES = [26, 52, 29, 47, 31, 56, 24, 49, 33, 54, 38, 45, 41, 28, 51, 35, 44, 39, 57, 48, 30, 43, 27, 36];

export const SAMPLE_PERSONS: SamplePerson[] = NAMES.map(([name, gender], i) => ({
  id: `p${i + 1}`,
  genNo: String(4100 + i * 7),
  name,
  gender,
  rank: RANKS[i]!,
  station: STATIONS[i % STATIONS.length]!,
  age: AGES[i]!,
  fitness: i === 5 || i === 18 ? "light_duty_only" : "fit",
  available: i % 9 !== 4,
  phone: `9${String(800000000 + i * 1234567).slice(0, 9)}`,
}));

export const SAMPLE_LEDGER: RankLedgerInput[] = [
  { rankCode: "SI", required: 14, requested: 14, committed: 14, named: 14, acceptedShortfall: 0 },
  { rankCode: "ASI", required: 4, requested: 4, committed: 4, named: 3, acceptedShortfall: 0 },
  { rankCode: "HC", required: 21, requested: 21, committed: 13, named: 9, acceptedShortfall: 0 },
  { rankCode: "PC", required: 40, requested: 40, committed: 34, named: 28, acceptedShortfall: 0 },
  { rankCode: "HG", required: 12, requested: 12, committed: 12, named: 12, acceptedShortfall: 0 },
];

export type StationResponse = {
  station: string;
  division: string;
  cells: Record<"SI" | "HC" | "PC", { requested: number; committed: number | null; available: number }>;
  status: "accepted" | "short" | "auto_accepted" | "pending";
  reason?: string;
};

export const SAMPLE_RESPONSES: StationResponse[] = [
  { station: "Town I PS", division: "North", status: "accepted", cells: { SI: { requested: 3, committed: 3, available: 5 }, HC: { requested: 5, committed: 5, available: 9 }, PC: { requested: 10, committed: 10, available: 22 } } },
  { station: "Town II PS", division: "North", status: "short", reason: "Men on election duty", cells: { SI: { requested: 3, committed: 3, available: 4 }, HC: { requested: 10, committed: 2, available: 2 }, PC: { requested: 12, committed: 6, available: 6 } } },
  { station: "Rural PS", division: "South", status: "auto_accepted", cells: { SI: { requested: 4, committed: 4, available: 6 }, HC: { requested: 4, committed: 4, available: 7 }, PC: { requested: 10, committed: 10, available: 19 } } },
  { station: "Harbour PS", division: "South", status: "accepted", cells: { SI: { requested: 4, committed: 4, available: 4 }, HC: { requested: 2, committed: 2, available: 5 }, PC: { requested: 8, committed: 8, available: 11 } } },
];

export const TOPUP_CANDIDATES = [
  { station: "Traffic PS", division: "North", distanceKm: 2.4, available: { HC: 6, PC: 9 } as Record<string, number> },
  { station: "Women PS", division: "North", distanceKm: 3.1, available: { HC: 2, PC: 7 } as Record<string, number> },
  { station: "City Armed Reserve", division: "Special Units", distanceKm: 5.8, available: { HC: 11, PC: 30 } as Record<string, number> },
];

export const SAMPLE_POINTS: (PointProfile & { purpose: string })[] = [
  { id: "pt1", name: "Benz Circle junction", purpose: "Traffic regulation", priority: 1, intensity: "high", mobility: "mobile", genderReq: "any", lat: 16.4997, lng: 80.6566 },
  { id: "pt2", name: "Stadium Gate 3", purpose: "Women frisking enclosure", priority: 2, intensity: "medium", mobility: "static", genderReq: "female", lat: 16.5106, lng: 80.6386 },
  { id: "pt3", name: "Media enclosure", purpose: "Access control", priority: 3, intensity: "low", mobility: "static", genderReq: "any", lat: 16.5101, lng: 80.6392 },
  { id: "pt4", name: "VIP route, stretch B", purpose: "Route patrol", priority: 2, intensity: "high", mobility: "mobile", genderReq: "any", lat: 16.5034, lng: 80.6488 },
];

export const SAMPLE_SLOTS: Slot[] = [
  { id: "s1", pointId: "pt1", rankCode: "HC", role: "regular" },
  { id: "s2", pointId: "pt1", rankCode: "PC", role: "regular" },
  { id: "s3", pointId: "pt1", rankCode: "PC", role: "regular" },
  { id: "s4", pointId: "pt2", rankCode: "PC", role: "regular" },
  { id: "s5", pointId: "pt2", rankCode: "PC", role: "regular" },
  { id: "s6", pointId: "pt3", rankCode: "HC", role: "regular" },
  { id: "s7", pointId: "pt3", rankCode: "PC", role: "regular" },
  { id: "s8", pointId: "pt4", rankCode: "PC", role: "regular" },
  { id: "s9", pointId: "pt4", rankCode: "PC", role: "regular" },
];

const POOL_IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9", "p10", "p12", "p13", "p14"];
export const SAMPLE_POOL: Officer[] = SAMPLE_PERSONS.filter((p) => POOL_IDS.includes(p.id)).map((p) => ({
  id: p.id,
  name: p.name,
  rankCode: p.rank,
  age: p.age,
  gender: p.gender,
  fitness: p.fitness,
  stationName: p.station,
  homeLat: 16.5 + (Number(p.id.slice(1)) % 5) * 0.004,
  homeLng: 80.64 + (Number(p.id.slice(1)) % 3) * 0.006,
  preferredPointIds: p.id === "p14" ? ["pt2"] : undefined,
}));
