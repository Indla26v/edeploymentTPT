import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listNotes } from "@/lib/queries/office";
import { NotesClient } from "./notes-client";

export const metadata: Metadata = { title: "Notes" };

export default function NotesPage() {
  return (
    <ListPage title="Notes" breadcrumb={[{ label: "Office" }]} description="Private to you.">
      <Suspense fallback={<Skeleton className="h-[320px] rounded-2xl" />}>
        <Notes />
      </Suspense>
    </ListPage>
  );
}

async function Notes() {
  await connection();
  const user = await requireUser();
  if (!can(user, "office.notes")) return <AccessDenied />;
  const rows = await listNotes(user);
  return <NotesClient notes={rows.map((n) => ({ id: n.id, title: n.title, body: n.body, color: n.color, pinned: n.pinned, updatedAt: n.updatedAt.toISOString() }))} />;
}
