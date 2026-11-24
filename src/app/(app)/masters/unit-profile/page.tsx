import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Landmark } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { EmptyState } from "@/components/empty-state";
import { ListPage } from "@/components/layout/page-layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { getUnitProfile } from "@/lib/queries/masters";
import { UnitProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Unit profile" };

export default function UnitProfilePage() {
  return (
    <ListPage title="Unit profile" breadcrumb={[{ label: "Masters" }]}>
      <Suspense fallback={<Skeleton className="h-[420px] rounded-2xl" />}>
        <ProfileData />
      </Suspense>
    </ListPage>
  );
}

async function ProfileData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "masters.view")) return <AccessDenied />;
  if (!user.unitId) return <EmptyState icon={Landmark} title="No unit selected" description="Switch to a unit role to see its profile." />;
  const profile = await getUnitProfile(user.unitId);
  if (!profile) return <EmptyState icon={Landmark} title="Unit not found" description="Your account isn't linked to a unit." />;
  return <UnitProfileForm profile={profile} canManage={can(user, "masters.unitprofile.manage")} />;
}
