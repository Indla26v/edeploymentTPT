import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { CurrentUser } from "../auth/session";
import { getCurrentUser } from "../auth/session";
import { can, isStateLevel } from "../authz/authorize";
import type { PermissionKey } from "../authz/permissions";
import { getDb } from "../db";
import { idCardHeaders, planComponents, planReportingSchedule, planWindows, ranks, unitProfiles, units } from "../db/schema";
import { fmtDateTime, fmtRange } from "../format";
import { guarded } from "../plans/guard";
import { loadPlan, type PlanRow } from "../plans/server";
import { writeAudit } from "../server/mutate";
import { pdfImage, THEMES, type Branding, type Theme } from "./pdf";
import { getRoster, type RosterRow } from "./server";

const KIND: Record<string, string> = { reporting: "Reporting", briefing: "Briefing", deployment: "Deployment", relief: "Relief", de_induction: "De-induction" };

/** Common guard for document routes: signed in, one of the permissions, plan in scope and published. */
export async function documentContext(planId: string, perms: PermissionKey[]): Promise<{ user: CurrentUser; plan: PlanRow } | Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!perms.some((p) => can(user, p))) return new Response("Forbidden", { status: 403 });
  const db = getDb();
  // Office Incharges / personnel see published plans through their officers, not the plan itself.
  const r = await guarded(async () => {
    if (user.activeRole === "OFFICE_INCHARGE" || user.activeRole === "PERSONNEL") {
      const { plans } = await import("../db/schema");
      const [p] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
      if (!p) throw new Error("not found");
      return p;
    }
    return loadPlan(db, user, planId);
  }).catch(() => ({ ok: false as const, message: "That plan doesn't exist." }));
  if (!r.ok) return new Response(r.message, { status: 404 });
  if (!["published", "live", "completed"].includes(r.data.status)) return new Response("Publish the duty allocation first.", { status: 409 });
  return { user, plan: r.data };
}

/** Roster rows the user may print: CO → own components, OI → own station(s), personnel → self. */
export async function rosterFor(user: CurrentUser, plan: PlanRow) {
  const roster = await getRoster(getDb(), plan.id);
  let rows = roster.rows;
  if (user.activeRole === "COMPONENT_OFFICER") {
    const mine = await getDb().select({ id: planComponents.id }).from(planComponents).where(and(eq(planComponents.planId, plan.id), eq(planComponents.coUserId, user.id)));
    rows = rows.filter((r) => mine.some((m) => m.id === r.componentId));
  } else if (user.activeRole === "OFFICE_INCHARGE") {
    const ids = user.assignments.map((a) => a.stationId).filter(Boolean);
    rows = rows.filter((r) => ids.includes(r.stationId));
  } else if (user.activeRole === "PERSONNEL" || (!isStateLevel(user) && !["UNIT_OFFICER", "INITIATING_OFFICER"].includes(user.activeRole))) {
    rows = rows.filter((r) => r.id === user.personId);
  }
  return { ...roster, rows };
}

export function filterRows(rows: RosterRow[], q: URLSearchParams) {
  return rows.filter((r) => (!q.get("component") || r.componentId === q.get("component")) && (!q.get("sector") || r.sectorId === q.get("sector")) && (!q.get("station") || r.stationId === q.get("station")) && (!q.get("status") || r.status === q.get("status")));
}

export async function branding(plan: PlanRow, headerId: string | null, theme: string | null): Promise<Branding> {
  const db = getDb();
  const [u] = await db.select({ name: units.name, officerName: units.officerName, officerDesignation: units.officerDesignation }).from(units).where(eq(units.id, plan.unitId)).limit(1);
  const [p] = await db.select().from(unitProfiles).where(eq(unitProfiles.unitId, plan.unitId)).limit(1);
  const [h] = headerId ? await db.select().from(idCardHeaders).where(and(eq(idCardHeaders.id, headerId), eq(idCardHeaders.unitId, plan.unitId))).limit(1) : [];
  return {
    unit: u?.name ?? "",
    title: h?.title ?? `${plan.title} — Bandobast duty`,
    logo: await pdfImage(h?.imageUrl ?? p?.logoUrl),
    signature: await pdfImage(p?.signatureUrl),
    officerName: u?.officerName ?? "",
    officerDesignation: u?.officerDesignation ?? "",
    theme: theme && theme in THEMES ? (theme as Theme) : "blue",
  };
}

export async function planFacts(plan: PlanRow) {
  const db = getDb();
  const windows = await db.select().from(planWindows).where(eq(planWindows.planId, plan.id)).orderBy(asc(planWindows.startsAt));
  const schedule = await db
    .select({ kind: planReportingSchedule.kind, at: planReportingSchedule.at, place: planReportingSchedule.place, rankId: planReportingSchedule.rankId, rank: ranks.code })
    .from(planReportingSchedule)
    .leftJoin(ranks, eq(ranks.id, planReportingSchedule.rankId))
    .where(eq(planReportingSchedule.planId, plan.id))
    .orderBy(asc(planReportingSchedule.at));
  return {
    dates: fmtRange(windows[0]?.startsAt, windows.at(-1)?.endsAt),
    schedule: schedule.map((s) => ({ kind: KIND[s.kind] ?? s.kind, at: fmtDateTime(s.at), place: s.place, rank: s.rank ?? "All ranks" })),
  };
}

export async function auditExport(user: CurrentUser, action: string, planId: string, count: number) {
  await writeAudit(getDb(), { action, entity: "plan", entityId: planId, after: { rows: count }, actorUserId: user.id, actingRole: user.activeRole });
}

export function pdfResponse(buf: Buffer | Uint8Array, filename: string) {
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${filename}"`, "cache-control": "private, no-store" } });
}
