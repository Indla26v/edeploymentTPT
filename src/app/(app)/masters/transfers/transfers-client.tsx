"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable, SortHeader } from "@/components/data-table";
import { PersonPicker, type PersonOption } from "@/components/pickers/person-picker";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Option } from "@/lib/masters/defs";
import { decideTransferAction, requestTransferAction, searchTransferablePersonsAction } from "./actions";

export type TransferRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  name: string;
  genNo: string;
  phone: string | null;
  rank: string;
  fromStation: string;
  toStation: string;
};

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export function TransfersClient({ rows, stations, canRequest, canApprove }: { rows: TransferRow[]; stations: Option[]; canRequest: boolean; canApprove: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [person, setPerson] = React.useState<PersonOption | null>(null);
  const [to, setTo] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, start] = React.useTransition();

  const decide = (id: string, d: "approved" | "rejected") =>
    start(async () => {
      const r = await decideTransferAction(id, d);
      if (r.ok) toast.success(r.message ?? "Done");
      else toast.error(r.error);
    });

  const columns: ColumnDef<TransferRow, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader label="Officer" column={column} />,
      cell: ({ row: { original: t } }) => (
        <span className="flex items-center gap-1.5">
          <Badge tone="primary">{t.rank}</Badge>
          <span className="leading-tight">
            <span className="block font-medium">{t.name}</span>
            <span className="tabular block text-[11px] text-muted-foreground">
              Gen {t.genNo}
              {t.phone ? ` · ${t.phone}` : ""}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "move",
      header: "Transfer",
      cell: ({ row: { original: t } }) => (
        <span className="flex items-center gap-1.5 text-sm">
          {t.fromStation} <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" /> <span className="font-medium">{t.toStation}</span>
        </span>
      ),
    },
    { accessorKey: "reason", header: "Reason", cell: ({ getValue }) => <span className="line-clamp-2 max-w-72 text-xs">{(getValue() as string) ?? "—"}</span> },
    { accessorKey: "createdAt", header: ({ column }) => <SortHeader label="Raised" column={column} />, cell: ({ getValue }) => <span className="tabular text-xs">{fmt(getValue() as Date)}</span> },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row: { original: t } }) =>
        t.status === "pending" && canApprove ? (
          <span className="flex gap-1.5">
            <Button size="sm" variant="soft" disabled={pending} onClick={() => decide(t.id, "approved")}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(t.id, "rejected")}>
              <X /> Reject
            </Button>
          </span>
        ) : (
          <StatusPill status={t.status} />
        ),
    },
  ];

  return (
    <>
      <DataTable
        data={rows}
        columns={columns}
        storageKey="transfers"
        searchPlaceholder="Officer, Gen No, station…"
        searchText={(t) => `${t.name} ${t.genNo} ${t.fromStation} ${t.toStation}`}
        filters={[
          {
            id: "status",
            options: (["pending", "approved", "rejected"] as const).map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1), count: rows.filter((r) => r.status === s).length })),
            match: (t, v) => t.status === v,
          },
        ]}
        actions={
          canRequest && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus /> Request transfer
            </Button>
          )
        }
        emptyMessage="No transfer requests."
        mobileCard={(t) => (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">
                {t.rank} {t.name}
              </p>
              <StatusPill status={t.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t.fromStation} → {t.toStation}
            </p>
            {t.status === "pending" && canApprove && (
              <div className="flex gap-2">
                <Button size="sm" variant="soft" disabled={pending} onClick={() => decide(t.id, "approved")}>
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(t.id, "rejected")}>
                  <X /> Reject
                </Button>
              </div>
            )}
          </div>
        )}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Request transfer</SheetTitle>
            <SheetDescription>The Unit Officer approves it; the officer&apos;s station then changes everywhere.</SheetDescription>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-3.5">
            <div className="grid gap-1.5">
              <Label>Officer</Label>
              <PersonPicker value={person} onChange={setPerson} search={searchTransferablePersonsAction} placeholder="Name, Gen No or mobile…" />
              {errors.personId && <p className="text-xs text-destructive">{errors.personId}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to-station">Transfer to</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger id="to-station" aria-invalid={!!errors.toStationId}>
                  <SelectValue placeholder="Choose station" />
                </SelectTrigger>
                <SelectContent>
                  {stations
                    .filter((s) => s.label !== person?.station)
                    .map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.toStationId && <p className="text-xs text-destructive">{errors.toStationId}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-invalid={!!errors.reason} />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await requestTransferAction({ personId: person?.id ?? "", toStationId: to, reason });
                  if (!r.ok) {
                    setErrors(r.fieldErrors ?? {});
                    toast.error(r.error);
                    return;
                  }
                  toast.success(r.message ?? "Requested");
                  setOpen(false);
                  setPerson(null);
                  setTo("");
                  setReason("");
                  setErrors({});
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Send request
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
