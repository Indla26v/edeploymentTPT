import { describe, expect, it } from "vitest";

import { distribute, haversineKm, responseStatus } from "@/lib/sourcing/distribute";

const st = (id: string, km: number | null, free: Record<string, number>) => ({ stationId: id, distanceKm: km, free });

describe("distribution pre-fill", () => {
  it("fills from the nearest stations, keeping a 25% reserve at each", () => {
    const { grid, gap } = distribute({ need: { PC: 10 }, stations: [st("far", 9, { PC: 20 }), st("near", 1, { PC: 8 })] });
    expect(grid.near!.PC).toBe(6); // 8 free, 2 kept back
    expect(grid.far!.PC).toBe(4);
    expect(gap).toEqual({});
  });

  it("leaves a gap rather than stripping stations", () => {
    const { grid, gap } = distribute({ need: { SI: 5 }, stations: [st("a", 1, { SI: 2 }), st("b", 2, { SI: 2 })] });
    expect(grid.a!.SI + grid.b!.SI).toBe(2);
    expect(gap).toEqual({ SI: 3 });
  });

  it("asks preferred stations first, even beyond the reserve", () => {
    const { grid } = distribute({ need: { PC: 6 }, stations: [st("near", 1, { PC: 20 }), st("pref", 9, { PC: 4 })], stationPreferences: [{ stationId: "pref", rankId: "PC", count: 4 }] });
    expect(grid.pref!.PC).toBe(4);
    expect(grid.near!.PC).toBe(2);
  });

  it("asks the station of each preferred officer", () => {
    const { grid } = distribute({ need: { HC: 1 }, stations: [st("near", 1, { HC: 5 }), st("home", 8, { HC: 1 })], personPreferences: [{ stationId: "home", rankId: "HC" }] });
    expect(grid.home!.HC).toBe(1);
    expect(grid.near).toBeUndefined();
  });

  it("never requests more than a station has free", () => {
    const { grid } = distribute({ need: { PC: 50 }, stations: [st("a", 1, { PC: 3 })], stationPreferences: [{ stationId: "a", rankId: null, count: null }] });
    expect(grid.a!.PC).toBe(3);
  });
});

describe("helpers", () => {
  it("haversine distance", () => {
    expect(haversineKm({ lat: 16.5062, lng: 80.648 }, { lat: 16.5158, lng: 80.6326 })).toBeCloseTo(1.94, 1);
  });
  it("response status", () => {
    expect(responseStatus([{ requested: 5, committed: 5 }])).toBe("committed");
    expect(responseStatus([{ requested: 5, committed: 3 }])).toBe("partial");
    expect(responseStatus([{ requested: 5, committed: 0 }])).toBe("declined");
  });
});
