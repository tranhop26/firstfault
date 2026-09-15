"use client";

import { formatGen } from "@genlayer/transaction-kit-react";
import type { FirstFaultFeeQuote } from "../../lib/contracts/FirstFault";

export function FeeApprovalDialog({ quote, onApprove, onCancel }: {
  quote: FirstFaultFeeQuote | null;
  onApprove: () => void;
  onCancel: () => void;
}) {
  if (!quote) return null;
  return (
    <div className="ff-modal-backdrop" role="presentation">
      <section className="ff-modal ff-fee-modal" role="dialog" aria-modal="true" aria-labelledby="fee-title">
        <span className="ff-eyebrow">Studio Next fee review</span>
        <h2 id="fee-title">Approve {quote.functionName.replaceAll("_", " ")}</h2>
        <p>Review the refundable network deposit before the wallet asks you to sign.</p>
        <p className="ff-fee-binding">Chain {quote.chainId} · Wallet {quote.accountAddress.slice(0, 6)}…{quote.accountAddress.slice(-4)} · Contract {quote.contractAddress.slice(0, 6)}…{quote.contractAddress.slice(-4)}</p>
        <div className="ff-fee-total">
          <span>Maximum fee deposit</span>
          <strong>{formatGen(quote.feeDeposit)} GEN</strong>
          <small>Unused fee is refunded after finalization. This amount is not the fee consumed.</small>
        </div>
        <dl className="ff-fee-breakdown">
          <div><dt>Leader allocation</dt><dd>{quote.distribution.leaderTimeunitsAllocation.toString()} time units</dd></div>
          <div><dt>Validator allocation</dt><dd>{quote.distribution.validatorTimeunitsAllocation.toString()} time units</dd></div>
          <div><dt>Execution budget</dt><dd>{quote.distribution.executionBudgetPerRound.toString()} gas units / round</dd></div>
          <div><dt>Message budget</dt><dd>{quote.distribution.totalMessageFees.toString()} wei</dd></div>
        </dl>
        {quote.userValue > 0n && <p className="ff-fee-value">Contract value sent: <strong>{formatGen(quote.userValue)} simulated GEN</strong>.</p>}
        <div className="ff-modal-actions">
          <button className="ff-button ff-button-outline" onClick={onCancel}>Cancel</button>
          <button className="ff-button ff-button-primary" onClick={onApprove}>Continue to wallet</button>
        </div>
      </section>
    </div>
  );
}
