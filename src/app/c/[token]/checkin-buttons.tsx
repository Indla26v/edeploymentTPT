"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LogIn, LogOut, MapPinOff, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

function locate(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 });
  });
}

export function CheckinButtons({ token, checkedIn }: { token: string; checkedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = React.useState<{ kind: "idle" | "working" | "done" | "error"; text?: string; warn?: string }>({ kind: "idle" });
  const send = async (event: "check_in" | "check_out") => {
    setState({ kind: "working", text: "Getting your location…" });
    const pos = await locate();
    setState({ kind: "working", text: "Recording…" });
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, event, lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null }),
    });
    const r = (await res.json().catch(() => ({ ok: false, error: "Network error" }))) as { ok: boolean; error?: string; flagged?: boolean; distanceM?: number | null };
    if (!r.ok) return setState({ kind: "error", text: r.error ?? "Could not record." });
    setState({
      kind: "done",
      text: event === "check_in" ? "Checked in. Report to your posting." : "Checked out. Thank you.",
      warn: !pos ? "Location was not shared — your supervisor may verify." : r.flagged ? `You are ${r.distanceM} m from your point. Your supervisor has been flagged.` : undefined,
    });
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="h-14 text-base" disabled={state.kind === "working"} onClick={() => send(checkedIn ? "check_out" : "check_in")} variant={checkedIn ? "outline" : "default"}>
        {state.kind === "working" ? <Loader2 className="animate-spin" /> : checkedIn ? <LogOut /> : <LogIn />} {checkedIn ? "Check out" : "Check in"}
      </Button>
      {state.text && state.kind !== "idle" && (
        <p className={`flex items-center gap-2 rounded-2xl p-3 text-sm ${state.kind === "error" ? "bg-danger-soft text-danger-soft-foreground" : state.kind === "done" ? "bg-success-soft text-success-soft-foreground" : "bg-muted"}`}>
          {state.kind === "done" ? <CheckCircle2 className="size-4 shrink-0" /> : state.kind === "error" ? <TriangleAlert className="size-4 shrink-0" /> : <Loader2 className="size-4 shrink-0 animate-spin" />} {state.text}
        </p>
      )}
      {state.warn && (
        <p className="flex items-center gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <MapPinOff className="size-4 shrink-0" /> {state.warn}
        </p>
      )}
    </div>
  );
}
