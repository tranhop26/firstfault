"use client";

import { useState } from "react";
import type { FirstFaultStep } from "@/lib/contracts/FirstFault";

const roleNames = ["Research agent", "Writer agent", "Publisher agent"];
const roleIcons = ["⌕", "✎", "↗"];

function short(value?: string) {
  if (!value) return "Not submitted";
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export function WorkflowTimeline({ steps, activeAddress, canAct, onSubmit }: {
  steps: FirstFaultStep[];
  activeAddress: string | null;
  canAct: boolean;
  onSubmit: (stepIndex: number, output: string, upstreamHash: string, sourceUrl: string) => void | Promise<unknown>;
}) {
  const [drafts, setDrafts] = useState<Record<number, { output: string; source: string }>>({});
  return (
    <section className="ff-panel ff-timeline-panel">
      <div className="ff-section-head">
        <div><span className="ff-eyebrow">Authoritative workflow</span><h2>Three bound delivery steps</h2></div>
        <span className="ff-trust-chip">Contract source of truth</span>
      </div>
      <div className="ff-timeline">
        {steps.map((step, index) => {
          const mine = Boolean(activeAddress && step.worker.toLowerCase() === activeAddress.toLowerCase());
          const previousHash = index === 0 ? "" : steps[index - 1]?.output_hash ?? "";
          const draft = drafts[step.step_index] ?? { output: "", source: "" };
          return (
            <article className="ff-step" key={step.step_index}>
              <div className="ff-step-rail"><span>{roleIcons[index]}</span>{index < steps.length - 1 && <i />}</div>
              <div className="ff-step-body">
                <div className="ff-step-title">
                  <div><small>STEP {index + 1}</small><h3>{roleNames[index]}</h3></div>
                  <span className={`ff-badge ff-badge-${step.state.toLowerCase().replaceAll("_", "-")}`}>{step.state}</span>
                </div>
                <p className="ff-brief">{step.brief}</p>
                <div className="ff-facts">
                  <div><span>Worker</span><code title={step.worker}>{short(step.worker)}</code></div>
                  <div><span>Held for step</span><strong>{step.amount} simulated GEN</strong></div>
                  <div><span>Deadline</span><strong>{new Date(Number(step.deadline) * 1000).toLocaleString()}</strong></div>
                  <div><span>Evidence</span><code title={step.evidence_hash}>{short(step.evidence_hash)}</code></div>
                  <div><span>Output</span><code title={step.output_hash}>{short(step.output_hash)}</code></div>
                  <div><span>Upstream</span><code title={step.upstream_hash}>{index === 0 ? "Genesis input" : short(step.upstream_hash)}</code></div>
                </div>
                {mine && !step.output_hash && (
                  <div className="ff-submit-box">
                    <textarea aria-label={`${roleNames[index]} output`} value={draft.output} onChange={(event) => setDrafts((current) => ({ ...current, [step.step_index]: { ...draft, output: event.target.value } }))} placeholder="Paste the agent output that will be bound on-chain" />
                    {index === 0 && <input aria-label="Research source URL" value={draft.source} onChange={(event) => setDrafts((current) => ({ ...current, [step.step_index]: { ...draft, source: event.target.value } }))} placeholder="Primary source URL" />}
                    <button className="ff-button ff-button-primary" disabled={!canAct || !draft.output.trim() || (index === 0 && !draft.source.trim())} onClick={() => onSubmit(step.step_index, draft.output, previousHash, draft.source)}>Submit {roleNames[index].replace(" agent", "")} output</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
