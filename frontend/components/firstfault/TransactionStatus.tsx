import type { ProjectedStatus } from "@/lib/firstfault/status";

const explorer = "https://genlayer-explorer.vercel.app/transactions";

export function TransactionStatus({ status, parentHash, childHashes }: { status: ProjectedStatus; parentHash: string | null; childHashes: string[] }) {
  const tone = status.phase === "ERROR" ? "danger" : status.phase === "SUCCESS" ? "success" : status.phase === "UNRESOLVED" ? "warning" : "info";
  return (
    <section className={`ff-status ff-status-${tone}`} aria-live="polite">
      <div className="ff-status-icon" aria-hidden="true">{status.phase === "SUCCESS" ? "✓" : status.phase === "ERROR" ? "!" : status.phase === "UNRESOLVED" ? "?" : "◎"}</div>
      <div className="min-w-0 flex-1">
        <strong>{status.label}</strong>
        <p>{status.detail}</p>
        {parentHash && <a href={`${explorer}/${parentHash}`} target="_blank" rel="noreferrer">Parent transaction ↗</a>}
        {childHashes.length > 0 && (
          <div className="ff-tx-links">{childHashes.map((hash, index) => <a key={hash} href={`${explorer}/${hash}`} target="_blank" rel="noreferrer">Transfer {index + 1} ↗</a>)}</div>
        )}
      </div>
    </section>
  );
}
