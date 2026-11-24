import { auditExport, branding, documentContext, filterRows, pdfResponse, planFacts, rosterFor } from "@/lib/execution/docs";
import { qrDataUrl, renderDutyPasses } from "@/lib/execution/pdf";
import { signCheckinToken } from "@/lib/execution/qr";

/** Duty passes: an Office Incharge gets their station's officers, an officer their own pass. */
export async function GET(request: Request, ctx: RouteContext<"/api/plans/[planId]/duty-passes">) {
  const { planId } = await ctx.params;
  const c = await documentContext(planId, ["dutypass.view", "execution.idcards"]);
  if (c instanceof Response) return c;
  const url = new URL(request.url);
  const { rows } = await rosterFor(c.user, c.plan);
  const picked = filterRows(rows, url.searchParams);
  if (picked.length === 0) return new Response("No duty passes for you on this plan.", { status: 404 });
  const facts = await planFacts(c.plan);
  const origin = process.env.APP_URL ?? url.origin;
  const passes = await Promise.all(
    picked.map(async (r) => ({
      name: r.name,
      rank: r.rank,
      genNo: r.genNo,
      station: r.station,
      posting: r.posting,
      sector: r.sector,
      component: r.component,
      batch: r.batches > 1 ? r.batch : null,
      photo: null,
      qr: await qrDataUrl(`${origin}/c/${signCheckinToken(c.plan.id, r.id)}`),
      dates: facts.dates,
      venue: c.plan.venue ?? "",
      schedule: facts.schedule.filter((s) => s.rank === "All ranks" || s.rank === r.rank),
      instructions: r.instructions,
    })),
  );
  const pdf = await renderDutyPasses(passes, await branding(c.plan, null, null), c.plan.title);
  await auditExport(c.user, "export.duty_passes", c.plan.id, passes.length);
  return pdfResponse(pdf, `${c.plan.code}-duty-passes.pdf`);
}
