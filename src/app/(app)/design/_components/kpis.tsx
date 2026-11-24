import { Building2, CircleCheck, ShieldCheck, Users, UserCheck, TriangleAlert, Radio, MinusCircle } from "lucide-react";

import { KpiCard } from "@/components/kpi-card";

export function Kpis() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Police stations / offices" value={76} icon={Building2} />
        <KpiCard label="Police persons" value={3677} icon={Users} tone="info" hint="3,412 available today" />
        <KpiCard label="Security plans in pipeline" value={12} icon={ShieldCheck} tone="warning" trend={{ value: "3 this week", direction: "up", good: true }} />
        <KpiCard label="Completed security plans" value={71} icon={CircleCheck} tone="success" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Officers placed" value="1,240 / 1,310" icon={UserCheck} tone="primary" hint="95% of required strength" />
        <KpiCard label="Open gap (all ranks)" value={14} icon={TriangleAlert} tone="warning" hint="Top-up pending from 2 stations" />
        <KpiCard label="Shortfall accepted" value={8} icon={MinusCircle} tone="info" hint="No re-application needed" />
        <KpiCard label="Checked in (live)" value="812 / 1,240" icon={Radio} tone="danger" trend={{ value: "65%", direction: "up", good: true }} />
      </div>
    </div>
  );
}
