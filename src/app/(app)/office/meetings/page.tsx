import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { toLocalInput } from "@/lib/format";
import { listMeetings, officeOptions } from "@/lib/queries/office";
import { MeetingsClient } from "./meetings-client";

export const metadata: Metadata = { title: "Meetings" };

export default function MeetingsPage(props: PageProps<"/office/meetings">) {
  return (
    <ListPage title="Meetings" breadcrumb={[{ label: "Office" }]} description="Schedule, remind, record minutes and send them.">
      <Suspense fallback={<Skeleton className="h-[560px] rounded-2xl" />}>
        <Meetings {...props} />
      </Suspense>
    </ListPage>
  );
}

async function Meetings({ searchParams }: PageProps<"/office/meetings">) {
  await connection();
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user, "office.meetings.attend") && !can(user, "office.meetings.manage")) return <AccessDenied />;
  if (!user.unitId) return <AccessDenied message="Switch to a unit role to use the office module." />;
  const anchor = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : toLocalInput(new Date()).slice(0, 10);
  const view = sp.view === "week" ? "week" : "month";
  // Window: the visible month (with its spill-over weeks) plus a month back for "prior meetings".
  const from = new Date(`${anchor.slice(0, 7)}-01T00:00:00+05:30`);
  from.setMonth(from.getMonth() - 1);
  const to = new Date(`${anchor.slice(0, 7)}-01T00:00:00+05:30`);
  to.setMonth(to.getMonth() + 2);
  const [rows, options] = await Promise.all([listMeetings(user, from, to), officeOptions(user)]);
  return <MeetingsClient meetings={rows} anchor={anchor} view={view} staff={options.staff} manager={can(user, "office.meetings.manage")} me={user.id} />;
}
