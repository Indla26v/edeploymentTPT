import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ALL_NAV_ITEMS, BUILT_PHASE } from "@/lib/nav";

/**
 * Placeholder for navigation entries whose screens arrive in later phases (see docs/PLAN.md).
 * Keeps every sidebar link working while the app is built phase by phase.
 */
const PLACEHOLDERS = ALL_NAV_ITEMS.filter((i) => i.phase > BUILT_PHASE);

export function generateStaticParams() {
  return PLACEHOLDERS.map((i) => ({ slug: i.href.split("/").filter(Boolean) }));
}

const PHASE_TITLE: Record<number, string> = {
  2: "Authentication & roles",
  3: "Masters",
  4: "Plan → propose → consolidate",
  5: "Force sourcing & reconciliation",
  6: "Placement & publish",
  7: "Execution (ID cards, live, accommodation, equipment)",
  8: "Office Manager module",
  9: "Hardening",
};

export default async function ComingSoonPage({ params }: PageProps<"/[...slug]">) {
  const { slug } = await params;
  const href = `/${slug.join("/")}`;
  const item = PLACEHOLDERS.find((i) => i.href === href);
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <div className="space-y-6">
      <PageHeader title={item.label} breadcrumb={[{ label: "Home", href: "/dashboard" }, { label: item.label }]} />
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-start gap-5 sm:flex-row">
          <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="space-y-3">
            <Badge tone="info" className="py-1">
              <Hammer aria-hidden /> Coming in phase {item.phase} · {PHASE_TITLE[item.phase]}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {item.description ?? `This screen is part of phase ${item.phase} of the delivery plan.`}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft /> Back to dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
