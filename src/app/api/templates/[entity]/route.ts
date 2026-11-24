import { getCurrentUser } from "@/lib/auth/session";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";

const TEMPLATES: Record<string, { sheet: string; columns: string[]; example: (string | number)[] }> = {
  persons: {
    sheet: "Police persons",
    columns: ["Gen No", "Name", "Rank", "Station Code", "Gender", "Date of birth", "Mobile", "Fitness", "Availability"],
    example: ["1999", "Example Officer", "PC", "PS-T1", "Male", "1995-06-15", "9876500000", "fit", "available"],
  },
  points: {
    sheet: "Deployment points",
    columns: ["Name", "Latitude", "Longitude", "Priority", "Intensity", "Mobility", "Gender", "Description"],
    example: ["Main junction", 16.5062, 80.648, 1, "high", "mobile", "any", "Traffic regulation"],
  },
};

/** Downloadable Excel templates for imports. */
export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[entity]">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { entity } = await ctx.params;
  const t = TEMPLATES[entity];
  if (!t) return new Response("Not found", { status: 404 });
  const buf = await buildWorkbook(
    t.sheet,
    t.columns.map((c, i) => ({ header: c, value: (r: (string | number)[]) => r[i], width: Math.max(14, c.length + 4) })),
    [t.example],
  );
  return xlsxResponse(buf, `${entity}-template.xlsx`);
}
