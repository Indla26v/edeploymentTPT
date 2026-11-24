/**
 * Slot generation: turns a component's sectors, points and per-batch rank counts into one slot per officer.
 * Merged points (same sector, batch, rank and merge group) share officers: the group needs as many as its
 * largest count, and each of those slots covers every point in the group.
 */
export type Intensity = "high" | "medium" | "low";
export type GenderReq = "any" | "male" | "female";

export type SectorIn = { id: string; planComponentId: string; batches: number; inchargeRankId: string | null; liaisonRankId: string | null };
export type PointIn = { id: string; sectorId: string; priority: number; intensity: Intensity; genderReq: GenderReq };
export type RequirementIn = { pointId: string; batch: number; rankId: string; count: number; mergeGroup: string | null };

export type SlotSpec = {
  planComponentId: string;
  sectorId: string;
  pointId: string | null;
  pointIds: string[];
  batch: number;
  rankId: string;
  role: "member" | "sector_incharge" | "liaison";
  seq: number;
  priority: number;
  intensity: Intensity;
  genderReq: GenderReq;
};

const INTENSITY_RANK: Record<Intensity, number> = { low: 0, medium: 1, high: 2 };

/** Combined gender requirement of merged points; `null` when they conflict (men-only + women-only). */
export function mergeGender(reqs: GenderReq[]): GenderReq | null {
  const set = new Set(reqs.filter((g) => g !== "any"));
  if (set.size > 1) return null;
  return set.size === 1 ? [...set][0]! : "any";
}

export function buildSlots(sectors: SectorIn[], points: PointIn[], requirements: RequirementIn[]): SlotSpec[] {
  const pointById = new Map(points.map((p) => [p.id, p]));
  const sectorById = new Map(sectors.map((s) => [s.id, s]));
  const out: SlotSpec[] = [];

  // Group requirements: unmerged rows are their own group.
  const groups = new Map<string, RequirementIn[]>();
  for (const r of requirements) {
    if (r.count <= 0) continue;
    const p = pointById.get(r.pointId);
    if (!p) continue;
    const s = sectorById.get(p.sectorId);
    if (!s || r.batch < 1 || r.batch > s.batches) continue;
    const key = r.mergeGroup ? `${p.sectorId}|${r.batch}|${r.rankId}|m:${r.mergeGroup}` : `${p.sectorId}|${r.batch}|${r.rankId}|p:${r.pointId}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }

  for (const rows of groups.values()) {
    const pts = rows.map((r) => pointById.get(r.pointId)!).sort((a, b) => a.priority - b.priority);
    const primary = pts[0]!;
    const sector = sectorById.get(primary.sectorId)!;
    const count = Math.max(...rows.map((r) => r.count));
    const gender = mergeGender(pts.map((p) => p.genderReq)) ?? "any";
    const intensity = pts.reduce<Intensity>((acc, p) => (INTENSITY_RANK[p.intensity] > INTENSITY_RANK[acc] ? p.intensity : acc), "low");
    for (let i = 1; i <= count; i++) {
      out.push({
        planComponentId: sector.planComponentId,
        sectorId: sector.id,
        pointId: primary.id,
        pointIds: [...new Set(pts.map((p) => p.id))],
        batch: rows[0]!.batch,
        rankId: rows[0]!.rankId,
        role: "member",
        seq: i,
        priority: primary.priority,
        intensity,
        genderReq: gender,
      });
    }
  }

  // One sector incharge and at most one liaison officer per sector and batch.
  for (const s of sectors) {
    const sp = points.filter((p) => p.sectorId === s.id);
    const priority = sp.length ? Math.min(...sp.map((p) => p.priority)) : 3;
    for (let b = 1; b <= s.batches; b++) {
      if (s.inchargeRankId) out.push({ planComponentId: s.planComponentId, sectorId: s.id, pointId: null, pointIds: [], batch: b, rankId: s.inchargeRankId, role: "sector_incharge", seq: 1, priority, intensity: "medium", genderReq: "any" });
      if (s.liaisonRankId) out.push({ planComponentId: s.planComponentId, sectorId: s.id, pointId: null, pointIds: [], batch: b, rankId: s.liaisonRankId, role: "liaison", seq: 1, priority, intensity: "low", genderReq: "any" });
    }
  }
  return out;
}

/** Total men by rank (what sourcing has to find). */
export function requiredByRank(slots: Pick<SlotSpec, "rankId">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) m.set(s.rankId, (m.get(s.rankId) ?? 0) + 1);
  return m;
}

export type ProposalProblem = { where: string; message: string };

/** Pre-submit checks for a CO proposal (shown on the Preview step). */
export function validateProposal(sectors: (SectorIn & { name: string })[], points: (PointIn & { name: string })[], requirements: RequirementIn[]): ProposalProblem[] {
  const problems: ProposalProblem[] = [];
  if (sectors.length === 0) problems.push({ where: "Sectors", message: "Add at least one sector." });
  for (const s of sectors) {
    const sp = points.filter((p) => p.sectorId === s.id);
    if (sp.length === 0) problems.push({ where: s.name, message: "Add at least one point to this sector." });
  }
  for (const p of points) {
    const total = requirements.filter((r) => r.pointId === p.id).reduce((a, r) => a + Math.max(0, r.count), 0);
    if (total === 0) problems.push({ where: p.name, message: "No ranks required — enter at least one count (zero-rank point)." });
  }
  // Merge groups must not mix men-only and women-only points.
  const groups = new Map<string, PointIn[]>();
  for (const r of requirements) {
    if (!r.mergeGroup || r.count <= 0) continue;
    const p = points.find((x) => x.id === r.pointId);
    if (!p) continue;
    const key = `${p.sectorId}|${r.batch}|${r.rankId}|${r.mergeGroup}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const [key, pts] of groups) {
    if (mergeGender(pts.map((p) => p.genderReq)) === null) problems.push({ where: `Merge ${key.split("|")[3]}`, message: "Merged points mix men-only and women-only requirements." });
  }
  return problems;
}
