/** Pure helpers for accommodation and equipment (unit-tested). */

export type Lodging = { id: string; capacity: number; genderAllowed: "any" | "male" | "female"; occupied: number };
export type Guest = { personId: string; gender: "male" | "female"; stationId?: string };

/**
 * Auto-allot lodging: women first (fewer places accept them), gender-restricted lodgings before mixed ones,
 * never over capacity. Officers of the same station are kept together where possible. Returns the
 * allotments and whoever could not be housed.
 */
export function autoAllot(guests: Guest[], lodgings: Lodging[]): { allotments: { personId: string; lodgingId: string }[]; unhoused: string[] } {
  const left = new Map(lodgings.map((l) => [l.id, Math.max(0, l.capacity - l.occupied)]));
  const allotments: { personId: string; lodgingId: string }[] = [];
  const unhoused: string[] = [];
  const order = [...guests].sort((a, b) => (a.gender === b.gender ? (a.stationId ?? "").localeCompare(b.stationId ?? "") : a.gender === "female" ? -1 : 1));
  for (const g of order) {
    // Prefer a lodging reserved for this gender, then mixed; among those the one with most room.
    const options = lodgings
      .filter((l) => (l.genderAllowed === "any" || l.genderAllowed === g.gender) && (left.get(l.id) ?? 0) > 0)
      .sort((a, b) => Number(a.genderAllowed === "any") - Number(b.genderAllowed === "any") || (left.get(b.id) ?? 0) - (left.get(a.id) ?? 0));
    const pick = options[0];
    if (!pick) {
      unhoused.push(g.personId);
      continue;
    }
    allotments.push({ personId: g.personId, lodgingId: pick.id });
    left.set(pick.id, left.get(pick.id)! - 1);
  }
  return { allotments, unhoused };
}

/** Working items a station can still lend: working stock minus what's out on other plans (not yet returned). */
export function equipmentFree(working: number, outstanding: number): number {
  return Math.max(0, working - outstanding);
}

/** Distance between two coordinates in metres. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Check-ins further than this from the posting are flagged for the supervisor. */
export const CHECKIN_RADIUS_M = 300;
