/**
 * Plan and component state machines. Pure functions — the Server Actions call these guards before writing.
 *
 *   draft ──send to COs──▶ proposing ──all components in──▶ consolidating ──send to UO──▶ sourcing
 *   sourcing ──(Phase 5: ledger settled)──▶ placement ──publish──▶ published ──▶ live ──▶ completed
 *
 * Fix #1: nothing after `consolidating` ever moves a plan back to the IO or the COs. A station giving
 * fewer men is settled in the sourcing ledger (accept shortfall / top-up), not by re-applying.
 */
export const PLAN_STATUSES = ["draft", "proposing", "consolidating", "sourcing", "placement", "published", "live", "completed", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const COMPONENT_STATUSES = ["assigned", "in_progress", "submitted", "returned", "accepted"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

const PLAN_FLOW: Record<PlanStatus, PlanStatus[]> = {
  draft: ["proposing", "cancelled"],
  proposing: ["consolidating", "cancelled"],
  consolidating: ["sourcing", "cancelled"],
  sourcing: ["placement", "cancelled"],
  placement: ["published", "cancelled"],
  published: ["placement", "live", "completed"],
  live: ["completed"],
  completed: [],
  cancelled: [],
};

export function canMovePlan(from: PlanStatus, to: PlanStatus): boolean {
  return PLAN_FLOW[from].includes(to);
}

/** Plan statuses in which the plan's structure (components, sectors, points, counts) can still change. */
export const PLANNING_STATUSES: PlanStatus[] = ["draft", "proposing", "consolidating"];

/** The CO may edit their component while the plan is being proposed and the component isn't with the IO. */
export function coCanEdit(plan: PlanStatus, component: ComponentStatus): boolean {
  return (plan === "proposing" || plan === "consolidating") && (component === "assigned" || component === "in_progress" || component === "returned");
}

/** The IO may correct counts inline (no return loop) on submitted / accepted components until sourcing starts. */
export function ioCanEditInline(plan: PlanStatus, component: ComponentStatus): boolean {
  return (plan === "proposing" || plan === "consolidating") && (component === "submitted" || component === "accepted");
}

const COMPONENT_FLOW: Record<ComponentStatus, ComponentStatus[]> = {
  assigned: ["in_progress", "submitted"],
  in_progress: ["submitted"],
  submitted: ["returned", "accepted"],
  returned: ["in_progress", "submitted"],
  accepted: ["returned"],
};

export function canMoveComponent(from: ComponentStatus, to: ComponentStatus): boolean {
  return COMPONENT_FLOW[from].includes(to);
}

/** After a component is submitted: the plan moves to consolidating once every component is in. */
export function planStatusAfterSubmit(plan: PlanStatus, components: ComponentStatus[]): PlanStatus {
  if (plan === "proposing" && components.length > 0 && components.every((c) => c === "submitted" || c === "accepted")) return "consolidating";
  return plan;
}

export type SendToUoCheck = { ok: true } | { ok: false; problems: string[] };

/** Guard for "Send to Unit Officer": every component in (none pending / returned) and at least one man required. */
export function checkSendToUo(plan: PlanStatus, components: { name: string; status: ComponentStatus }[], totalRequired: number): SendToUoCheck {
  const problems: string[] = [];
  if (plan !== "consolidating" && plan !== "proposing") problems.push("The plan has already been sent for force sourcing.");
  if (components.length === 0) problems.push("Add at least one component.");
  for (const c of components) {
    if (c.status !== "submitted" && c.status !== "accepted") problems.push(`${c.name}: proposal ${c.status === "returned" ? "was returned and not resubmitted" : "not submitted yet"}.`);
  }
  if (totalRequired <= 0) problems.push("No men are required yet — add counts to the points.");
  return problems.length ? { ok: false, problems } : { ok: true };
}

/** Guard for "Send to Component Officers". */
export function checkSendToCos(input: { windows: number; components: { name: string; hasCo: boolean }[] }): SendToUoCheck {
  const problems: string[] = [];
  if (input.windows === 0) problems.push("Add at least one duty date.");
  if (input.components.length === 0) problems.push("Add at least one component.");
  for (const c of input.components) if (!c.hasCo) problems.push(`${c.name}: choose a Component Officer.`);
  return problems.length ? { ok: false, problems } : { ok: true };
}

/** Stage tracker for a plan. */
export type StageState = "done" | "current" | "upcoming" | "attention";
export function planStages(status: PlanStatus, opts: { returned?: number; pendingComponents?: number } = {}): { key: string; label: string; state: StageState; note?: string }[] {
  const order: { key: PlanStatus | "proposing"; label: string }[] = [
    { key: "draft", label: "Initiated" },
    { key: "proposing", label: "Proposals" },
    { key: "consolidating", label: "Consolidation" },
    { key: "sourcing", label: "Force sourcing" },
    { key: "placement", label: "Placement" },
    { key: "published", label: "Published" },
    { key: "completed", label: "Completed" },
  ];
  const rank = (s: PlanStatus) => (s === "live" ? order.findIndex((o) => o.key === "published") + 0.5 : order.findIndex((o) => o.key === s));
  const cur = rank(status);
  return order.map((o, i) => {
    let state: StageState = i < cur ? "done" : i === Math.floor(cur) ? "current" : "upcoming";
    if (status === "completed" && o.key === "completed") state = "done";
    let note: string | undefined;
    if (o.key === "proposing" && status === "proposing" && opts.pendingComponents) note = `${opts.pendingComponents} pending`;
    if (o.key === "consolidating" && status === "consolidating" && opts.returned) {
      state = "attention";
      note = `${opts.returned} returned`;
    }
    if (status === "live" && o.key === "published") note = "Live now";
    return { key: o.key, label: o.label, state, note };
  });
}
