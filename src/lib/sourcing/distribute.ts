/**
 * Pre-fills the Unit Officer's distribution grid (stations × ranks). Pure and deterministic.
 *
 *   1. Preferred stations (from CO preferences) first, up to the preferred count.
 *   2. Stations of preferred officers get +1 for that officer's rank.
 *   3. The rest from the nearest stations that have free men, keeping a reserve at each station
 *      for its own law-and-order duty.
 *
 * Whatever can't be found stays as a gap — the UO can still send, and settle it in the ledger.
 */
export type StationSupply = { stationId: string; distanceKm: number | null; free: Record<string, number> };
export type StationPreference = { stationId: string; rankId: string | null; count: number | null };
export type PersonPreference = { stationId: string; rankId: string };

export type DistributeInput = {
  /** Men still to request, by rank id. */
  need: Record<string, number>;
  stations: StationSupply[];
  stationPreferences?: StationPreference[];
  personPreferences?: PersonPreference[];
  /** Fraction of each station's free men kept back (default 0.25). */
  reserve?: number;
};

export type Distribution = { grid: Record<string, Record<string, number>>; gap: Record<string, number> };

export const DEFAULT_RESERVE = 0.25;

export function distribute(input: DistributeInput): Distribution {
  const reserve = input.reserve ?? DEFAULT_RESERVE;
  const grid: Record<string, Record<string, number>> = {};
  const left: Record<string, number> = { ...input.need };
  // What each station can spare after its reserve.
  const spare = new Map(input.stations.map((s) => [s.stationId, Object.fromEntries(Object.entries(s.free).map(([r, n]) => [r, Math.max(0, n - Math.ceil(n * reserve))]))]));
  const freeAll = new Map(input.stations.map((s) => [s.stationId, { ...s.free }]));

  const take = (stationId: string, rankId: string, want: number, ignoreReserve = false) => {
    if (want <= 0 || (left[rankId] ?? 0) <= 0) return 0;
    const pool = ignoreReserve ? freeAll.get(stationId) : spare.get(stationId);
    if (!pool) return 0;
    const n = Math.min(want, left[rankId]!, pool[rankId] ?? 0);
    if (n <= 0) return 0;
    grid[stationId] ??= {};
    grid[stationId][rankId] = (grid[stationId][rankId] ?? 0) + n;
    left[rankId]! -= n;
    for (const p of [spare.get(stationId)!, freeAll.get(stationId)!]) p[rankId] = Math.max(0, (p[rankId] ?? 0) - n);
    return n;
  };

  // 1. Preferred stations (preferences override the reserve: the CO asked for these men).
  for (const p of input.stationPreferences ?? []) {
    const ranks = p.rankId ? [p.rankId] : Object.keys(left);
    let budget = p.count ?? Infinity;
    for (const r of ranks) {
      if (budget <= 0) break;
      budget -= take(p.stationId, r, budget === Infinity ? (left[r] ?? 0) : budget, true);
    }
  }
  // 2. Preferred officers: their station must be asked for them.
  for (const p of input.personPreferences ?? []) take(p.stationId, p.rankId, 1, true);

  // 3. Nearest stations first (unknown distance last), spreading by available spare.
  const order = [...input.stations].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  for (const rankId of Object.keys(left)) for (const s of order) take(s.stationId, rankId, left[rankId] ?? 0);

  const gap = Object.fromEntries(Object.entries(left).filter(([, n]) => n > 0));
  return { grid, gap };
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Request status after a station answers: full, short or none. */
export function responseStatus(lines: { requested: number; committed: number }[]): "committed" | "partial" | "declined" {
  const req = lines.reduce((a, l) => a + l.requested, 0);
  const com = lines.reduce((a, l) => a + l.committed, 0);
  if (com === 0) return "declined";
  return com >= req ? "committed" : "partial";
}
