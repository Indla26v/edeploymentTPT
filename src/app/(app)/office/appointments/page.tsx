import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listAppointments, officeOptions } from "@/lib/queries/office";
import { AppointmentsClient } from "./appointments-client";

export const metadata: Metadata = { title: "Appointments" };

export default function AppointmentsPage() {
  return (
    <ListPage title="Appointments" breadcrumb={[{ label: "Office" }]} description="Visitors, their purpose, and who follows up.">
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <Appointments />
      </Suspense>
    </ListPage>
  );
}

async function Appointments() {
  await connection();
  const user = await requireUser();
  if (!can(user, "office.appointments.manage")) return <AccessDenied />;
  if (!user.unitId) return <AccessDenied message="Switch to a unit role to use the office module." />;
  const [rows, options] = await Promise.all([listAppointments(user), officeOptions(user)]);
  return (
    <AppointmentsClient
      staff={options.staff}
      rows={rows.map(({ a, allottedName, taskStatus }) => ({ id: a.id, visitorName: a.visitorName, visitorPhone: a.visitorPhone, purpose: a.purpose, scheduledAt: a.scheduledAt.toISOString(), status: a.status, notes: a.notes, allottedName, taskId: a.taskId, taskStatus }))}
    />
  );
}
