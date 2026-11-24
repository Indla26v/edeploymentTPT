import "server-only";

import { toLocalInput } from "@/lib/format";
import type { PlanDetail } from "@/lib/queries/plans";
import type { WizardInitial } from "./initiate-wizard";

export const EMPTY_PLAN: WizardInitial = {
  id: null,
  status: "draft",
  code: null,
  details: { title: "", eventType: "Festival", venue: "", description: "", lat: null, lng: null, proposalDueAt: "", windows: [{ label: "Day 1", date: "", start: "06:00", end: "22:00" }] },
  overall: null,
  components: [],
  schedule: [],
  imageUrl: null,
};

export function toWizard(d: PlanDetail): WizardInitial {
  const { plan } = d;
  return {
    id: plan.id,
    status: plan.status,
    code: plan.code,
    details: {
      title: plan.title,
      eventType: plan.eventType,
      venue: plan.venue ?? "",
      description: plan.description ?? "",
      lat: plan.lat,
      lng: plan.lng,
      proposalDueAt: toLocalInput(plan.proposalDueAt),
      windows: d.windows.length
        ? d.windows.map((w, i) => {
            const s = toLocalInput(w.startsAt);
            const e = toLocalInput(w.endsAt);
            return { label: w.label ?? `Day ${i + 1}`, date: s.slice(0, 10), start: s.slice(11), end: e.slice(11) };
          })
        : EMPTY_PLAN.details.windows,
    },
    overall: d.overall,
    components: d.components.map((c) => ({
      key: c.id,
      id: c.id,
      componentId: c.componentId,
      name: c.name,
      status: c.status,
      co: c.coPersonId ? { id: c.coPersonId, name: c.coName ?? "", rank: c.coRank ?? "", genNo: c.coGenNo ?? "", station: c.coStation ?? "", phone: c.coPhone } : null,
      incharge: c.inchargePersonId ? { id: c.inchargePersonId, name: c.inchargeName ?? "", rank: c.inchargeRank ?? "", genNo: c.inchargeGenNo ?? "", station: c.inchargeStation ?? "" } : null,
    })),
    schedule: d.schedule.map((s) => ({ key: s.id, kind: s.kind, rankId: s.rankId ?? "", at: toLocalInput(s.at), place: s.place })),
    imageUrl: plan.imageUrl,
  };
}
