import { describe, expect, it } from "vitest";

import { ageDays, bucketOf, misSummary, personWise, type MisTask } from "@/lib/office/mis";

const now = new Date("2026-11-24T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400e3);
const task = (o: Partial<MisTask>): MisTask => ({ id: Math.random().toString(), status: "open", createdAt: now, closedAt: null, dueDate: null, assignees: [], ...o });

describe("office MIS", () => {
  it("buckets by age at the boundaries", () => {
    expect([0, 5, 6, 15, 16, 45, 46, 90, 91, 400].map(bucketOf)).toEqual(["0-5", "0-5", "6-15", "6-15", "16-45", "16-45", "46-90", "46-90", "90+", "90+"]);
    expect(ageDays(daysAgo(3.9), now)).toBe(3);
  });

  it("summarises pending by age, action taken and completed (closed tasks don't count as pending)", () => {
    const s = misSummary(
      [
        task({ createdAt: daysAgo(1) }),
        task({ createdAt: daysAgo(10), status: "reopened" }),
        task({ createdAt: daysAgo(20), status: "action_taken" }),
        task({ createdAt: daysAgo(100) }),
        task({ createdAt: daysAgo(100), status: "closed", closedAt: daysAgo(50) }),
        task({ createdAt: daysAgo(2), dueDate: "2026-11-23" }),
      ],
      now,
    );
    expect(s).toMatchObject({ total: 6, pending: 4, actionTaken: 1, completed: 1, overdue: 1 });
    expect(s.buckets).toEqual({ "0-5": 2, "6-15": 1, "16-45": 1, "46-90": 0, "90+": 1 });
  });

  it("person-wise completion and average response time", () => {
    const p = personWise([
      task({ createdAt: daysAgo(2), status: "closed", assignees: [{ userId: "a", respondedAt: new Date(daysAgo(2).getTime() + 2 * 3600e3) }, { userId: "b", respondedAt: null }] }),
      task({ createdAt: daysAgo(1), assignees: [{ userId: "a", respondedAt: new Date(daysAgo(1).getTime() + 4 * 3600e3) }] }),
    ]);
    expect(p.find((x) => x.userId === "a")).toEqual({ userId: "a", assigned: 2, completed: 1, completionPct: 50, avgResponseHours: 3 });
    expect(p.find((x) => x.userId === "b")).toEqual({ userId: "b", assigned: 1, completed: 1, completionPct: 100, avgResponseHours: null });
  });
});
