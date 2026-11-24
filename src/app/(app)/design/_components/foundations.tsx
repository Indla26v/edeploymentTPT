import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SWATCHES = [
  { name: "Primary", className: "bg-primary text-primary-foreground", note: "Police blue · actions" },
  { name: "Accent", className: "bg-accent text-accent-foreground", note: "Selected / active" },
  { name: "Secondary", className: "bg-secondary text-secondary-foreground", note: "Quiet actions" },
  { name: "Success", className: "bg-success text-white", note: "Accepted · published" },
  { name: "Warning", className: "bg-warning text-black/80", note: "Short · pending" },
  { name: "Danger", className: "bg-danger text-white", note: "Overdue · declined" },
  { name: "Info", className: "bg-info text-white", note: "Sent · submitted" },
  { name: "Muted", className: "bg-muted text-muted-foreground", note: "Surfaces" },
];

export function Foundations() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.name} className="space-y-2">
              <div className={cn("flex h-16 items-end rounded-2xl p-3 text-xs font-medium shadow-soft", s.className)}>{s.name}</div>
              <p className="px-1 text-xs text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium">Shape</p>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">Pill · buttons</span>
            <span className="inline-flex size-10 items-center justify-center rounded-full border bg-card text-sm">⬤</span>
          </div>
          <Input placeholder="rounded-xl · inputs" />
          <div className="rounded-2xl border bg-muted/50 p-4 text-sm text-muted-foreground">rounded-2xl · cards & panels</div>
          <div className="space-y-1 border-t pt-4">
            <p className="text-2xl font-semibold tracking-tight">Inter, 24 / semibold</p>
            <p className="text-base">Body text, 16 / regular</p>
            <p className="tabular text-sm text-muted-foreground">Tabular numbers: 1,240 · 0,987</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
