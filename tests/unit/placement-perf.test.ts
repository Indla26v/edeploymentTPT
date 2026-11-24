import { describe, expect, it } from "vitest";

import { suggestPlacements, type Officer, type PointProfile, type Slot } from "@/lib/placement/rules";

/** A large bandobast: 600 points × 5 slots = 3,000 slots, 3,200 officers. */
function bigPlan() {
  const ranks = ["PC", "PC", "PC", "HC", "SI"];
  const points: PointProfile[] = [];
  const slots: Slot[] = [];
  for (let p = 0; p < 600; p++) {
    points.push({ id: `p${p}`, name: `Point ${p}`, priority: ((p % 4) + 1) as 1, intensity: (["high", "medium", "low"] as const)[p % 3]!, mobility: p % 2 ? "mobile" : "static", genderReq: p % 25 === 0 ? "female" : "any", lat: 16.5 + (p % 30) / 1000, lng: 80.6 + Math.floor(p / 30) / 1000 });
    ranks.forEach((r, i) => slots.push({ id: `s${p}-${i}`, pointId: `p${p}`, rankCode: r, role: i === 4 && p % 10 === 0 ? "sector_incharge" : "regular" }));
  }
  const officers: Officer[] = Array.from({ length: 3200 }, (_, i) => ({
    id: `o${i}`,
    name: `Officer ${i}`,
    rankCode: i % 10 < 6 ? "PC" : i % 10 < 8 ? "HC" : "SI",
    rankSeniority: i % 10 < 6 ? 12 : i % 10 < 8 ? 11 : 9,
    age: 22 + (i % 38),
    gender: i % 7 === 0 ? "female" : "male",
    fitness: i % 23 === 0 ? "light_duty_only" : "fit",
    homeLat: 16.5 + (i % 50) / 1000,
    homeLng: 80.6 + (i % 40) / 1000,
    preferredPointIds: i % 97 === 0 ? [`p${i % 600}`] : undefined,
  }));
  return { points, slots, officers };
}

describe("suggestion engine at scale", () => {
  it("places a 3,000-slot plan within a few seconds and never breaks hard rules", () => {
    const { points, slots, officers } = bigPlan();
    const t0 = performance.now();
    const { suggestions, unfilledSlotIds } = suggestPlacements({ slots, points, officers });
    const ms = performance.now() - t0;
    console.info(`suggestPlacements: ${slots.length} slots, ${officers.length} officers in ${Math.round(ms)} ms`);
    expect(suggestions.length + unfilledSlotIds.length).toBe(slots.length);
    expect(new Set(suggestions.map((s) => s.officerId)).size).toBe(suggestions.length);
    const pt = new Map(points.map((p) => [p.id, p]));
    const sl = new Map(slots.map((s) => [s.id, s]));
    const of = new Map(officers.map((o) => [o.id, o]));
    for (const s of suggestions) {
      const slot = sl.get(s.slotId)!;
      const o = of.get(s.officerId)!;
      const p = pt.get(slot.pointId)!;
      expect(o.rankCode).toBe(slot.rankCode);
      if (p.genderReq !== "any") expect(o.gender).toBe(p.genderReq);
      if (p.intensity === "high") expect(o.fitness).toBe("fit");
    }
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});
