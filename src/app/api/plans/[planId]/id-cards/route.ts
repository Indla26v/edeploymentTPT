import { auditExport, branding, documentContext, filterRows, pdfResponse, rosterFor } from "@/lib/execution/docs";
import { pdfImage, qrDataUrl, renderIdCards } from "@/lib/execution/pdf";
import { signCheckinToken } from "@/lib/execution/qr";

/** ID cards PDF (1 or 6 per A4), each with a signed check-in QR code. */
export async function GET(request: Request, ctx: RouteContext<"/api/plans/[planId]/id-cards">) {
  const { planId } = await ctx.params;
  const c = await documentContext(planId, ["execution.idcards"]);
  if (c instanceof Response) return c;
  const url = new URL(request.url);
  const q = url.searchParams;
  const { rows } = await rosterFor(c.user, c.plan);
  const picked = filterRows(rows, q);
  if (picked.length === 0) return new Response("No officers match.", { status: 404 });
  const origin = process.env.APP_URL ?? url.origin;
  const cards = await Promise.all(
    picked.map(async (r) => ({
      name: r.name,
      rank: r.rank,
      genNo: r.genNo,
      station: r.station,
      posting: r.posting,
      sector: r.sector,
      component: r.component,
      batch: r.batches > 1 ? r.batch : null,
      photo: await pdfImage(r.photoUrl),
      qr: await qrDataUrl(`${origin}/c/${signCheckinToken(c.plan.id, r.id)}`),
    })),
  );
  const pdf = await renderIdCards(cards, await branding(c.plan, q.get("header"), q.get("theme")), q.get("layout") === "1" ? 1 : 6);
  await auditExport(c.user, "export.id_cards", c.plan.id, cards.length);
  return pdfResponse(pdf, `${c.plan.code}-id-cards.pdf`);
}
