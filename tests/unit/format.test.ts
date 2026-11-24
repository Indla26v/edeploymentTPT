import { describe, expect, it } from "vitest";

import { fmtRange, fromLocalInput, toLocalInput } from "@/lib/format";

describe("format helpers", () => {
  it("round-trips IST datetime-local values", () => {
    const iso = fromLocalInput("2026-12-10T09:30")!;
    expect(iso).toBe("2026-12-10T04:00:00.000Z");
    expect(toLocalInput(iso)).toBe("2026-12-10T09:30");
  });
  it("compacts date ranges", () => {
    expect(fmtRange("2026-12-10T04:00:00Z", "2026-12-12T10:00:00Z")).toBe("10–12 Dec 2026");
    expect(fmtRange("2026-12-10T04:00:00Z", "2026-12-10T10:00:00Z")).toBe("10 Dec 2026");
    expect(fmtRange(null, null)).toBe("No dates yet");
  });
});
