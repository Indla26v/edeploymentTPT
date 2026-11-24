"use client";

import * as React from "react";
import { BookOpen, Download, FileSpreadsheet, IdCard, Printer, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Opt = { id: string; name: string };
const THEMES = [
  { id: "blue", label: "Blue", swatch: "#1e3a8a" },
  { id: "green", label: "Green", swatch: "#166534" },
  { id: "maroon", label: "Maroon", swatch: "#7f1d1d" },
  { id: "black", label: "Black", swatch: "#111827" },
];

function Pick({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: Opt[]; all: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{all}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DocumentsPanel({
  planId,
  total,
  components,
  sectors,
  stations,
  headers,
}: {
  planId: string;
  total: number;
  components: Opt[];
  sectors: (Opt & { componentId: string })[];
  stations: (Opt & { n: number })[];
  headers: { id: string; title: string }[];
}) {
  const [component, setComponent] = React.useState("all");
  const [sector, setSector] = React.useState("all");
  const [layout, setLayout] = React.useState("6");
  const [header, setHeader] = React.useState(headers[0]?.id ?? "none");
  const [theme, setTheme] = React.useState("blue");
  const [station, setStation] = React.useState(stations[0]?.id ?? "all");
  const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v && v !== "all" && v !== "none")).toString();
  const idHref = `/api/plans/${planId}/id-cards?${qs({ component, sector, layout, header, theme })}`;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCard className="size-4 text-primary" /> ID cards
          </CardTitle>
          <CardDescription>Each card has a signed QR code for check-in and check-out at the point.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Pick label="Component" value={component} onChange={(v) => (setComponent(v), setSector("all"))} options={components} all="All components" />
          <Pick label="Sector" value={sector} onChange={setSector} options={sectors.filter((s) => component === "all" || s.componentId === component)} all="All sectors" />
          <div className="grid gap-1.5">
            <Label>Header</Label>
            <Select value={header} onValueChange={setHeader}>
              <SelectTrigger aria-label="Header">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Plan name</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Per page</Label>
            <ToggleGroup type="single" value={layout} onValueChange={(v) => v && setLayout(v)} aria-label="Cards per page" className="w-fit">
              <ToggleGroupItem value="6">6 per page</ToggleGroupItem>
              <ToggleGroupItem value="1">1 per page</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card colour">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} onClick={() => setTheme(t.id)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm aria-checked:border-primary aria-checked:ring-2 aria-checked:ring-primary/20">
                  <span className="size-3.5 rounded-full" style={{ background: t.swatch }} /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button asChild>
              <a href={idHref} target="_blank" rel="noreferrer">
                <Printer /> Generate ID cards
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/plans/${planId}/roster?${qs({ component, sector })}`}>
                <FileSpreadsheet /> Excel report
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="size-4 text-primary" /> Duty passes
            </CardTitle>
            <CardDescription>Posting, reporting schedule and instructions — grouped by station for the Office Incharges.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Pick label="Station" value={station} onChange={setStation} options={stations.map((s) => ({ id: s.id, name: `${s.name} (${s.n})` }))} all={`All stations (${total})`} />
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/plans/${planId}/duty-passes?${qs({ station })}`} target="_blank" rel="noreferrer">
                <Download /> Duty passes
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" /> Scheme book
            </CardTitle>
            <CardDescription>Cover, abstract by rank, reporting schedule, then every component, sector and posting with officers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{total} officers</Badge>
            <Badge tone="neutral">{components.length} components</Badge>
            <Button className="ml-auto" variant="outline" asChild>
              <a href={`/api/plans/${planId}/scheme-book`} target="_blank" rel="noreferrer">
                <BookOpen /> Open scheme book
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
