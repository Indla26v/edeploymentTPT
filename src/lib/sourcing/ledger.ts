/**
 * Reconciliation ledger — the core of the "no re-application" fix.
 *
 * For each rank on a plan we track:
 *   required   = slots the Component Officers need (minus slots they explicitly dropped)
 *   requested  = what the Unit Officer has asked stations for (initial + top-up rounds)
 *   committed  = what stations have promised (accepted/partial/auto-accepted responses)
 *   named      = officers actually named on nominal rolls
 *   accepted   = shortfall the Unit Officer has accepted ("proceed with given strength")
 *
 *   gap        = required - committed - accepted   (never negative)
 *
 * A rank is "settled" when gap === 0. The plan never goes back to the IO/COs to change
 * `required`; the UO either tops up (raises `committed`) or accepts the shortfall.
 */

export type RankLedgerInput = {
  rankCode: string;
  required: number;
  requested: number;
  committed: number;
  named: number;
  acceptedShortfall: number;
  /** Outstanding (not yet answered) top-up requests for this rank. */
  pendingTopUp?: number;
};

export type RankLedgerRow = RankLedgerInput & {
  gap: number;
  surplus: number;
  /** committed / required, 0..1 (1 when required is 0) */
  fillRatio: number;
  state: "settled" | "short" | "awaiting_topup" | "over";
};

export function computeLedgerRow(input: RankLedgerInput): RankLedgerRow {
  const required = Math.max(0, input.required);
  const committed = Math.max(0, input.committed);
  const accepted = Math.max(0, input.acceptedShortfall);
  const gap = Math.max(0, required - committed - accepted);
  const surplus = Math.max(0, committed - required);
  const fillRatio = required === 0 ? 1 : Math.min(1, committed / required);
  const pendingTopUp = input.pendingTopUp ?? 0;

  let state: RankLedgerRow["state"] = "settled";
  if (surplus > 0) state = "over";
  else if (gap > 0 && pendingTopUp > 0) state = "awaiting_topup";
  else if (gap > 0) state = "short";

  return { ...input, required, committed, acceptedShortfall: accepted, gap, surplus, fillRatio, state };
}

export type LedgerTotals = {
  required: number;
  committed: number;
  named: number;
  acceptedShortfall: number;
  gap: number;
  settled: boolean;
};

export function ledgerTotals(rows: RankLedgerRow[]): LedgerTotals {
  const t = rows.reduce(
    (acc, r) => ({
      required: acc.required + r.required,
      committed: acc.committed + Math.min(r.committed, r.required),
      named: acc.named + r.named,
      acceptedShortfall: acc.acceptedShortfall + r.acceptedShortfall,
      gap: acc.gap + r.gap,
    }),
    { required: 0, committed: 0, named: 0, acceptedShortfall: 0, gap: 0 },
  );
  return { ...t, settled: t.gap === 0 };
}

/** Accepting a shortfall can never exceed the current gap. Returns the amount actually accepted. */
export function clampShortfallAcceptance(row: RankLedgerRow, requested: number): number {
  if (!Number.isInteger(requested) || requested <= 0) return 0;
  return Math.min(requested, row.gap);
}
