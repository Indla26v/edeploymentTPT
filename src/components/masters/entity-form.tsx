"use client";

import * as React from "react";
import { ImagePlus, MapPin, Minus, Plus, Trash2 } from "lucide-react";

import { MapView, StreetViewLink } from "@/components/map/map-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FieldDef, Option } from "@/lib/masters/defs";
import { cn } from "@/lib/utils";

export type FormValues = Record<string, unknown>;
export type OptionSets = { stations: Option[]; ranks: Option[] };

function optionsFor(f: FieldDef, sets: OptionSets): Option[] {
  if (Array.isArray(f.options)) return f.options;
  if (f.options === "stations") return sets.stations;
  if (f.options === "ranks") return sets.ranks;
  return [];
}

export function initialValues(fields: FieldDef[], row?: Record<string, unknown> | null): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    const existing = row?.[f.name];
    if (existing !== undefined && existing !== null) v[f.name] = f.type === "time" ? String(existing).slice(0, 5) : existing;
    else if (f.defaultValue !== undefined) v[f.name] = f.defaultValue;
    else v[f.name] = f.type === "boolean" ? false : f.type === "composition" ? [] : f.type === "latlng" ? { lat: null, lng: null } : "";
  }
  return v;
}

/** Converts form values into FormData for a Server Action (files kept, structured values JSON-encoded). */
export function toFormData(fields: FieldDef[], values: FormValues, files: Record<string, File | "__remove__" | undefined>): FormData {
  const fd = new FormData();
  for (const f of fields) {
    if (f.type === "image") {
      const file = files[f.name];
      if (file) fd.set(f.name, file);
      continue;
    }
    const v = values[f.name];
    if (f.type === "latlng" || f.type === "composition") fd.set(f.name, JSON.stringify(v ?? null));
    else if (v !== undefined && v !== null) fd.set(f.name, String(v));
  }
  return fd;
}

function CompositionField({ value, onChange, ranks }: { value: { rankCode: string; count: number }[]; onChange: (v: { rankCode: string; count: number }[]) => void; ranks: Option[] }) {
  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={row.rankCode} onValueChange={(v) => onChange(value.map((r, j) => (j === i ? { ...r, rankCode: v } : r)))}>
            <SelectTrigger className="w-36" aria-label="Rank">
              <SelectValue placeholder="Rank" />
            </SelectTrigger>
            <SelectContent>
              {ranks.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label="Fewer" onClick={() => onChange(value.map((r, j) => (j === i ? { ...r, count: Math.max(1, r.count - 1) } : r)))}>
              <Minus />
            </Button>
            <Input className="tabular h-8 w-14 text-center" inputMode="numeric" value={row.count} onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, count: Number(e.target.value.replace(/\D/g, "")) || 1 } : r)))} aria-label="Count" />
            <Button type="button" variant="outline" size="icon-sm" aria-label="More" onClick={() => onChange(value.map((r, j) => (j === i ? { ...r, count: r.count + 1 } : r)))}>
              <Plus />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove rank" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { rankCode: ranks[0]?.value ?? "PC", count: 1 }])}>
        <Plus /> Add rank
      </Button>
    </div>
  );
}

function LatLngField({ value, onChange }: { value: { lat: number | null; lng: number | null }; onChange: (v: { lat: number | null; lng: number | null }) => void }) {
  const [showMap, setShowMap] = React.useState(false);
  const has = value.lat !== null && value.lng !== null && value.lat !== undefined && value.lng !== undefined;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input inputMode="decimal" placeholder="Latitude" value={value.lat ?? ""} onChange={(e) => onChange({ ...value, lat: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Latitude" />
        <Input inputMode="decimal" placeholder="Longitude" value={value.lng ?? ""} onChange={(e) => onChange({ ...value, lng: e.target.value === "" ? null : Number(e.target.value) })} aria-label="Longitude" />
        <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setShowMap((v) => !v)}>
          <MapPin /> {showMap ? "Hide map" : "Pick on map"}
        </Button>
      </div>
      {showMap && (
        <MapView
          className="h-64"
          points={has ? [{ id: "picked", lat: value.lat!, lng: value.lng!, label: "Selected location" }] : []}
          onPick={(lat, lng) => onChange({ lat, lng })}
        />
      )}
      {has && <StreetViewLink lat={value.lat!} lng={value.lng!} />}
    </div>
  );
}

export function EntityFields({
  fields,
  values,
  onChange,
  errors,
  options,
  files,
  onFile,
}: {
  fields: FieldDef[];
  values: FormValues;
  onChange: (name: string, value: unknown) => void;
  errors: Record<string, string>;
  options: OptionSets;
  files: Record<string, File | "__remove__" | undefined>;
  onFile: (name: string, f: File | "__remove__" | undefined) => void;
}) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {fields.map((f) => {
        const id = `f-${f.name}`;
        const err = errors[f.name] ?? errors[`${f.name}.lat`] ?? errors[`${f.name}.lng`];
        const v = values[f.name];
        let control: React.ReactNode;
        switch (f.type) {
          case "textarea":
            control = <Textarea id={id} value={String(v ?? "")} onChange={(e) => onChange(f.name, e.target.value)} placeholder={f.placeholder} aria-invalid={!!err} rows={4} />;
            break;
          case "select":
            control = (
              <Select value={String(v ?? "")} onValueChange={(nv) => onChange(f.name, nv)}>
                <SelectTrigger id={id} aria-invalid={!!err}>
                  <SelectValue placeholder={`Choose ${f.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {optionsFor(f, options).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
            break;
          case "boolean":
            control = (
              <div className="flex h-10 items-center gap-2.5">
                <Switch id={id} checked={!!v} onCheckedChange={(c) => onChange(f.name, c)} />
                <span className="text-sm text-muted-foreground">{v ? "Yes" : "No"}</span>
              </div>
            );
            break;
          case "image": {
            const file = files[f.name];
            const preview = file instanceof File ? URL.createObjectURL(file) : file === "__remove__" ? null : (v as string | null);
            control = (
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local preview of an upload
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="h-9 py-1" onChange={(e) => onFile(f.name, e.target.files?.[0])} />
                  {preview && (
                    <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => onFile(f.name, "__remove__")}>
                      Remove image
                    </Button>
                  )}
                </div>
              </div>
            );
            break;
          }
          case "latlng":
            control = <LatLngField value={(v as { lat: number | null; lng: number | null }) ?? { lat: null, lng: null }} onChange={(nv) => onChange(f.name, nv)} />;
            break;
          case "composition":
            control = <CompositionField value={(v as { rankCode: string; count: number }[]) ?? []} onChange={(nv) => onChange(f.name, nv)} ranks={options.ranks} />;
            break;
          default:
            control = (
              <Input
                id={id}
                type={f.type === "time" ? "time" : f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "numeric" : f.type === "phone" ? "tel" : undefined}
                value={String(v ?? "")}
                onChange={(e) => onChange(f.name, f.type === "phone" || f.type === "number" ? e.target.value.replace(/\D/g, "") : e.target.value)}
                placeholder={f.placeholder}
                aria-invalid={!!err}
                maxLength={f.type === "phone" ? 10 : undefined}
              />
            );
        }
        return (
          <div key={f.name} className={cn("space-y-1.5", (f.wide || f.type === "latlng" || f.type === "composition" || f.type === "textarea") && "sm:col-span-2")}>
            <Label htmlFor={id}>
              {f.label}
              {f.required && <span className="text-destructive">*</span>}
            </Label>
            {control}
            {err ? <p className="text-xs text-destructive">{err}</p> : f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
