import { describe, expect, it } from "vitest";

import { canMovePlan, checkSendToUo, coCanEdit, ioCanEditInline, planStages, planStatusAfterSubmit } from "@/lib/workflow/plan";
import { buildSlots, requiredByRank, validateProposal } from "@/lib/workflow/slots";

describe("plan state machine", () => {
  it("never moves a plan back from sourcing to the IO or COs", () => {
    expect(canMovePlan("sourcing", "consolidating")).toBe(false);
    expect(canMovePlan("sourcing", "proposing")).toBe(false);
    expect(canMovePlan("sourcing", "placement")).toBe(true);
  });

  it("moves to consolidation only when every component is in", () => {
    expect(planStatusAfterSubmit("proposing", ["submitted", "in_progress"])).toBe("proposing");
    expect(planStatusAfterSubmit("proposing", ["submitted", "accepted"])).toBe("consolidating");
  });

  it("lets the CO edit only while the component is with them", () => {
    expect(coCanEdit("proposing", "in_progress")).toBe(true);
    expect(coCanEdit("proposing", "submitted")).toBe(false);
    expect(coCanEdit("consolidating", "returned")).toBe(true);
    expect(coCanEdit("sourcing", "returned")).toBe(false);
  });

  it("lets the IO correct counts inline without reopening the component", () => {
    expect(ioCanEditInline("consolidating", "submitted")).toBe(true);
    expect(ioCanEditInline("consolidating", "in_progress")).toBe(false);
    expect(ioCanEditInline("sourcing", "accepted")).toBe(false);
  });

  it("blocks sending to the UO while a component is pending or returned", () => {
    const r = checkSendToUo("consolidating", [{ name: "Traffic", status: "submitted" }, { name: "Security", status: "returned" }], 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/Security/);
    expect(checkSendToUo("consolidating", [{ name: "Traffic", status: "accepted" }], 10)).toEqual({ ok: true });
    expect(checkSendToUo("consolidating", [{ name: "Traffic", status: "accepted" }], 0).ok).toBe(false);
  });

  it("marks returned proposals on the stage tracker", () => {
    const s = planStages("consolidating", { returned: 1 });
    expect(s.find((x) => x.key === "consolidating")).toMatchObject({ state: "attention", note: "1 returned" });
    expect(s.find((x) => x.key === "draft")!.state).toBe("done");
  });
});

describe("slot generation", () => {
  const sector = { id: "s1", planComponentId: "c1", batches: 2, inchargeRankId: "SI", liaisonRankId: null };
  const points = [
    { id: "p1", sectorId: "s1", priority: 2, intensity: "medium" as const, genderReq: "any" as const },
    { id: "p2", sectorId: "s1", priority: 1, intensity: "high" as const, genderReq: "any" as const },
    { id: "p3", sectorId: "s1", priority: 3, intensity: "low" as const, genderReq: "female" as const },
  ];

  it("creates one slot per man per batch, plus one sector incharge per batch", () => {
    const slots = buildSlots([sector], points, [
      { pointId: "p1", batch: 1, rankId: "PC", count: 3, mergeGroup: null },
      { pointId: "p1", batch: 2, rankId: "PC", count: 2, mergeGroup: null },
      { pointId: "p3", batch: 1, rankId: "WPC", count: 1, mergeGroup: null },
    ]);
    expect(slots.filter((s) => s.role === "member")).toHaveLength(6);
    expect(slots.filter((s) => s.role === "sector_incharge")).toHaveLength(2);
    expect(slots.find((s) => s.pointId === "p3")!.genderReq).toBe("female");
    expect(requiredByRank(slots).get("PC")).toBe(5);
  });

  it("merged points share officers: count = the largest, covering all points, with the hardest profile", () => {
    const slots = buildSlots([{ ...sector, inchargeRankId: null }], points, [
      { pointId: "p1", batch: 1, rankId: "PC", count: 2, mergeGroup: "A" },
      { pointId: "p2", batch: 1, rankId: "PC", count: 3, mergeGroup: "A" },
    ]);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({ pointId: "p2", priority: 1, intensity: "high" });
    expect(slots[0]!.pointIds.sort()).toEqual(["p1", "p2"]);
  });

  it("ignores zero counts and batches beyond the sector's batches", () => {
    const slots = buildSlots([{ ...sector, inchargeRankId: null }], points, [
      { pointId: "p1", batch: 1, rankId: "PC", count: 0, mergeGroup: null },
      { pointId: "p1", batch: 3, rankId: "PC", count: 4, mergeGroup: null },
    ]);
    expect(slots).toHaveLength(0);
  });

  it("validation flags empty sectors, zero-rank points and conflicting merges", () => {
    const problems = validateProposal(
      [
        { ...sector, name: "Sector A" },
        { id: "s2", planComponentId: "c1", batches: 1, inchargeRankId: null, liaisonRankId: null, name: "Sector B" },
      ],
      [
        { ...points[0]!, name: "Gate", genderReq: "male" },
        { ...points[2]!, name: "Ladies queue" },
      ],
      [
        { pointId: "p1", batch: 1, rankId: "PC", count: 1, mergeGroup: "X" },
        { pointId: "p3", batch: 1, rankId: "PC", count: 1, mergeGroup: "X" },
      ],
    );
    expect(problems.map((p) => p.where)).toEqual(expect.arrayContaining(["Sector B", "Merge X"]));
    expect(validateProposal([{ ...sector, name: "A" }], [{ ...points[0]!, name: "Gate" }], []).map((p) => p.message)).toEqual([expect.stringMatching(/zero-rank/)]);
  });
});
