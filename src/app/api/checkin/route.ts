import { z } from "zod";

import { getDb } from "@/lib/db";
import { verifyCheckinToken } from "@/lib/execution/qr";
import { recordAttendance } from "@/lib/execution/server";

const body = z.object({
  token: z.string().max(200),
  event: z.enum(["check_in", "check_out"]),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100000).nullable().optional(),
});

/** Public: scanned from the ID card QR. The signed token identifies the officer and plan. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  const who = verifyCheckinToken(parsed.data.token);
  if (!who) return Response.json({ ok: false, error: "This QR code is not valid." }, { status: 403 });
  const r = await getDb().transaction((tx) =>
    recordAttendance(tx, { planId: who.planId, personId: who.personId, event: parsed.data.event, lat: parsed.data.lat ?? null, lng: parsed.data.lng ?? null, accuracyM: parsed.data.accuracy ? Math.round(parsed.data.accuracy) : null, via: "qr" }),
  );
  if (!r.ok) return Response.json(r, { status: 409 });
  return Response.json(r);
}
