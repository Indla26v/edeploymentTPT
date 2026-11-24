"use client";

import * as React from "react";
import { Ban, CheckCircle2, Clock, Loader2, Lock, Minus, Plus, Search, Send, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { StationRequestData } from "@/lib/queries/sourcing";
import { cn } from "@/lib/utils";
import { respondAction, saveRollAction } from "../actions";

const REASONS = ["Men on other bandobast", "On leave / training", "Station law & order duty", "Court / VIP duty", "Other"];

function ageOf(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
}

export function RespondForm({ data }: { data: StationRequestData }) {
  const { request: r } = data;
  const canReply = r.status === "sent";
  const [counts, setCounts] = React.useState<Record<string, number>>(() => Object.fromEntries(r.lines.map((l) => [l.rankId, l.committed ?? l.requested])));
  const [reasons, setReasons] = React.useState<Record<string, string>>(() => Object.fromEntries(r.lines.map((l) => [l.rankId, l.reason ?? ""])));
  const [pending, start] = React.useTransition();

  const reply = () =>
    start(async () => {
      const res = await respondAction(r.id, { lines: r.lines.map((l) => ({ rankId: l.rankId, committed: counts[l.rankId] ?? 0, reason: (counts[l.rankId] ?? 0) < l.requested ? reasons[l.rankId] || null : null })), shortReason: null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.data.status === "committed" ? "Full strength committed" : res.data.status === "declined" ? "Reply sent: none available" : "Reply sent — the UO settles the rest");
    });

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{canReply ? "1. How many can you give?" : "Your reply"}</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {canReply ? `Reply by ${fmtDateTime(r.deadlineAt)} (${fmtRelative(r.deadlineAt)}). No reply = full strength assumed.` : r.status === "auto_accepted" ? "Deadline passed — full strength was assumed." : `Replied ${r.respondedAt ? fmtDateTime(r.respondedAt) : ""}`}
            </CardDescription>
          </div>
          {!canReply && <StatusPill status={r.status === "partial" ? "short" : r.status === "committed" ? "accepted" : r.status === "auto_accepted" ? "auto_accepted" : "declined"} label={r.status === "partial" ? "Short" : r.status === "committed" ? "Full" : undefined} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {r.note && <p className="rounded-xl bg-muted px-3 py-2 text-sm">“{r.note}”</p>}
          {r.lines.map((l) => {
            const v = counts[l.rankId] ?? 0;
            const short = v < l.requested;
            return (
              <div key={l.rankId} className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2.5">
                  <Badge tone="solid" className="min-w-12 justify-center py-1">
                    {l.rank}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Asked for <span className="tabular font-semibold text-foreground">{l.requested}</span>
                  </span>
                </div>
                {canReply ? (
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" aria-label={`Fewer ${l.rank}`} disabled={v <= 0} onClick={() => setCounts((c) => ({ ...c, [l.rankId]: v - 1 }))}>
                      <Minus />
                    </Button>
                    <input
                      inputMode="numeric"
                      aria-label={`${l.rank} you can give`}
                      value={v}
                      onChange={(e) => setCounts((c) => ({ ...c, [l.rankId]: Math.min(l.requested, Number(e.target.value.replace(/\D/g, "")) || 0) }))}
                      className="tabular h-11 w-16 rounded-xl border border-input bg-card text-center text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                    />
                    <Button size="icon" variant="outline" aria-label={`More ${l.rank}`} disabled={v >= l.requested} onClick={() => setCounts((c) => ({ ...c, [l.rankId]: v + 1 }))}>
                      <Plus />
                    </Button>
                  </div>
                ) : (
                  <span className="tabular text-lg font-semibold">
                    {l.committed ?? l.requested}
                    <span className="text-sm font-normal text-muted-foreground"> committed</span>
                  </span>
                )}
                {canReply && short && (
                  <Select value={reasons[l.rankId] || ""} onValueChange={(x) => setReasons((c) => ({ ...c, [l.rankId]: x }))}>
                    <SelectTrigger className="sm:w-56" aria-label={`Why fewer ${l.rank}`} aria-invalid={!reasons[l.rankId]}>
                      <SelectValue placeholder="Why fewer?" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!canReply && l.reason && <span className="text-xs text-muted-foreground">{l.reason}</span>}
              </div>
            );
          })}
          {canReply && (
            <Button size="lg" className="mt-1 h-12 sm:self-end" disabled={pending || r.lines.some((l) => (counts[l.rankId] ?? 0) < l.requested && !reasons[l.rankId])} onClick={reply}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />} Send reply
            </Button>
          )}
        </CardContent>
      </Card>
      {!canReply && r.status !== "declined" && r.status !== "cancelled" && <Roll data={data} />}
    </div>
  );
}

function Roll({ data }: { data: StationRequestData }) {
  const { request: r, candidates } = data;
  const editable = ["sourcing", "placement"].includes(data.plan.status);
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set([...data.roll, ...candidates.filter((c) => c.preferred).map((c) => c.id)]));
  const [q, setQ] = React.useState("");
  const [pending, start] = React.useTransition();
  const limit = (rankId: string) => r.lines.find((l) => l.rankId === rankId)?.committed ?? 0;
  const count = (rankId: string) => candidates.filter((c) => c.rankId === rankId && picked.has(c.id)).length;
  const toggle = (id: string, rankId: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (count(rankId) < limit(rankId)) n.add(id);
      else toast.info(`You committed ${limit(rankId)} — untick someone first.`);
      return n;
    });
  // Quick fill: eligible officers, fit before light duty, in list order.
  const fill = (rankId: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      const free = candidates
        .filter((c) => c.rankId === rankId && !n.has(c.id) && c.availability === "available" && !c.bookedElsewhere && (!c.inThisPlan || c.inThisPlan === r.id))
        .sort((a, b) => Number(a.fitness === "light_duty_only") - Number(b.fitness === "light_duty_only"));
      let room = limit(rankId) - candidates.filter((c) => c.rankId === rankId && n.has(c.id)).length;
      for (const c of free) {
        if (room <= 0) break;
        n.add(c.id);
        room--;
      }
      return n;
    });
  const named = picked.size;
  const committed = r.lines.reduce((a, l) => a + (l.committed ?? 0), 0);
  const term = q.trim().toLowerCase();

  return (
    <Card className="pb-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>2. Name your officers</CardTitle>
          <CardDescription>{editable ? "You can change names until the duty allocation is published." : "Published — names are final."}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {r.lines.map((l) => (
            <Badge key={l.rankId} tone={count(l.rankId) === (l.committed ?? 0) ? "success" : "warning"} className="tabular h-7 px-3">
              {l.rank} {count(l.rankId)}/{l.committed ?? 0}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <label className="relative">
          <span className="sr-only">Search officers</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Gen No or mobile…" className="h-11 w-full rounded-full border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
        </label>
        {r.lines.map((l) => (
          <div key={l.rankId}>
            <div className="flex items-center justify-between px-1 pt-2 pb-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{l.rank}</p>
              {editable && count(l.rankId) < (l.committed ?? 0) && (
                <Button size="sm" variant="ghost" className="h-7" onClick={() => fill(l.rankId)}>
                  <Wand2 /> Fill {(l.committed ?? 0) - count(l.rankId)}
                </Button>
              )}
            </div>
            <ul className="divide-y rounded-2xl border">
              {candidates
                .filter((c) => c.rankId === l.rankId)
                .filter((c) => !term || c.name.toLowerCase().includes(term) || c.genNo.toLowerCase().startsWith(term) || (c.phone ?? "").includes(term))
                .map((c) => {
                  const on = picked.has(c.id);
                  const blocked = c.availability !== "available" ? c.availability.replace("_", " ") : c.bookedElsewhere ? `On “${c.bookedElsewhere}”` : c.inThisPlan && c.inThisPlan !== r.id ? "Named by another request" : null;
                  const locked = c.preferred;
                  return (
                    <li key={c.id}>
                      <label className={cn("flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2", (blocked || !editable) && "cursor-not-allowed opacity-60", on && "bg-accent/50")}>
                        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={on} disabled={!!blocked || locked || !editable} onChange={() => toggle(c.id, c.rankId)} aria-label={c.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="tabular block text-xs text-muted-foreground">
                            #{c.genNo} · {ageOf(c.dob)} yrs · {c.gender === "female" ? "F" : "M"}
                            {c.fitness === "light_duty_only" ? " · light duty" : ""}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </span>
                        </span>
                        {locked && (
                          <Badge tone="primary" className="shrink-0">
                            <Lock className="size-3" /> Asked by name
                          </Badge>
                        )}
                        {blocked && (
                          <Badge tone="neutral" className="max-w-40 shrink-0 truncate capitalize">
                            <Ban className="size-3" /> {blocked}
                          </Badge>
                        )}
                      </label>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </CardContent>
      {editable && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-b-2xl border-t bg-card/95 px-4 py-3 backdrop-blur-md">
          <span className="flex items-center gap-1.5 text-sm">
            {named === committed ? <CheckCircle2 className="size-4 text-success" /> : <Users className="size-4 text-muted-foreground" />}
            <span className="tabular font-semibold">{named}</span> of {committed} named
          </span>
          <Button
            size="lg"
            className="h-11"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveRollAction(r.id, [...picked]);
                if (res.ok) toast.success(`Nominal roll sent (${res.data.named})`);
                else toast.error(res.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Send />} {data.roll.length ? "Update roll" : "Send nominal roll"}
          </Button>
        </div>
      )}
    </Card>
  );
}
