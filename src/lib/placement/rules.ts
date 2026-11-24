/**
 * Placement rules and the suggestion engine (fix #2: no more blind auto-allocation).
 *
 * The engine only ever produces *suggestions* (draft assignments with reasons). Component
 * Officers and the Initiating Officer move people freely; nothing is final until Publish.
 *
 * Hard rules (a placement is refused):
 *   - rank must match the slot (substitution only with an explicit IO override)
 *   - gender requirement of the point
 *   - officers marked light-duty are never placed on High-intensity points
 *   - officer must not already hold another slot in the same plan
 * Soft rules (scored; warnings shown, placement allowed):
 *   - age vs intensity: High intensity prefers younger officers; officers at/over the
 *     age threshold (default 50) are flagged on High-intensity points
 *   - static / low-intensity points prefer older officers
 *   - Component Officer preference, distance from home station, seniority for incharge slots
 */

export type Intensity = "high" | "medium" | "low";
export type Mobility = "static" | "mobile";
export type GenderReq = "any" | "male" | "female";
export type Fitness = "fit" | "light_duty_only";
export type Gender = "male" | "female";
export type SlotRole = "regular" | "sector_incharge" | "liaison" | "component_incharge";

export type PointProfile = {
  id: string;
  name: string;
  priority: 1 | 2 | 3 | 4; // 1 = critical … 4 = low
  intensity: Intensity;
  mobility: Mobility;
  genderReq: GenderReq;
  lat?: number;
  lng?: number;
};

export type Slot = {
  id: string;
  pointId: string;
  rankCode: string;
  role: SlotRole;
};

export type Officer = {
  id: string;
  name: string;
  rankCode: string;
  /** seniority order of the rank; lower = more senior */
  rankSeniority?: number;
  age: number;
  gender: Gender;
  fitness: Fitness;
  stationName?: string;
  homeLat?: number;
  homeLng?: number;
  /** point ids this officer was preferred for by the Component Officer */
  preferredPointIds?: string[];
};

export type RuleConfig = {
  ageThreshold: number;
  allowRankSubstitution: boolean;
  weights: {
    preference: number;
    ageFit: number;
    distance: number;
  };
};

export const DEFAULT_RULES: RuleConfig = {
  ageThreshold: 50,
  allowRankSubstitution: false,
  weights: { preference: 100, ageFit: 30, distance: 10 },
};

export type Violation = { code: "rank" | "gender" | "fitness" | "double_booked"; message: string };
export type Warning = { code: "age_high_intensity"; message: string };

export function checkPlacement(
  officer: Officer,
  slot: Slot,
  point: PointProfile,
  opts: { alreadyPlaced?: boolean; rules?: RuleConfig } = {},
): { ok: boolean; violations: Violation[]; warnings: Warning[] } {
  const rules = opts.rules ?? DEFAULT_RULES;
  const violations: Violation[] = [];
  const warnings: Warning[] = [];

  if (officer.rankCode !== slot.rankCode && !rules.allowRankSubstitution) {
    violations.push({ code: "rank", message: `Slot needs ${slot.rankCode}; ${officer.name} is ${officer.rankCode}` });
  }
  if (point.genderReq !== "any" && point.genderReq !== officer.gender) {
    violations.push({ code: "gender", message: `${point.name} needs ${point.genderReq} personnel` });
  }
  if (officer.fitness === "light_duty_only" && point.intensity === "high") {
    violations.push({ code: "fitness", message: `${officer.name} is on light duty and cannot take a high-intensity point` });
  }
  if (opts.alreadyPlaced) {
    violations.push({ code: "double_booked", message: `${officer.name} already holds another slot in this plan` });
  }
  if (point.intensity === "high" && officer.age >= rules.ageThreshold) {
    warnings.push({
      code: "age_high_intensity",
      message: `Age ${officer.age} on a high-intensity point (threshold ${rules.ageThreshold})`,
    });
  }
  return { ok: violations.length === 0, violations, warnings };
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Score an allowed placement. Higher is better. Returns human-readable reasons for the "why" tooltip. */
export function scorePlacement(
  officer: Officer,
  slot: Slot,
  point: PointProfile,
  rules: RuleConfig = DEFAULT_RULES,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (officer.preferredPointIds?.includes(point.id)) {
    score += rules.weights.preference;
    reasons.push("Preferred by Component Officer");
  }

  // Age fit: map age 20..60 to 0..1
  const ageNorm = Math.min(1, Math.max(0, (officer.age - 20) / 40));
  if (point.intensity === "high") {
    score += rules.weights.ageFit * (1 - ageNorm);
    if (officer.age < rules.ageThreshold) reasons.push(`Age ${officer.age} suits a high-intensity point`);
    else score -= rules.weights.ageFit; // strong push away, but not forbidden
  } else if (point.intensity === "low" || point.mobility === "static") {
    score += rules.weights.ageFit * ageNorm;
    if (officer.age >= 45) reasons.push(`Senior officer (age ${officer.age}) on a ${point.intensity === "low" ? "low-intensity" : "static"} point`);
  } else {
    score += rules.weights.ageFit * 0.5;
  }

  if (
    officer.homeLat !== undefined &&
    officer.homeLng !== undefined &&
    point.lat !== undefined &&
    point.lng !== undefined
  ) {
    const d = km(officer.homeLat, officer.homeLng, point.lat, point.lng);
    score += rules.weights.distance * Math.max(0, 1 - d / 30);
    if (d < 5) reasons.push(`${d.toFixed(1)} km from ${officer.stationName ?? "home station"}`);
  }

  if (slot.role !== "regular" && officer.rankSeniority !== undefined) {
    score += Math.max(0, 20 - officer.rankSeniority);
    reasons.push("Senior officer for an in-charge role");
  }

  return { score, reasons };
}

export type Suggestion = { slotId: string; officerId: string; score: number; reasons: string[]; warnings: Warning[] };

/**
 * Slots that accept the same set of officers share a class: same rank (unless substitution is on),
 * same gender requirement, and whether the point is high intensity (light-duty officers excluded).
 */
function slotClass(slot: Slot, point: PointProfile, rules: RuleConfig): string {
  return `${rules.allowRankSubstitution ? "*" : slot.rankCode}|${point.genderReq}|${point.intensity === "high" ? "H" : "N"}`;
}

function eligibleForClass(o: Officer, cls: string): boolean {
  const [rank, genderReq, high] = cls.split("|");
  if (rank !== "*" && o.rankCode !== rank) return false;
  if (genderReq !== "any" && o.gender !== genderReq) return false;
  if (high === "H" && o.fitness === "light_duty_only") return false;
  return true;
}

/**
 * Explainable suggestion. Nothing here is final; it only proposes draft assignments.
 *
 *  1. Locked / manual assignments are kept and their officers are not reused.
 *  2. Component Officer preferences are honoured first (explicit human intent).
 *  3. Remaining slots are filled in order of point priority (critical first); within the same priority the
 *     most constrained slots go first (e.g. women-only points), then high intensity, then in-charge roles.
 *  4. For each slot the best-scoring allowed officer wins. Officers who are scarce for another open slot
 *     class (e.g. the only women constables left while a women-only point is still open) are held back from
 *     unrestricted slots.
 *
 * With fewer officers than slots, the lowest-priority slots are the ones left open.
 */
export function suggestPlacements(input: {
  slots: Slot[];
  points: PointProfile[];
  officers: Officer[];
  /** existing assignments that must be kept (locked or manually placed) */
  keep?: { slotId: string; officerId: string }[];
  rules?: RuleConfig;
}): { suggestions: Suggestion[]; unfilledSlotIds: string[] } {
  const rules = input.rules ?? DEFAULT_RULES;
  const scarcityPenalty = 40;
  const pointById = new Map(input.points.map((p) => [p.id, p]));
  const keptSlots = new Set((input.keep ?? []).map((k) => k.slotId));
  const used = new Set((input.keep ?? []).map((k) => k.officerId));
  const intensityRank: Record<Intensity, number> = { high: 0, medium: 1, low: 2 };

  const suggestions: Suggestion[] = [];
  const unfilled: string[] = [];
  const filled = new Set<string>();

  const open = input.slots.filter((s) => {
    if (keptSlots.has(s.id)) return false;
    if (!pointById.has(s.pointId)) {
      unfilled.push(s.id);
      return false;
    }
    return true;
  });

  const assign = (officer: Officer, slot: Slot, point: PointProfile, warnings: Warning[]) => {
    const { score, reasons } = scorePlacement(officer, slot, point, rules);
    suggestions.push({ slotId: slot.id, officerId: officer.id, score, reasons, warnings });
    used.add(officer.id);
    filled.add(slot.id);
  };

  // 2. Preferences first, most important preferred point first.
  for (const officer of input.officers) {
    if (used.has(officer.id) || !officer.preferredPointIds?.length) continue;
    const prefPoints = [...officer.preferredPointIds]
      .map((id) => pointById.get(id))
      .filter((p): p is PointProfile => !!p)
      .sort((a, b) => a.priority - b.priority);
    outer: for (const point of prefPoints) {
      for (const slot of open) {
        if (slot.pointId !== point.id || filled.has(slot.id)) continue;
        const check = checkPlacement(officer, slot, point, { rules });
        if (check.ok) {
          assign(officer, slot, point, check.warnings);
          break outer;
        }
      }
    }
  }

  // 3. Supply / demand per slot class, kept up to date as officers are used and slots filled.
  const classOf = new Map(open.map((s) => [s.id, slotClass(s, pointById.get(s.pointId)!, rules)]));
  const supply = new Map<string, number>();
  const demand = new Map<string, number>();
  for (const s of open) {
    if (filled.has(s.id)) continue;
    const c = classOf.get(s.id)!;
    demand.set(c, (demand.get(c) ?? 0) + 1);
  }
  for (const c of demand.keys()) {
    supply.set(c, input.officers.filter((o) => !used.has(o.id) && eligibleForClass(o, c)).length);
  }

  let remaining = open.filter((s) => !filled.has(s.id));
  while (remaining.length > 0) {
    let slot = remaining[0]!;
    for (const s of remaining) {
      const ps = pointById.get(s.pointId)!;
      const pb = pointById.get(slot.pointId)!;
      const cmp =
        ps.priority - pb.priority ||
        supply.get(classOf.get(s.id)!)! - supply.get(classOf.get(slot.id)!)! ||
        intensityRank[ps.intensity] - intensityRank[pb.intensity] ||
        (s.role === "regular" ? 1 : 0) - (slot.role === "regular" ? 1 : 0) ||
        s.id.localeCompare(slot.id);
      if (cmp < 0) slot = s;
    }
    remaining = remaining.filter((s) => s.id !== slot.id);
    const cls = classOf.get(slot.id)!;
    demand.set(cls, demand.get(cls)! - 1);
    const point = pointById.get(slot.pointId)!;

    // Classes that are already tight (demand >= supply) after taking this slot.
    const tight = [...demand.entries()].filter(([c, d]) => c !== cls && d > 0 && d >= supply.get(c)!).map(([c]) => c);

    let best: { officer: Officer; score: number; warnings: Warning[] } | null = null;
    for (const officer of input.officers) {
      if (used.has(officer.id)) continue;
      const check = checkPlacement(officer, slot, point, { rules });
      if (!check.ok) continue;
      let { score } = scorePlacement(officer, slot, point, rules);
      if (tight.some((c) => eligibleForClass(officer, c))) score -= scarcityPenalty;
      if (!best || score > best.score || (score === best.score && officer.id < best.officer.id)) {
        best = { officer, score, warnings: check.warnings };
      }
    }
    if (!best) {
      unfilled.push(slot.id);
      continue;
    }
    assign(best.officer, slot, point, best.warnings);
    for (const c of supply.keys()) if (eligibleForClass(best.officer, c)) supply.set(c, supply.get(c)! - 1);
  }

  return { suggestions, unfilledSlotIds: unfilled };
}
