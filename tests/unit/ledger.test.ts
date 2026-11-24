import { describe, expect, it } from "vitest";

import { clampShortfallAcceptance, computeLedgerRow, ledgerTotals } from "@/lib/sourcing/ledger";

describe("reconciliation ledger", () => {
  it("reports the gap when stations commit less than required", () => {
    const row = computeLedgerRow({ rankCode: "HC", required: 21, requested: 21, committed: 13, named: 0, acceptedShortfall: 0 });
    expect(row.gap).toBe(8);
    expect(row.state).toBe("short");
    expect(row.fillRatio).toBeCloseTo(13 / 21);
  });

  it("accepting the shortfall settles the rank without changing the requirement", () => {
    const row = computeLedgerRow({ rankCode: "HC", required: 21, requested: 21, committed: 13, named: 0, acceptedShortfall: 8 });
    expect(row.required).toBe(21);
    expect(row.gap).toBe(0);
    expect(row.state).toBe("settled");
  });

  it("a pending top-up marks the rank as awaiting, not short", () => {
    const row = computeLedgerRow({ rankCode: "PC", required: 40, requested: 46, committed: 34, named: 20, acceptedShortfall: 0, pendingTopUp: 6 });
    expect(row.gap).toBe(6);
    expect(row.state).toBe("awaiting_topup");
  });

  it("over-commitment is reported as surplus, never as negative gap", () => {
    const row = computeLedgerRow({ rankCode: "SI", required: 5, requested: 5, committed: 7, named: 0, acceptedShortfall: 0 });
    expect(row.gap).toBe(0);
    expect(row.surplus).toBe(2);
    expect(row.state).toBe("over");
  });

  it("cannot accept more shortfall than the current gap", () => {
    const row = computeLedgerRow({ rankCode: "HC", required: 10, requested: 10, committed: 7, named: 0, acceptedShortfall: 0 });
    expect(clampShortfallAcceptance(row, 5)).toBe(3);
    expect(clampShortfallAcceptance(row, -1)).toBe(0);
    expect(clampShortfallAcceptance(row, 1.5)).toBe(0);
  });

  it("totals cap committed at required so surplus in one rank does not hide a gap in another", () => {
    const rows = [
      computeLedgerRow({ rankCode: "SI", required: 5, requested: 5, committed: 9, named: 0, acceptedShortfall: 0 }),
      computeLedgerRow({ rankCode: "HC", required: 10, requested: 10, committed: 6, named: 0, acceptedShortfall: 0 }),
    ];
    const t = ledgerTotals(rows);
    expect(t.required).toBe(15);
    expect(t.committed).toBe(11);
    expect(t.gap).toBe(4);
    expect(t.settled).toBe(false);
  });
});
