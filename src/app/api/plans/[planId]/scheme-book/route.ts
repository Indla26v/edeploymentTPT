import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { persons, planComponents, ranks, sectors, unitProfiles, units } from "@/lib/db/schema";
import { auditExport, documentContext, pdfResponse, planFacts, rosterFor } from "@/lib/execution/docs";
import { pdfImage, renderSchemeBook } from "@/lib/execution/pdf";

/** The scheme book: cover, abstract, reporting schedule, then every component → sector → posting. */
export async function GET(_request: Request, ctx: RouteContext<"/api/plans/[planId]/scheme-book">) {
  const { planId } = await ctx.params;
  const c = await documentContext(planId, ["execution.idcards", "execution.live"]);
  if (c instanceof Response) return c;
  const db = getDb();
  const { rows } = await rosterFor(c.user, c.plan);
  const facts = await planFacts(c.plan);
  const [u] = await db.select({ name: units.name }).from(units).where(eq(units.id, c.plan.unitId));
  const [p] = await db.select().from(unitProfiles).where(eq(unitProfiles.unitId, c.plan.unitId));
  const comps = await db.select({ id: planComponents.id, name: planComponents.name, coPersonId: planComponents.coPersonId }).from(planComponents).where(eq(planComponents.planId, c.plan.id)).orderBy(planComponents.displayOrder);
  const secs = await db.select({ id: sectors.id, planComponentId: sectors.planComponentId, name: sectors.name, instructions: sectors.instructions }).from(sectors).where(eq(sectors.planId, c.plan.id)).orderBy(sectors.displayOrder);
  const coName = async (id: string | null) => {
    if (!id) return "—";
    const [x] = await db.select({ name: persons.name, rank: ranks.code }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId)).where(eq(persons.id, id));
    return x ? `${x.rank} ${x.name}` : "—";
  };
  const overall = c.plan.overallInchargePersonId ? await coName(c.plan.overallInchargePersonId) : null;
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.rank, (totals.get(r.rank) ?? 0) + 1);
  const book = {
    unit: u?.name ?? "",
    about: p?.about ?? null,
    logo: await pdfImage(p?.logoUrl),
    title: c.plan.title,
    code: c.plan.code,
    dates: facts.dates,
    venue: c.plan.venue ?? "",
    overall,
    schedule: facts.schedule,
    totals: [...totals.entries()].map(([rank, n]) => ({ rank, n })),
    components: await Promise.all(
      comps.map(async (cm) => ({
        name: cm.name,
        co: await coName(cm.coPersonId),
        sectors: secs
          .filter((s) => s.planComponentId === cm.id)
          .map((s) => ({
            name: s.name,
            instructions: s.instructions,
            officers: rows.filter((r) => r.sectorId === s.id).map((r) => ({ posting: r.posting, batch: r.batches > 1 ? r.batch : null, rank: r.rank, name: r.name, station: r.station, phone: r.phone })),
          })),
      })),
    ),
  };
  const pdf = await renderSchemeBook(book);
  await auditExport(c.user, "export.scheme_book", c.plan.id, rows.length);
  return pdfResponse(pdf, `${c.plan.code}-scheme-book.pdf`);
}
