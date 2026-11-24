import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Whole years between a date of birth and `on` (defaults to today). Age is never stored, always derived. */
export function ageFromDob(dob: Date | string, on: Date = new Date()): number {
  const d = typeof dob === "string" ? new Date(`${dob}T00:00:00Z`) : dob;
  let age = on.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < d.getUTCMonth() ||
    (on.getUTCMonth() === d.getUTCMonth() && on.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** "Rama Krishna Rao" -> "RK" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const numberFormat = new Intl.NumberFormat("en-IN");
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}
