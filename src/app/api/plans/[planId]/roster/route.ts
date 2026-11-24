import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { auditExport, documentContext, filterRows, rosterFor } from "@/lib/execution/docs";
import type { RosterRow } from "@/lib/execution/server";
import { fmtDateTime } from "@/lib/format";

/** Roster / attendance Excel. ?status=absent gives the absentee list. */
export async function GET(request: Request, ctx: RouteContext<"/api/plans/[planId]/roster">) {
  const { planId } = await ctx.params;
  const c = await documentContext(planId, ["execution.live", "execution.idcards"]);
  if (c instanceof Response) return c;
  const q = new URL(request.url).searchParams;
  const { rows } = await rosterFor(c.user, c.plan);
  const picked = filterRows(rows, q);
  const buf = await buildWorkbook<RosterRow>(
    q.get("status") === "absent" ? "Absentees" : "Duty roster",
    [
      { header: "Component", value: (r) => r.component, width: 22 },
      { header: "Sector", value: (r) => r.sector, width: 16 },
      { header: "Posting", value: (r) => r.posting, width: 28 },
      { header: "Batch", value: (r) => (r.batches > 1 ? r.batch : ""), width: 7 },
      { header: "Rank", value: (r) => r.rank, width: 8 },
      { header: "Name", value: (r) => r.name, width: 28 },
      { header: "Gen No", value: (r) => r.genNo, width: 10 },
      { header: "Station", value: (r) => r.station, width: 20 },
      { header: "Mobile", value: (r) => r.phone, width: 13 },
      { header: "Status", value: (r) => r.status.replace("_", " "), width: 12 },
      { header: "Last scan", value: (r) => (r.lastAt ? fmtDateTime(r.lastAt) : ""), width: 16 },
      { header: "Far from point", value: (r) => (r.flagged ? `${r.distanceM} m` : ""), width: 14 },
    ],
    picked,
  );
  await auditExport(c.user, q.get("status") === "absent" ? "export.absentees" : "export.roster", c.plan.id, picked.length);
  return xlsxResponse(buf, `${c.plan.code}-${q.get("status") === "absent" ? "absentees" : "roster"}.xlsx`);
}
