/**
 * Browser-side evidence previews for FirstFault.
 *
 * This module never authorizes a submission or supplies authoritative values.
 * The contract recomputes every hash and submission timestamp from its runtime.
 */

export const EVIDENCE_PREVIEW_LABEL =
  "Preview only — the FirstFault contract generates the authoritative evidence hash.";

export type EvidencePreviewInput = {
  chainId: bigint | number | string;
  contractAddress: string;
  workflowId: string;
  stepIndex: number;
  actor: string;
  briefHash: string;
  outputHash: string;
  upstreamHash: string;
  sourceUrl: string;
  observedAt: bigint | number | string;
  submissionTimestamp: bigint | number | string;
  deadline: bigint | number | string;
  nonce: string;
};

export type EvidencePreview = {
  label: typeof EVIDENCE_PREVIEW_LABEL;
  canonicalInput: string;
  evidenceHash: string;
};

const EVIDENCE_SCHEMA_VERSION = "firstfault-evidence-v1";

function decimal(value: bigint | number | string): string {
  return String(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Preview a UTF-8 SHA-256 digest; contract output remains authoritative. */
export async function sha256Preview(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Reproduce the positional canonical evidence domain for display before signing.
 * It intentionally requires a proposed submission timestamp because the contract
 * replaces that preview value with its own transaction timestamp on-chain.
 */
export function canonicalEvidencePreview(input: EvidencePreviewInput): string {
  return JSON.stringify([
    decimal(input.chainId),
    input.contractAddress,
    input.workflowId,
    decimal(input.stepIndex),
    input.actor,
    input.briefHash,
    input.outputHash,
    input.upstreamHash,
    input.sourceUrl,
    decimal(input.observedAt),
    decimal(input.submissionTimestamp),
    decimal(input.deadline),
    EVIDENCE_SCHEMA_VERSION,
    input.nonce,
  ]);
}

/** Return an explicitly non-authoritative preview for a pending submission. */
export async function previewEvidence(input: EvidencePreviewInput): Promise<EvidencePreview> {
  const canonicalInput = canonicalEvidencePreview(input);
  return {
    label: EVIDENCE_PREVIEW_LABEL,
    canonicalInput,
    evidenceHash: await sha256Preview(canonicalInput),
  };
}
