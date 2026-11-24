/** Pure parsing/validation of the deployment-points Excel sheet (shared by the import action and tests). */
export const INTENSITY = ["high", "medium", "low"] as const;
export const MOBILITY = ["static", "mobile"] as const;
export const GENDER_REQ = ["any", "male", "female"] as const;
const GENDER = GENDER_REQ;

export type ParsedPoint = {
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  defaultPriority: number;
  defaultIntensity: (typeof INTENSITY)[number];
  defaultMobility: (typeof MOBILITY)[number];
  genderReq: (typeof GENDER)[number];
};

export function parsePointRows(rows: Record<string, string>[]) {
  const errors: { row: number; message: string }[] = [];
  const valid: ParsedPoint[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const get = (k: string) => (r[k] ?? "").trim();
    const problems: string[] = [];
    const name = get("Name");
    const lat = Number(get("Latitude"));
    const lng = Number(get("Longitude"));
    const priority = Number(get("Priority") || 3);
    const intensity = (get("Intensity").toLowerCase() || "medium") as ParsedPoint["defaultIntensity"];
    const mobility = (get("Mobility").toLowerCase() || "static") as ParsedPoint["defaultMobility"];
    const gender = (get("Gender").toLowerCase() || "any") as ParsedPoint["genderReq"];
    if (name.length < 2) problems.push("Name missing");
    else if (seen.has(name.toLowerCase())) problems.push("duplicate name in this file");
    if (!get("Latitude") || !Number.isFinite(lat) || lat < -90 || lat > 90) problems.push("Latitude must be a number between -90 and 90");
    if (!get("Longitude") || !Number.isFinite(lng) || lng < -180 || lng > 180) problems.push("Longitude must be a number between -180 and 180");
    if (!Number.isInteger(priority) || priority < 1 || priority > 4) problems.push("Priority must be 1–4");
    if (!INTENSITY.includes(intensity)) problems.push("Intensity must be high, medium or low");
    if (!MOBILITY.includes(mobility)) problems.push("Mobility must be static or mobile");
    if (!GENDER.includes(gender)) problems.push("Gender must be any, male or female");
    if (problems.length) {
      errors.push({ row: i + 2, message: problems.join("; ") });
      return;
    }
    seen.add(name.toLowerCase());
    valid.push({ name, description: get("Description") || null, lat, lng, defaultPriority: priority, defaultIntensity: intensity, defaultMobility: mobility, genderReq: gender });
  });
  return { valid, errors };
}

