import type { FirstFaultStep } from "@/lib/contracts/FirstFault";

export function EvidencePanel({ steps }: { steps: FirstFaultStep[] }) {
  const evidence = steps.filter((step) => step.evidence_hash);
  return (
    <section className="ff-panel">
      <div className="ff-section-head"><div><span className="ff-eyebrow">Evidence ledger</span><h2>Bound artifacts</h2></div><span>{evidence.length}/3 supplied</span></div>
      {evidence.length === 0 ? <div className="ff-empty"><span>◇</span><strong>No evidence submitted yet</strong><p>Evidence appears only after contract readback confirms its hash.</p></div> : (
        <div className="ff-evidence-list">{evidence.map((step) => (
          <article key={step.step_index}>
            <div><span className="ff-number">0{step.step_index + 1}</span><div><strong>{["Research", "Writing", "Publishing"][step.step_index]}</strong><p>{step.output_text}</p></div></div>
            <dl><dt>Evidence hash</dt><dd><code>{step.evidence_hash}</code></dd><dt>Source</dt><dd>{step.source_url ? <a href={step.source_url} target="_blank" rel="noreferrer">Open source ↗</a> : "Bound upstream artifact"}</dd>{step.source_content_hash && <><dt>Snapshot hash</dt><dd><code>{step.source_content_hash}</code></dd></>}</dl>
            {step.source_content && <details><summary>Source snapshot captured by validator consensus</summary><p>{step.source_content}</p></details>}
          </article>
        ))}</div>
      )}
    </section>
  );
}
