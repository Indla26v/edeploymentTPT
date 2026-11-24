import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { FilePlus2 } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { ListPage } from "@/components/layout/page-layouts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";
import { listPlans } from "@/lib/queries/plans";
import { PlansList } from "./plans-list";

export const metadata: Metadata = { title: "Ongoing plans" };

export default function PlansPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] rounded-2xl" />}>
      <PlansData />
    </Suspense>
  );
}

async function PlansData() {
  await connection();
  const user = await requireUser();
  if (!can(user, "plans.view")) return <AccessDenied />;
  const rows = await listPlans(user, "ongoing");
  const canInitiate = can(user, "plans.initiate");
  return (
    <ListPage
      title="Ongoing plans"
      description={user.activeRole === "COMPONENT_OFFICER" ? "Plans where you lead a component." : "Bandobasts in progress, with where each one stands."}
      actions={
        canInitiate && (
          <Button size="sm" asChild>
            <Link href="/plans/new">
              <FilePlus2 /> Initiate plan
            </Link>
          </Button>
        )
      }
    >
      <PlansList rows={rows} role={user.activeRole} canInitiate={canInitiate} />
    </ListPage>
  );
}
