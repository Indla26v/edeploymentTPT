import { describe, expect, it } from "vitest";

import { ageFromDob, initials } from "@/lib/utils";

describe("utils", () => {
  it("derives age from date of birth (birthday not yet reached)", () => {
    expect(ageFromDob("1980-12-31", new Date("2026-11-24T00:00:00Z"))).toBe(45);
    expect(ageFromDob("1980-11-24", new Date("2026-11-24T00:00:00Z"))).toBe(46);
  });
  it("builds initials", () => {
    expect(initials("Rama Krishna Rao")).toBe("RK");
    expect(initials("venkat")).toBe("V");
  });
});
