/** Reference data shared by the seed script and tests. Everything here is fictional demo data. */

export const RANKS = [
  // General
  { code: "DGP", name: "Director General of Police", category: "general", seniority: 1 },
  { code: "ADGP", name: "Additional Director General of Police", category: "general", seniority: 2 },
  { code: "IGP", name: "Inspector General of Police", category: "general", seniority: 3 },
  { code: "DIG", name: "Deputy Inspector General of Police", category: "general", seniority: 4 },
  { code: "SP", name: "Superintendent of Police", category: "general", seniority: 5 },
  { code: "Addl.SP", name: "Additional Superintendent of Police", category: "general", seniority: 6 },
  { code: "DSP", name: "Deputy Superintendent of Police", category: "general", seniority: 7 },
  { code: "CI", name: "Circle Inspector", category: "general", seniority: 8 },
  { code: "SI", name: "Sub-Inspector", category: "general", seniority: 9 },
  { code: "ASI", name: "Assistant Sub-Inspector", category: "general", seniority: 10 },
  { code: "HC", name: "Head Constable", category: "general", seniority: 11 },
  { code: "PC", name: "Police Constable", category: "general", seniority: 12 },
  { code: "HG", name: "Home Guard", category: "general", seniority: 13 },
  // Armed Reserve
  { code: "RI(AR)", name: "Reserve Inspector (AR)", category: "ar", seniority: 20 },
  { code: "RSI(AR)", name: "Reserve Sub-Inspector (AR)", category: "ar", seniority: 21 },
  { code: "ARSI", name: "Assistant Reserve Sub-Inspector", category: "ar", seniority: 22 },
  { code: "HC(AR)", name: "Head Constable (AR)", category: "ar", seniority: 23 },
  { code: "PC(AR)", name: "Police Constable (AR)", category: "ar", seniority: 24 },
  // AP Special Police
  { code: "Comdt", name: "Commandant (APSP)", category: "apsp", seniority: 30 },
  { code: "Asst.Comdt", name: "Assistant Commandant (APSP)", category: "apsp", seniority: 31 },
  { code: "RI(APSP)", name: "Reserve Inspector (APSP)", category: "apsp", seniority: 32 },
  { code: "RSI(APSP)", name: "Reserve Sub-Inspector (APSP)", category: "apsp", seniority: 33 },
  { code: "HC(APSP)", name: "Head Constable (APSP)", category: "apsp", seniority: 34 },
  { code: "PC(APSP)", name: "Police Constable (APSP)", category: "apsp", seniority: 35 },
] as const;

export const DEMO_UNIT = { code: "DEMO-DIST", name: "Demo District Police", type: "district" as const };

export const OTHER_UNITS = [
  { code: "DEMO-CP", name: "Demo City Commissionerate", type: "commissionerate" as const },
  { code: "NORTH-DIST", name: "North Demo District", type: "district" as const },
  { code: "APSP-1", name: "APSP 1st Battalion (demo)", type: "battalion" as const },
];

type StationSeed = {
  code: string;
  name: string;
  kind: "police_station" | "office" | "special_unit" | "control_room";
  lat: number;
  lng: number;
  /** rank code -> headcount */
  strength: Record<string, number>;
  femaleShare?: number;
};

const PS_STRENGTH = { CI: 1, SI: 3, ASI: 2, HC: 8, PC: 18, HG: 4 };

export const DIVISIONS: { name: string; stations: StationSeed[] }[] = [
  {
    name: "North Division",
    stations: [
      { code: "PS-T1", name: "Town I PS", kind: "police_station", lat: 16.5158, lng: 80.6326, strength: PS_STRENGTH },
      { code: "PS-T2", name: "Town II PS", kind: "police_station", lat: 16.5232, lng: 80.6188, strength: PS_STRENGTH },
      { code: "PS-TRF", name: "Traffic PS", kind: "police_station", lat: 16.5086, lng: 80.6475, strength: { CI: 1, SI: 3, ASI: 3, HC: 8, PC: 20, HG: 8 } },
      { code: "PS-WMN", name: "Women PS", kind: "police_station", lat: 16.5121, lng: 80.6402, strength: { CI: 1, SI: 3, ASI: 2, HC: 6, PC: 14, HG: 2 }, femaleShare: 0.75 },
    ],
  },
  {
    name: "South Division",
    stations: [
      { code: "PS-RUR", name: "Rural PS", kind: "police_station", lat: 16.4712, lng: 80.6261, strength: PS_STRENGTH },
      { code: "PS-HBR", name: "Harbour PS", kind: "police_station", lat: 16.4855, lng: 80.6684, strength: PS_STRENGTH },
      { code: "PS-HWY", name: "Highway PS", kind: "police_station", lat: 16.4598, lng: 80.6532, strength: { CI: 1, SI: 2, ASI: 2, HC: 6, PC: 14, HG: 4 } },
      { code: "PS-MKT", name: "Market PS", kind: "police_station", lat: 16.4987, lng: 80.6119, strength: PS_STRENGTH },
    ],
  },
  {
    name: "Special Units",
    stations: [
      { code: "DPO", name: "District Police Office", kind: "office", lat: 16.5062, lng: 80.648, strength: { SP: 1, "Addl.SP": 2, DSP: 3, SI: 2, HC: 4, PC: 6 } },
      { code: "CAR", name: "City Armed Reserve", kind: "special_unit", lat: 16.5297, lng: 80.6553, strength: { "RI(AR)": 1, "RSI(AR)": 4, ARSI: 3, "HC(AR)": 12, "PC(AR)": 60 } },
      { code: "SB", name: "Special Branch", kind: "office", lat: 16.5049, lng: 80.6449, strength: { CI: 1, SI: 2, HC: 3, PC: 4 } },
      { code: "DCR", name: "District Control Room", kind: "control_room", lat: 16.5071, lng: 80.6463, strength: { SI: 2, HC: 4, PC: 6 } },
    ],
  },
];

/** A second district and an APSP battalion, so inter-district requests (DGP) have somewhere to come from. */
export const NORTH_DIVISIONS: { name: string; stations: StationSeed[] }[] = [
  {
    name: "North Division",
    stations: [
      { code: "NPS-1", name: "North Town PS", kind: "police_station", lat: 16.9891, lng: 80.0971, strength: { CI: 1, SI: 3, ASI: 2, HC: 8, PC: 20, HG: 4 } },
      { code: "NPS-2", name: "North Rural PS", kind: "police_station", lat: 17.0214, lng: 80.1432, strength: { CI: 1, SI: 2, ASI: 2, HC: 6, PC: 16, HG: 4 } },
      { code: "NDPO", name: "North District Police Office", kind: "office", lat: 16.9952, lng: 80.1104, strength: { SP: 1, DSP: 1, SI: 1, HC: 2, PC: 3 } },
    ],
  },
];

export const APSP_DIVISIONS: { name: string; stations: StationSeed[] }[] = [
  {
    name: "Battalion",
    stations: [{ code: "APSP-HQ", name: "APSP 1st Bn HQ", kind: "special_unit", lat: 16.5498, lng: 80.5821, strength: { Comdt: 1, "Asst.Comdt": 2, "RI(APSP)": 2, "RSI(APSP)": 6, "HC(APSP)": 20, "PC(APSP)": 60 }, femaleShare: 0.05 }],
  },
];

/** Age bands per rank (min, max) used to generate realistic dates of birth. */
export const AGE_BAND: Record<string, [number, number]> = {
  SP: [36, 55],
  "Addl.SP": [40, 57],
  DSP: [40, 57],
  CI: [35, 56],
  SI: [25, 52],
  ASI: [45, 58],
  HC: [34, 57],
  PC: [22, 50],
  HG: [22, 52],
  "RI(AR)": [42, 57],
  "RSI(AR)": [28, 50],
  ARSI: [44, 58],
  "HC(AR)": [34, 56],
  "PC(AR)": [22, 42],
};

/** Fixed reference date so the seed is deterministic. */
export const SEED_REFERENCE_DATE = new Date("2026-11-01T00:00:00Z");
