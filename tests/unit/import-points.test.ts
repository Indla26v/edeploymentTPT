import { describe, expect, it } from "vitest";

import { parsePointRows } from "@/lib/masters/import-points";

const row = (o: Partial<Record<string, string>>) => ({ Name: "Main junction", Latitude: "16.5", Longitude: "80.6", Priority: "1", Intensity: "high", Mobility: "mobile", Gender: "any", Description: "", ...o }) as Record<string, string>;

describe("deployment points Excel import", () => {
  it("accepts a valid row and applies defaults for blank optional cells", () => {
    const { valid, errors } = parsePointRows([row({}), row({ Name: "Gate 2", Priority: "", Intensity: "", Mobility: "", Gender: "" })]);
    expect(errors).toEqual([]);
    expect(valid[1]).toMatchObject({ name: "Gate 2", defaultPriority: 3, defaultIntensity: "medium", defaultMobility: "static", genderReq: "any" });
  });

  it("reports every problem on a row with its spreadsheet row number", () => {
    const { valid, errors } = parsePointRows([row({}), row({ Name: "", Latitude: "abc", Priority: "7", Intensity: "extreme" })]);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.row).toBe(3);
    expect(errors[0]!.message).toMatch(/Name missing/);
    expect(errors[0]!.message).toMatch(/Latitude/);
    expect(errors[0]!.message).toMatch(/Priority must be 1–4/);
    expect(errors[0]!.message).toMatch(/Intensity/);
  });

  it("rejects duplicate names within the same file", () => {
    const { valid, errors } = parsePointRows([row({}), row({ Name: "main JUNCTION" })]);
    expect(valid).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/duplicate/);
  });

  it("rejects out-of-range coordinates", () => {
    const { errors } = parsePointRows([row({ Latitude: "91", Longitude: "-181" })]);
    expect(errors[0]!.message).toMatch(/Latitude/);
    expect(errors[0]!.message).toMatch(/Longitude/);
  });
});
