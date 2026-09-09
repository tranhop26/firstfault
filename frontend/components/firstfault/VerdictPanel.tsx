import type { FirstFaultWorkflow } from "@/lib/contracts/FirstFault";

export function VerdictPanel({ workflow }: { workflow: FirstFaultWorkflow }) {
  return (
    <section className="ff-panel ff-verdict">
      <div className="ff-section-head"><div><span className="ff-eyebrow">GenLayer decision</span><h2>First-fault verdict</h2></div>{workflow.outcome && <span className="ff-trust-chip">Consensus result</span>}</div>
      {!workflow.verdict ? <div className="ff-empty"><span>⚖</span><strong>No verdict yet</strong><p>The buyer cannot choose the outcome. GenLayer evaluates the bound evidence after a dispute.</p></div> : (
        <div className="ff-verdict-body">
          <div className="ff-outcome"><small>OUTCOME</small><strong>{workflow.verdict.outcome}</strong><p>{workflow.verdict.outcome === "UNRESOLVED" ? "No transfer is scheduled; the hold stays protected." : workflow.verdict.first_breach_step >= 0 ? `Earliest material breach: step ${workflow.verdict.first_breach_step + 1}` : "All three steps complied."}</p></div>
          <div className="ff-verdict-steps">{workflow.verdict.step_statuses?.map((item) => <div key={item.step_index}><span>Step {item.step_index + 1}</span><strong>{item.status}</strong></div>)}</div>
          {workflow.verdict.reasons?.map((item) => <article className="ff-verdict-reason" key={item.step_index}><div><strong>Step {item.step_index + 1}</strong><span>{item.confidence}</span></div><p>{item.reason}</p></article>)}
          {workflow.verdict.cited_evidence_hashes && <p className="ff-citations">Evidence cited: {workflow.verdict.cited_evidence_hashes.length}</p>}
        </div>
      )}
      {workflow.rejection_reason && <div className="ff-rejection"><span>Buyer rejection</span><p>{workflow.rejection_reason}</p></div>}
    </section>
  );
}
