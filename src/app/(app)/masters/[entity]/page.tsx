import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { MasterClient } from "@/components/masters/master-client";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { MASTER_DEFS, MASTER_KEYS, type MasterDef } from "@/lib/masters/defs";
import { dynamicOptions, listMaster } from "@/lib/masters/server";

export function generateStaticParams() {
  return MASTER_KEYS.map((entity) => ({ entity }));
}

export async function generateMetadata({ params }: PageProps<"/masters/[entity]">): Promise<Metadata> {
  const { entity } = await params;
  return { title: (MASTER_DEFS as Record<string, MasterDef>)[entity]?.title ?? "Masters" };
}

export default async function MasterPage({ params }: PageProps<"/masters/[entity]">) {
  const { entity } = await params;
  const def = (MASTER_DEFS as Record<string, MasterDef>)[entity];
  if (!def) notFound();
  return (
    <ListPage title={def.title} breadcrumb={[{ label: "Masters" }]} description={def.description}>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <MasterData def={def} />
      </Suspense>
    </ListPage>
  );
}

async function MasterData({ def }: { def: MasterDef }) {
  await connection();
  const user = await requireUser();
  if (!can(user, def.viewPermission) && !can(user, def.managePermission)) return <AccessDenied />;
  const [rows, options] = await Promise.all([listMaster(user, def), dynamicOptions(user)]);
  return <MasterClient def={def} rows={rows} options={options} canManage={can(user, def.managePermission)} />;
}
