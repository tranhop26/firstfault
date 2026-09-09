"use client";

import type { FirstFaultFundingIntent, FirstFaultFundingOutcome } from "@/lib/contracts/FirstFault";
import { formatGen } from "../../lib/firstfault/amounts";

export type FundingPhase =
  | "READY"
  | "PREPARING_FUNDING"
  | "INTENT_READY"
  | "FUNDING_PENDING"
  | "FUNDING_FINALIZED"
  | "REFUND_PENDING"
  | "REFUND_FINALIZED"
  | "SUCCESS";

type FundingPanelProps = {
  amount: string;
  intent: FirstFaultFundingIntent | null;
  outcome: FirstFaultFundingOutcome | null;
  phase: FundingPhase;
  disabled: boolean;
  onPrepare: () => unknown;
  onFund: () => unknown;
};

export function FundingPanel({ amount, intent, outcome, phase, disabled, onPrepare, onFund }: FundingPanelProps) {
  const ready = Boolean(intent && !intent.consumed && intent.expected_amount === amount);
  const busy = phase === "PREPARING_FUNDING" || phase === "FUNDING_PENDING";

  return (
    <section className="ff-panel ff-funding-panel">
      <span className="ff-eyebrow">Two-phase custody</span>
      <h2>Prepare exact funding</h2>
      <p>The contract binds the buyer, workflow, amount and expiry before the wallet sends value.</p>
      {!intent && (
        <button className="ff-button ff-button-outline ff-full" disabled={disabled || busy} onClick={onPrepare}>
          {phase === "PREPARING_FUNDING" ? "Preparing…" : "Prepare exact funding"}
        </button>
      )}
      {intent && (
        <div className="ff-intent-readback">
          <strong>{intent.intent_id}</strong>
          <span>Version {intent.version} · chain {intent.chain_id}</span>
          <span>Bound amount: {formatGen(intent.expected_amount)} simulated GEN</span>
          <span>Expires: {new Date(Number(intent.expires_at) * 1000).toLocaleString()}</span>
        </div>
      )}
      <button className="ff-button ff-button-primary ff-full" disabled={disabled || busy || !ready} onClick={onFund}>
        {phase === "FUNDING_PENDING" ? "Funding…" : `Fund ${formatGen(amount)} simulated GEN`}
      </button>
      {outcome?.result === "FUNDED" && <p className="ff-funding-success">Funding confirmed by contract readback.</p>}
      {outcome?.result === "REFUND_SCHEDULED" && (
        <div className="ff-funding-refund" role="status">
          <strong>{phase === "REFUND_FINALIZED" ? "Full refund finalized" : "Full refund pending"}</strong>
          <span>{outcome.reason.replaceAll("_", " ")}</span>
          <span>
            {formatGen(outcome.refund_scheduled)} simulated GEN {phase === "REFUND_FINALIZED"
              ? "credited to the original sender."
              : "scheduled to the original sender."}
          </span>
        </div>
      )}
    </section>
  );
}
