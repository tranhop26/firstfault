export function AgentTankBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`agent-tank-badge${compact ? " agent-tank-badge-compact" : ""}`} aria-label="Built for GenLayer Agent Tank 2026">
      <span className="agent-tank-mark" aria-hidden="true"><i>G</i><i>L</i></span>
      <span className="agent-tank-copy">
        {!compact && <small>Built for GenLayer</small>}
        <strong>AGENT TANK 2026</strong>
      </span>
    </span>
  );
}

export function AgentTankEntryLabel() {
  return <span className="agent-tank-entry-label">Agent Tank Hackathon Entry</span>;
}
