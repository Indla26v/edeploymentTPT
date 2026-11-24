import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { buildWorkbook, xlsxResponse, type SheetColumn } from "@/lib/excel";
import { getDef, listMaster } from "@/lib/masters/server";
import { listEquipment, listPersons, listPoints, listStations } from "@/lib/queries/masters";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/server/mutate";

/** Excel export for every list screen. Requires the export permission plus the screen's own permission; audited. */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/[entity]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "export.excel")) return new Response("Forbidden", { status: 403 });
  const { entity } = await ctx.params;
  const stamp = new Date().toISOString().slice(0, 10);
  let buffer: Buffer;

  if (entity === "persons" && can(user, "masters.view")) {
    const rows = await listPersons(user);
    const cols: SheetColumn<(typeof rows)[number]>[] = [
      { header: "Gen No", value: (r) => r.genNo },
      { header: "Name", value: (r) => r.name, width: 30 },
      { header: "Rank", value: (r) => r.rank },
      { header: "Station", value: (r) => r.station, width: 24 },
      { header: "Gender", value: (r) => r.gender },
      { header: "Date of birth", value: (r) => r.dob, width: 14 },
      { header: "Age", value: (r) => r.age },
      { header: "Mobile", value: (r) => r.phone, width: 14 },
      { header: "Availability", value: (r) => r.availability, width: 14 },
      { header: "Fitness", value: (r) => r.fitness, width: 16 },
    ];
    buffer = await buildWorkbook("Police persons", cols, rows);
  } else if (entity === "stations" && can(user, "masters.view")) {
    const rows = await listStations(user);
    buffer = await buildWorkbook(
      "Stations",
      [
        { header: "Code", value: (r) => r.code },
        { header: "Station / office", value: (r) => r.name, width: 28 },
        { header: "Division", value: (r) => r.division, width: 18 },
        { header: "Latitude", value: (r) => r.lat },
        { header: "Longitude", value: (r) => r.lng },
        { header: "Office Incharge", value: (r) => (r.inchargeName ? `${r.inchargeRank} ${r.inchargeName}` : ""), width: 30 },
        { header: "Incharge mobile", value: (r) => r.inchargePhone, width: 14 },
        { header: "Strength", value: (r) => r.strength },
        { header: "Available", value: (r) => r.available },
      ],
      rows,
    );
  } else if (entity === "points" && can(user, "masters.points.manage")) {
    const rows = await listPoints(user);
    buffer = await buildWorkbook(
      "Deployment points",
      [
        { header: "Name", value: (r) => r.name, width: 30 },
        { header: "Description", value: (r) => r.description, width: 30 },
        { header: "Latitude", value: (r) => r.lat },
        { header: "Longitude", value: (r) => r.lng },
        { header: "Priority", value: (r) => r.defaultPriority },
        { header: "Intensity", value: (r) => r.defaultIntensity },
        { header: "Mobility", value: (r) => r.defaultMobility },
        { header: "Gender", value: (r) => r.genderReq },
        { header: "Station", value: (r) => r.station, width: 20 },
      ],
      rows,
    );
  } else if (entity === "equipment" && can(user, "masters.equipment.manage")) {
    const { stock } = await listEquipment(user);
    buffer = await buildWorkbook(
      "Equipment",
      [
        { header: "Equipment", value: (r) => r.equipment, width: 22 },
        { header: "Station", value: (r) => r.station, width: 22 },
        { header: "Total", value: (r) => r.total },
        { header: "Working", value: (r) => r.working },
        { header: "Not working", value: (r) => r.total - r.working },
        { header: "Custodian", value: (r) => r.custodianName, width: 22 },
        { header: "Designation", value: (r) => r.custodianDesignation },
        { header: "Mobile", value: (r) => r.custodianPhone, width: 14 },
      ],
      stock,
    );
  } else {
    const def = getDef(entity);
    if (!def || (!can(user, def.viewPermission) && !can(user, def.managePermission))) return new Response("Not found", { status: 404 });
    const rows = await listMaster(user, def);
    const cols: SheetColumn<(typeof rows)[number]>[] = def.fields
      .filter((f) => f.type !== "image")
      .flatMap((f): SheetColumn<(typeof rows)[number]>[] =>
        f.type === "latlng"
          ? [
              { header: "Latitude", value: (r) => (r.lat as number | null) ?? null },
              { header: "Longitude", value: (r) => (r.lng as number | null) ?? null },
            ]
          : [
              {
                header: f.label,
                value: (r) => {
                  const v = r[f.name];
                  if (f.type === "composition") return ((v as { rankCode: string; count: number }[]) ?? []).map((x) => `${x.count} ${x.rankCode}`).join(", ");
                  if (f.type === "boolean") return v ? "Yes" : "No";
                  if (Array.isArray(f.options)) return f.options.find((o) => o.value === v)?.label ?? (v as string);
                  return (v as string | number | null) ?? null;
                },
                width: f.type === "textarea" ? 50 : 18,
              },
            ],
      );
    buffer = await buildWorkbook(def.title, cols, rows);
  }

  await writeAudit(getDb(), { actorUserId: user.id, actingRole: user.activeRole, action: "export.excel", entity, entityId: null });
  return xlsxResponse(buffer, `${entity}-${stamp}.xlsx`);
}
