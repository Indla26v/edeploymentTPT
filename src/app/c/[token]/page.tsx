import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { ShieldCheck, ShieldX } from "lucide-react";

import { getDb } from "@/lib/db";
import { persons, plans, ranks } from "@/lib/db/schema";
import { verifyCheckinToken } from "@/lib/execution/qr";
import { getRoster, lastEvent } from "@/lib/execution/server";
import { fmtDateTime } from "@/lib/format";
import { CheckinButtons } from "./checkin-buttons";

export const metadata: Metadata = { title: "Duty check-in", robots: { index: false } };

export default function CheckinPage(props: PageProps<"/c/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 bg-background p-4">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-muted" />}>
        <Checkin {...props} />
      </Suspense>
    </main>
  );
}

async function Checkin({ params }: PageProps<"/c/[token]">) {
  await connection();
  const { token } = await params;
  const who = verifyCheckinToken(decodeURIComponent(token));
  if (!who) return <Invalid text="This QR code is not valid. Use the code on your ID card or duty pass." />;
  const db = getDb();
  const [plan] = await db.select({ id: plans.id, title: plans.title, status: plans.status, venue: plans.venue }).from(plans).where(eq(plans.id, who.planId)).limit(1);
  const [person] = await db.select({ name: persons.name, rank: ranks.code, genNo: persons.genNo }).from(persons).innerJoin(ranks, eq(ranks.id, persons.rankId)).where(eq(persons.id, who.personId)).limit(1);
  if (!plan || !person) return <Invalid text="This duty no longer exists." />;
  const roster = await getRoster(db, plan.id);
  const me = roster.rows.find((r) => r.id === who.personId);
  if (!me) return <Invalid text="You are not on the published duty roster of this bandobast." />;
  const last = await lastEvent(db, plan.id, who.personId);
  const open = ["published", "live"].includes(plan.status);
  return (
    <>
      <div className="flex items-center gap-2 pt-2 text-sm font-medium text-primary">
        <ShieldCheck className="size-5" /> eDeployment · Duty check-in
      </div>
      <section className="rounded-3xl border bg-card p-5 shadow-soft">
        <p className="text-xs text-muted-foreground">{plan.title}</p>
        <h1 className="mt-1 text-xl font-semibold">
          {person.rank} {person.name}
        </h1>
        <p className="text-sm text-muted-foreground">Gen No {person.genNo}</p>
        <div className="mt-4 rounded-2xl bg-muted p-3">
          <p className="text-xs text-muted-foreground">Your posting</p>
          <p className="text-lg font-semibold">{me.posting}</p>
          <p className="text-sm text-muted-foreground">
            {me.component} › {me.sector}
            {me.batches > 1 ? ` · Batch ${me.batch}` : ""}
          </p>
        </div>
        {last && (
          <p className="mt-3 text-sm">
            Last: <span className="font-medium">{last.event === "check_in" ? "Checked in" : "Checked out"}</span> at {fmtDateTime(last.at)}
            {last.flagged ? <span className="text-warning-soft-foreground"> · {last.distanceM} m from your point</span> : null}
          </p>
        )}
      </section>
      {open ? <CheckinButtons token={decodeURIComponent(token)} checkedIn={last?.event === "check_in"} /> : <p className="rounded-2xl border p-4 text-center text-sm text-muted-foreground">Check-in is closed for this bandobast.</p>}
    </>
  );
}

function Invalid({ text }: { text: string }) {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 rounded-3xl border bg-card p-8 text-center shadow-soft">
      <ShieldX className="size-10 text-danger" />
      <p className="font-medium">{text}</p>
    </div>
  );
}
