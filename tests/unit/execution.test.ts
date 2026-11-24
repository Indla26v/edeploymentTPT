import { describe, expect, it } from "vitest";

import { autoAllot, CHECKIN_RADIUS_M, equipmentFree, metresBetween } from "@/lib/execution/allocate";
import { signCheckinToken, verifyCheckinToken } from "@/lib/execution/qr";

const KEY = "test-secret-key-1234567890";
const PLAN = "0b6f1c2e-1a2b-4c3d-8e9f-001122334455";
const PERSON = "7d9e8f10-2b3c-4d5e-9f60-aabbccddeeff";

describe("ID card QR tokens", () => {
  it("round-trips", () => {
    const t = signCheckinToken(PLAN, PERSON, KEY);
    expect(verifyCheckinToken(t, KEY)).toEqual({ planId: PLAN, personId: PERSON });
    expect(t.length).toBeLessThan(70);
  });
  it("rejects tampering, forgery and garbage", () => {
    const t = signCheckinToken(PLAN, PERSON, KEY);
    const [p, s] = t.split(".");
    const other = signCheckinToken(PLAN, "7d9e8f10-2b3c-4d5e-9f60-aabbccddee00", KEY).split(".")[0];
    expect(verifyCheckinToken(`${other}.${s}`, KEY)).toBeNull(); // swapped person
    expect(verifyCheckinToken(`${p}.${s!.slice(0, -2)}AA`, KEY)).toBeNull(); // altered signature
    expect(verifyCheckinToken(t, "another-key")).toBeNull(); // forged with another key
    expect(verifyCheckinToken("nonsense", KEY)).toBeNull();
    expect(verifyCheckinToken("a.b", KEY)).toBeNull();
  });
});

describe("accommodation auto-allotment", () => {
  it("respects gender and capacity, women first", () => {
    const guests = [
      ...Array.from({ length: 5 }, (_, i) => ({ personId: `m${i}`, gender: "male" as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ personId: `f${i}`, gender: "female" as const })),
    ];
    const { allotments, unhoused } = autoAllot(guests, [
      { id: "men", capacity: 3, genderAllowed: "male", occupied: 0 },
      { id: "women", capacity: 2, genderAllowed: "female", occupied: 0 },
      { id: "mixed", capacity: 2, genderAllowed: "any", occupied: 0 },
    ]);
    const where = new Map(allotments.map((a) => [a.personId, a.lodgingId]));
    expect([...where.entries()].filter(([p, l]) => p.startsWith("m") && l === "women")).toEqual([]);
    expect([...where.entries()].filter(([p, l]) => p.startsWith("f") && l === "men")).toEqual([]);
    expect(allotments.filter((a) => a.lodgingId === "men")).toHaveLength(3);
    expect(allotments.filter((a) => a.lodgingId === "mixed")).toHaveLength(2);
    expect(where.get("f0")).toBe("women");
    expect(unhoused).toHaveLength(1);
    expect(unhoused[0]).toMatch(/^m/);
  });
  it("counts places already taken", () => {
    const r = autoAllot([{ personId: "a", gender: "male" }], [{ id: "x", capacity: 2, genderAllowed: "any", occupied: 2 }]);
    expect(r.unhoused).toEqual(["a"]);
  });
});

describe("equipment and distance", () => {
  it("free stock never goes negative", () => {
    expect(equipmentFree(10, 4)).toBe(6);
    expect(equipmentFree(3, 5)).toBe(0);
  });
  it("metres between points", () => {
    expect(metresBetween({ lat: 16.5, lng: 80.6 }, { lat: 16.5, lng: 80.6 })).toBe(0);
    expect(metresBetween({ lat: 16.5, lng: 80.6 }, { lat: 16.501, lng: 80.6 })).toBeGreaterThan(100);
    expect(CHECKIN_RADIUS_M).toBe(300);
  });
});
