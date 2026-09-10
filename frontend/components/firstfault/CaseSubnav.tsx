type Props = {
  contractVersion: string;
  hasWorkflow: boolean;
  recoveryAvailable: boolean;
};

function SectionLink({ href, children, available = true, unavailableHint }: {
  href: string;
  children: string;
  available?: boolean;
  unavailableHint?: string;
}) {
  return available
    ? <a className="ff-subnav-item ff-subnav-link" href={href}>{children}</a>
    : <span className="ff-subnav-item ff-subnav-disabled" aria-disabled="true" title={unavailableHint ?? "Load a case where this section is available"}>{children}</span>;
}

export function CaseSubnav({ contractVersion, hasWorkflow, recoveryAvailable }: Props) {
  return (
    <div className="ff-subnav">
      <nav className="ff-shell" aria-label="Case sections">
        <SectionLink href={hasWorkflow ? "#workflow-desk" : "#how"}>Workflow desk</SectionLink>
        <SectionLink href="#evidence" available={hasWorkflow}>Evidence</SectionLink>
        <SectionLink href="#disputes" available={hasWorkflow}>Disputes</SectionLink>
        <SectionLink href="#recovery" available={recoveryAvailable} unavailableHint={hasWorkflow ? "Recovery is available when the case is UNRESOLVED" : undefined}>Recovery</SectionLink>
        <span className="ff-frozen" role="status" aria-label="Contract deployment status">
          {contractVersion === "v2" ? "Status: V2 recovery contract" : "Status: intentionally frozen"}
        </span>
      </nav>
    </div>
  );
}
