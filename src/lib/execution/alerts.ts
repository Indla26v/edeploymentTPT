import "server-only";

import { and, eq, gt, inArray } from "drizzle-orm";

import type { DbOrTx } from "../auth/accounts";
import { planEvents, plans } from "../db/schema";
import { notifyUser } from "../server/notify";
import { planLeads } from "../sourcing/server";
import { getRoster, summarize } from "./server";

/** For live plans: tell the IO and COs when officers haven't checked in after reporting time (at most hourly). */
export async function absentAlerts(db: DbOrTx, now = new Date()): Promise<number> {
  const live = await db.select({ id: plans.id, title: plans.title }).from(plans).where(eq(plans.status, "live"));
  if (live.length === 0) return 0;
  const recent = await db
    .select({ planId: planEvents.planId })
    .from(planEvents)
    .where(and(inArray(planEvents.planId, live.map((p) => p.id)), eq(planEvents.kind, "absent_alert"), gt(planEvents.createdAt, new Date(now.getTime() - 3600e3))));
  let sent = 0;
  for (const p of live.filter((x) => !recent.some((r) => r.planId === x.id))) {
    const s = summarize((await getRoster(db, p.id, now)).rows);
    if (s.absent === 0) continue;
    await db.insert(planEvents).values({ planId: p.id, kind: "absent_alert", message: `${s.absent} officers not checked in after reporting time`, createdAt: now });
    for (const u of await planLeads(db, p.id)) await notifyUser(db, u, { title: `${s.absent} absent: ${p.title}`, body: `${s.present} present of ${s.total}.`, href: `/plans/${p.id}/live`, kind: "alert" });
    sent++;
  }
  return sent;
}
