import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";

import { AccessDenied } from "@/components/access-denied";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/authorize";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonsAndBadges } from "./_components/buttons-badges";
import { Feedback } from "./_components/feedback";
import { FormsDemo } from "./_components/forms-demo";
import { Foundations } from "./_components/foundations";
import { Kpis } from "./_components/kpis";
import { PersonsTable } from "./_components/persons-table";
import { PlacementDemo } from "./_components/placement-demo";
import { Section } from "./_components/section";
import { SourcingDemo } from "./_components/sourcing-demo";
import { Stages } from "./_components/stages";

export const metadata: Metadata = { title: "Design system" };

const SECTIONS = [
  { id: "foundations", label: "Foundations" },
  { id: "actions", label: "Buttons & status" },
  { id: "kpis", label: "Dashboard cards" },
  { id: "stages", label: "Stages" },
  { id: "forms", label: "Forms & overlays" },
  { id: "table", label: "Data table" },
  { id: "sourcing", label: "Force sourcing" },
  { id: "placement", label: "Placement board" },
  { id: "feedback", label: "Loading & empty" },
];

/** The design showcase is for administrators (it demonstrates components with sample data). */
async function AdminOnly({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await requireUser();
  return can(user, "admin.roles.manage") ? children : <AccessDenied />;
}

export default function DesignPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
      <AdminOnly>
        <DesignShowcase />
      </AdminOnly>
    </Suspense>
  );
}

function DesignShowcase() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Design system"
        description="Clean, light and compact: rounded surfaces, pill-shaped buttons, status that never relies on colour alone. Everything below is live — try the ledger and drag officers on the placement board."
        breadcrumb={[{ label: "Home", href: "/dashboard" }, { label: "Design system" }]}
        actions={<Badge tone="info" className="py-1">Administrators only</Badge>}
      />

      <nav aria-label="Sections" className="sticky top-14 z-20 -mx-4 overflow-x-auto bg-background/85 px-4 py-2 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <ul className="flex w-max gap-1.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link
                href={`#${s.id}`}
                className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3.5 text-xs font-medium text-muted-foreground shadow-soft transition-colors hover:border-input hover:text-foreground"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="foundations" title="Foundations" description="Colour tokens, shape, type and density. Light theme only.">
        <Foundations />
      </Section>
      <Section id="actions" title="Buttons and status pills" description="All buttons are pills; icon buttons are circles. Workflow status always shows an icon and a label.">
        <ButtonsAndBadges />
      </Section>
      <Section id="kpis" title="Dashboard cards">
        <Kpis />
      </Section>
      <Section id="stages" title="Stage tracker and stepper">
        <Stages />
      </Section>
      <Section id="forms" title="Forms, sheets, dialogs and toasts">
        <FormsDemo />
      </Section>
      <Section id="table" title="Data table" description="Search, filter pills, sorting, abstract, availability toggle, row actions and pagination — the pattern every master screen uses.">
        {/* TanStack Table reads the clock in dev builds, so it renders on the client after the static shell. */}
        <Suspense fallback={<Skeleton className="h-[460px] rounded-2xl" />}>
          <PersonsTable />
        </Suspense>
      </Section>
      <Section
        id="sourcing"
        title="Force sourcing — accept what stations give"
        description="Fix #1. When a station commits fewer men, the Unit Officer accepts the shortfall or tops up from other stations in parallel. The plan never goes back to the Initiating Officer or Component Officers for re-application."
      >
        <SourcingDemo />
      </Section>
      <Section
        id="placement"
        title="Placement board — officers decide, the system only suggests"
        description="Fix #2. “Suggest” places younger officers on demanding points and senior or light-duty officers on resting points, with a reason for every pick. Component Officers drag to change anything; the Initiating Officer can move people across components. Nothing is sent until Publish."
      >
        <PlacementDemo />
      </Section>
      <Section id="feedback" title="Loading and empty states">
        <Feedback />
      </Section>
    </div>
  );
}
