/** Display helpers (Indian locale, IST). */
const TZ = "Asia/Kolkata";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}

export function fmtTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}

/** "10 Dec 2026" or "10–12 Dec 2026" or "28 Dec 2026 – 02 Jan 2027". */
export function fmtRange(a: Date | string | null | undefined, b: Date | string | null | undefined): string {
  if (!a) return "No dates yet";
  if (!b) return fmtDate(a);
  const da = fmtDate(a);
  const db = fmtDate(b);
  if (da === db) return da;
  const [d1, m1, y1] = da.split(" ");
  const [d2, m2, y2] = db.split(" ");
  if (m1 === m2 && y1 === y2) return `${d1}–${d2} ${m2} ${y2}`;
  return `${da} – ${db}`;
}

/** Relative "in 3 h" / "2 d ago". */
export function fmtRelative(d: Date | string, now = new Date()): string {
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const h = Math.round(abs / 3600e3);
  const text = abs < 3600e3 ? `${Math.max(1, Math.round(abs / 60e3))} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** Value for <input type="datetime-local"> in IST from an ISO date. */
export function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).formatToParts(new Date(d));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** ISO string from an IST "YYYY-MM-DDTHH:mm" input value. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
