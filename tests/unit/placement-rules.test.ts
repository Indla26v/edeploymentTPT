import { describe, expect, it } from "vitest";

import {
  checkPlacement,
  suggestPlacements,
  type Officer,
  type PointProfile,
  type Slot,
} from "@/lib/placement/rules";

const highPoint: PointProfile = { id: "p-high", name: "Junction traffic", priority: 1, intensity: "high", mobility: "mobile", genderReq: "any" };
const lowPoint: PointProfile = { id: "p-low", name: "Media enclosure", priority: 3, intensity: "low", mobility: "static", genderReq: "any" };
const womenPoint: PointProfile = { id: "p-w", name: "Women frisking", priority: 2, intensity: "medium", mobility: "static", genderReq: "female" };

const officer = (o: Partial<Officer> & Pick<Officer, "id" | "age">): Officer => ({
  name: o.id,
  rankCode: "PC",
  gender: "male",
  fitness: "fit",
  ...o,
});

describe("hard placement rules", () => {
  it("refuses a rank mismatch", () => {
    const r = checkPlacement(officer({ id: "a", age: 30, rankCode: "HC" }), { id: "s", pointId: "p-high", rankCode: "PC", role: "regular" }, highPoint);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("rank");
  });

  it("never puts a light-duty officer on a high-intensity point", () => {
    const r = checkPlacement(officer({ id: "a", age: 30, fitness: "light_duty_only" }), { id: "s", pointId: "p-high", rankCode: "PC", role: "regular" }, highPoint);
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain("fitness");
  });

  it("enforces the point's gender requirement", () => {
    const slot: Slot = { id: "s", pointId: "p-w", rankCode: "PC", role: "regular" };
    expect(checkPlacement(officer({ id: "m", age: 30 }), slot, womenPoint).ok).toBe(false);
    expect(checkPlacement(officer({ id: "f", age: 30, gender: "female" }), slot, womenPoint).ok).toBe(true);
  });

  it("allows but warns when an officer over the age threshold is placed on a high-intensity point", () => {
    const r = checkPlacement(officer({ id: "old", age: 54 }), { id: "s", pointId: "p-high", rankCode: "PC", role: "regular" }, highPoint);
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(["age_high_intensity"]);
  });
});

describe("suggestion engine", () => {
  const slots: Slot[] = [
    { id: "low-1", pointId: "p-low", rankCode: "PC", role: "regular" },
    { id: "high-1", pointId: "p-high", rankCode: "PC", role: "regular" },
  ];

  it("puts the younger officer on the demanding point and the older one on the resting point", () => {
    const { suggestions, unfilledSlotIds } = suggestPlacements({
      slots,
      points: [highPoint, lowPoint],
      officers: [officer({ id: "old", age: 55 }), officer({ id: "young", age: 27 })],
    });
    expect(unfilledSlotIds).toEqual([]);
    const bySlot = Object.fromEntries(suggestions.map((s) => [s.slotId, s.officerId]));
    expect(bySlot["high-1"]).toBe("young");
    expect(bySlot["low-1"]).toBe("old");
    expect(suggestions.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it("leaves the lowest-priority slot open when there are fewer officers than slots", () => {
    const { suggestions, unfilledSlotIds } = suggestPlacements({
      slots,
      points: [highPoint, lowPoint],
      officers: [officer({ id: "only", age: 33 })],
    });
    expect(suggestions.map((s) => s.slotId)).toEqual(["high-1"]);
    expect(unfilledSlotIds).toEqual(["low-1"]);
  });

  it("never suggests a light-duty officer for a high-intensity point, even if they are the only one", () => {
    const { suggestions, unfilledSlotIds } = suggestPlacements({
      slots: [{ id: "high-1", pointId: "p-high", rankCode: "PC", role: "regular" }],
      points: [highPoint],
      officers: [officer({ id: "ld", age: 29, fitness: "light_duty_only" })],
    });
    expect(suggestions).toEqual([]);
    expect(unfilledSlotIds).toEqual(["high-1"]);
  });

  it("keeps locked / manual assignments and does not reuse those officers", () => {
    const { suggestions } = suggestPlacements({
      slots,
      points: [highPoint, lowPoint],
      officers: [officer({ id: "young", age: 25 }), officer({ id: "mid", age: 40 })],
      keep: [{ slotId: "high-1", officerId: "mid" }],
    });
    expect(suggestions).toEqual([expect.objectContaining({ slotId: "low-1", officerId: "young" })]);
  });

  it("honours Component Officer preferences first", () => {
    const { suggestions } = suggestPlacements({
      slots: [{ id: "high-1", pointId: "p-high", rankCode: "PC", role: "regular" }],
      points: [highPoint],
      officers: [officer({ id: "young", age: 24 }), officer({ id: "pref", age: 38, preferredPointIds: ["p-high"] })],
    });
    expect(suggestions[0]?.officerId).toBe("pref");
    expect(suggestions[0]?.reasons).toContain("Preferred by Component Officer");
  });

  it("does not starve a women-only point by giving its scarce officers to an unrestricted point", () => {
    const general: PointProfile = { id: "p-gen", name: "Route patrol", priority: 2, intensity: "high", mobility: "mobile", genderReq: "any" };
    const women: PointProfile = { ...womenPoint, priority: 2 };
    const { suggestions, unfilledSlotIds } = suggestPlacements({
      slots: [
        { id: "gen-1", pointId: "p-gen", rankCode: "PC", role: "regular" },
        { id: "gen-2", pointId: "p-gen", rankCode: "PC", role: "regular" },
        { id: "w-1", pointId: "p-w", rankCode: "PC", role: "regular" },
        { id: "w-2", pointId: "p-w", rankCode: "PC", role: "regular" },
      ],
      points: [general, women],
      officers: [
        officer({ id: "f1", age: 25, gender: "female" }),
        officer({ id: "f2", age: 27, gender: "female" }),
        officer({ id: "m1", age: 34 }),
        officer({ id: "m2", age: 38 }),
      ],
    });
    expect(unfilledSlotIds).toEqual([]);
    const bySlot = Object.fromEntries(suggestions.map((s) => [s.slotId, s.officerId]));
    expect([bySlot["w-1"], bySlot["w-2"]].sort()).toEqual(["f1", "f2"]);
    expect([bySlot["gen-1"], bySlot["gen-2"]].sort()).toEqual(["m1", "m2"]);
  });

  it("holds back scarce women officers even when the unrestricted point has higher priority", () => {
    const critical: PointProfile = { id: "p-crit", name: "Junction", priority: 1, intensity: "high", mobility: "mobile", genderReq: "any" };
    const { suggestions } = suggestPlacements({
      slots: [
        { id: "c-1", pointId: "p-crit", rankCode: "PC", role: "regular" },
        { id: "w-1", pointId: "p-w", rankCode: "PC", role: "regular" },
      ],
      points: [critical, womenPoint],
      officers: [officer({ id: "f1", age: 24, gender: "female" }), officer({ id: "m1", age: 36 })],
    });
    const bySlot = Object.fromEntries(suggestions.map((s) => [s.slotId, s.officerId]));
    expect(bySlot).toEqual({ "c-1": "m1", "w-1": "f1" });
  });
});

