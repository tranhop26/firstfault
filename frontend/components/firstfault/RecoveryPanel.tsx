"use client";

import { useState } from "react";
import type { FirstFaultRecovery } from "@/lib/contracts/FirstFault";
import { formatGen, parseGen } from "../../lib/firstfault/amounts";

type Props = {
  workflowId: string; reserved: string; unresolvedReason?: string; canCure: boolean; canSettle: boolean; canExecute: boolean; recovery: FirstFaultRecovery | null;
  onSubmitCure: (evidence: string, sourceUrl: string) => void | Promise<unknown>;
  onPropose: (amounts: readonly [bigint, bigint, bigint, bigint]) => void | Promise<unknown>;
  onApprove: (version: bigint, hash: string) => void | Promise<unknown>;
  onExecute: () => void | Promise<unknown>;
};
export function RecoveryPanel({ workflowId, reserved, unresolvedReason, canCure, canSettle, canExecute, recovery, onSubmitCure, onPropose, onApprove, onExecute }: Props) {
  const [cure, setCure] = useState("");
  const [source, setSource] = useState("");
  const [amounts, setAmounts] = useState(["0", "0", "0", "0"]);
  const settlement = recovery?.settlement;
  const setAmount = (index: number, value: string) => setAmounts((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  let parsedAmounts: [bigint, bigint, bigint, bigint] | null = null;
  try {
    parsedAmounts = amounts.map(parseGen) as [bigint, bigint, bigint, bigint];
  } catch {
    parsedAmounts = null;
  }
  const allocationTotal = parsedAmounts?.reduce((total, amount) => total + amount, 0n);
  const allocationMatches = allocationTotal === BigInt(reserved) && Boolean(parsedAmounts?.every((amount) => amount >= 0n));
  return <section className="ff-panel ff-recovery" id="recovery">
    <div className="ff-section-head"><div><span className="ff-eyebrow">Contract recovery</span><h2>Resolve held value</h2></div><span className="ff-trust-chip">{workflowId}</span></div>
    <p>A cure adds source-bound evidence. A mutual settlement moves value only after every workflow role approves the exact proposal.</p>
    {recovery?.cures?.length ? <p>{recovery.cures.length} worker cure{recovery.cures.length === 1 ? "" : "s"} recorded for this workflow.</p> : null}
    <div className="ff-recovery-grid"><div><h3>Evidence cure</h3>
      {unresolvedReason === "WORKER_DEADLINE_EXPIRED" ? <p>A missed delivery has no complete evidence set to cure. Use unanimous allocation to release the held value.</p> : <>
      <textarea aria-label="Cure evidence" value={cure} onChange={(event) => setCure(event.target.value)} placeholder="Explain the correction without replacing the original evidence" />
      <input aria-label="Cure source URL" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://authoritative-source.example/..." />
      <button className="ff-button ff-button-primary ff-full" disabled={!canCure || !cure.trim() || !source.trim()} onClick={() => onSubmitCure(cure, source)}>Submit cure</button>
      </>}
    </div><div><h3>Unanimous allocation</h3>
      {['Research GEN', 'Writer GEN', 'Publisher GEN', 'Buyer refund GEN'].map((label, index) => <label key={label}>{label}<input aria-label={label} value={amounts[index]} onChange={(event) => setAmount(index, event.target.value)} /></label>)}
      <p>The four amounts must total {formatGen(reserved)} GEN held by the contract.</p>
      <button className="ff-button ff-button-outline ff-full" disabled={!canSettle || !parsedAmounts || !allocationMatches} onClick={() => parsedAmounts && onPropose(parsedAmounts)}>Propose exact allocation</button>
      {settlement?.proposal_hash && settlement.version && <div className="ff-proposal"><code title={settlement.proposal_hash}>{settlement.proposal_hash}</code><p>{Object.entries(settlement.approvals ?? {}).map(([role, approved]) => `${role}: ${approved ? 'approved' : 'pending'}`).join(' · ')}</p><button className="ff-button ff-button-outline" disabled={!canSettle} onClick={() => onApprove(BigInt(settlement.version!), settlement.proposal_hash!)}>Approve this version</button><button className="ff-button ff-button-primary" disabled={!canExecute || !Object.values(settlement.approvals ?? {}).every(Boolean)} onClick={onExecute}>Execute approved settlement</button></div>}
    </div></div>
  </section>;
}
