import Link from "next/link";
import { CalendarClock, CalendarDays, CircleDot, Hourglass } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { fmtDate, fmtDateTime, fmtTime, toLocalInput } from "@/lib/format";
import { listAppointments, listMeetings, listTasks } from "@/lib/queries/office";

const STATUS = { open: ["pending", "Open"], action_taken: ["submitted", "Action taken"], reopened: ["returned", "Reopened"], closed: ["completed", "Closed"] } as const;

/** Dashboard for Office Manager / Employee: their tasks, today's meetings and visitors. */
export async function OfficeDashboard({ user }: { user: CurrentUser }) {
  const today = toLocalInput(new Date()).slice(0, 10);
  const start = new Date(`${today}T00:00:00+05:30`);
  const [tasks, meetings, appts] = await Promise.all([
    listTasks(user),
    listMeetings(user, start, new Date(start.getTime() + 7 * 86400e3)),
    can(user, "office.appointments.manage") ? listAppointments(user) : Promise.resolve([]),
  ]);
  const manager = can(user, "office.tasks.manage");
  const mine = tasks.filter((t) => t.assignees.some((a) => a.userId === user.id) && (t.status === "open" || t.status === "reopened"));
  const toVerify = tasks.filter((t) => t.status === "action_taken");
  const todayMeetings = meetings.filter((m) => toLocalInput(m.startsAt).slice(0, 10) === today && m.status !== "cancelled");
  const todayAppts = appts.filter(({ a }) => toLocalInput(a.scheduledAt).slice(0, 10) === today);
  const focus = manager ? [...toVerify, ...tasks.filter((t) => t.status === "open" || t.status === "reopened")] : mine;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label={manager ? "Open tasks" : "Assigned to you"} value={manager ? tasks.filter((t) => t.status === "open" || t.status === "reopened").length : mine.length} icon={CircleDot} tone="info" href="/office/tasks" />
        <KpiCard label={manager ? "To verify" : "Awaiting verification"} value={manager ? toVerify.length : tasks.filter((t) => t.status === "action_taken").length} icon={Hourglass} tone="warning" href="/office/tasks" />
        <KpiCard label="Meetings today" value={todayMeetings.length} icon={CalendarDays} href="/office/meetings" />
        {manager ? <KpiCard label="Visitors today" value={todayAppts.length} icon={CalendarClock} tone="success" href="/office/appointments" /> : <KpiCard label="Meetings this week" value={meetings.length} icon={CalendarClock} tone="success" href="/office/meetings" />}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{manager ? "Needs your attention" : "Your tasks"}</CardTitle>
            <CardDescription>{manager ? "Action taken first, then the oldest open tasks." : "Report action taken when done."}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {focus.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/office/tasks?task=${t.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-accent/30">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.assignees.map((a) => a.name).join(", ")}
                        {t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ""}
                      </span>
                    </span>
                    <StatusPill status={STATUS[t.status][0]} label={STATUS[t.status][1]} />
                  </Link>
                </li>
              ))}
              {focus.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">All clear.</li>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {meetings
                .filter((m) => m.status !== "cancelled")
                .slice(0, 6)
                .map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    <Badge tone="info" className="tabular shrink-0">
                      {toLocalInput(m.startsAt).slice(0, 10) === today ? fmtTime(m.startsAt) : fmtDateTime(m.startsAt)}
                    </Badge>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.title}</span>
                      {m.location && <span className="text-xs text-muted-foreground">{m.location}</span>}
                    </span>
                  </li>
                ))}
              {todayAppts.slice(0, 4).map(({ a }) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <Badge tone="success" className="tabular shrink-0">
                    {fmtTime(a.scheduledAt)}
                  </Badge>
                  <span className="min-w-0 truncate">
                    Visitor: {a.visitorName} — {a.purpose}
                  </span>
                </li>
              ))}
              {meetings.length === 0 && todayAppts.length === 0 && <li className="text-sm text-muted-foreground">Nothing scheduled this week.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
