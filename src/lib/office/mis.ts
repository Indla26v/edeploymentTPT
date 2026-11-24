/** Office MIS: pending-age buckets and person-wise analysis (pure, unit-tested). */

export const BUCKETS = [
  { key: "0-5", label: "0–5 days", min: 0, max: 5 },
  { key: "6-15", label: "6–15 days", min: 6, max: 15 },
  { key: "16-45", label: "16–45 days", min: 16, max: 45 },
  { key: "46-90", label: "46–90 days", min: 46, max: 90 },
  { key: "90+", label: "Over 90 days", min: 91, max: Infinity },
] as const;
export type BucketKey = (typeof BUCKETS)[number]["key"];

const DAY = 86400e3;

/** Whole days a task has been open (calendar days since creation). */
export function ageDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY));
}

export function bucketOf(days: number): BucketKey {
  return BUCKETS.find((b) => days >= b.min && days <= b.max)!.key;
}

export type MisTask = { id: string; status: "open" | "action_taken" | "closed" | "reopened"; createdAt: Date; closedAt: Date | null; dueDate: string | null; assignees: { userId: string; respondedAt: Date | null }[] };

export function misSummary(tasks: MisTask[], now = new Date()) {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<BucketKey, number>;
  let pending = 0;
  let actionTaken = 0;
  let completed = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (t.status === "closed") {
      completed++;
      continue;
    }
    if (t.status === "action_taken") actionTaken++;
    else pending++;
    buckets[bucketOf(ageDays(t.createdAt, now))]++;
    if (t.dueDate && new Date(`${t.dueDate}T23:59:59+05:30`) < now) overdue++;
  }
  return { total: tasks.length, pending, actionTaken, completed, overdue, buckets };
}

export type PersonStats = { userId: string; assigned: number; completed: number; completionPct: number; avgResponseHours: number | null };

/** Per assignee: tasks assigned, closed, completion %, average hours to first action. */
export function personWise(tasks: MisTask[]): PersonStats[] {
  const m = new Map<string, { assigned: number; completed: number; responses: number[] }>();
  for (const t of tasks) {
    for (const a of t.assignees) {
      const s = m.get(a.userId) ?? { assigned: 0, completed: 0, responses: [] };
      s.assigned++;
      if (t.status === "closed") s.completed++;
      if (a.respondedAt) s.responses.push((a.respondedAt.getTime() - t.createdAt.getTime()) / 3600e3);
      m.set(a.userId, s);
    }
  }
  return [...m.entries()]
    .map(([userId, s]) => ({
      userId,
      assigned: s.assigned,
      completed: s.completed,
      completionPct: s.assigned ? Math.round((s.completed / s.assigned) * 100) : 0,
      avgResponseHours: s.responses.length ? Math.round((s.responses.reduce((a, b) => a + b, 0) / s.responses.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.completionPct - a.completionPct || b.assigned - a.assigned);
}
