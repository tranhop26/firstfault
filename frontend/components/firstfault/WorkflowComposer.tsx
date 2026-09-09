"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import type { CreateWorkflowInput } from "@/lib/contracts/FirstFault";
import type { ProjectedStatus } from "@/lib/firstfault/status";
import { TransactionStatus } from "./TransactionStatus";
import { parseGen } from "../../lib/firstfault/amounts";

type WorkflowComposerProps = {
  disabled: boolean;
  onCreate: (input: CreateWorkflowInput) => Promise<unknown>;
  status: ProjectedStatus;
  parentHash: string | null;
  childHashes: string[];
};

export function WorkflowComposer({ disabled, onCreate, status, parentHash, childHashes }: WorkflowComposerProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", orchestrator: "", researcher: "", writer: "", publisher: "", research: "", writing: "", publishing: "", researchAmount: "10", writerAmount: "10", publisherAmount: "10", researchHours: "1", writerHours: "2", publisherHours: "3" });
  const [formError, setFormError] = useState<string | null>(null);
  const set = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));
  const create = async () => {
    const now = Math.floor(Date.now() / 1000);
    let submittedToContract = false;
    try {
      setFormError(null);
      if (!form.id.trim() || !form.research.trim() || !form.writing.trim() || !form.publishing.trim()) throw new Error("Workflow ID and all three briefs are required.");
      if (![form.orchestrator, form.researcher, form.writer, form.publisher].every((address) => isAddress(address))) throw new Error("Enter four valid GenLayer addresses.");
      const amounts = [parseGen(form.researchAmount), parseGen(form.writerAmount), parseGen(form.publisherAmount)] as [bigint, bigint, bigint];
      if (amounts.some((amount) => amount <= 0n)) throw new Error("Every milestone hold must be greater than zero.");
      const hours = [form.researchHours, form.writerHours, form.publisherHours].map(Number);
      if (hours.some((value) => !Number.isFinite(value) || value <= 0) || !(hours[0] < hours[1] && hours[1] < hours[2])) throw new Error("Deadlines must be positive and strictly increase.");
      const deadlines = hours.map((value) => BigInt(now + Math.round(value * 3600))) as [bigint, bigint, bigint];
      submittedToContract = true;
      await onCreate({ workflowId: form.id.trim(), orchestrator: form.orchestrator as Address, researcher: form.researcher as Address, writer: form.writer as Address, publisher: form.publisher as Address, researchBrief: form.research, writerBrief: form.writing, publisherBrief: form.publishing, amounts, deadlines, nonce: `create-${Date.now()}-${crypto.randomUUID()}` });
      setOpen(false);
    } catch (cause) {
      if (!submittedToContract) setFormError(cause instanceof Error ? cause.message : "Workflow terms are invalid.");
    }
  };
  return <>
    <button className="ff-button ff-button-light" disabled={disabled} onClick={() => setOpen(true)}>＋ Create workflow</button>
    {open && <div className="ff-modal-backdrop" role="presentation"><section className="ff-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
      <button className="ff-modal-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      <span className="ff-eyebrow">New immutable agreement</span><h2 id="create-title">Create a three-agent workflow</h2><p>Briefs, workers, deadlines and holds become authoritative contract state.</p>
      <div className="ff-form-grid">
        <label>Workflow ID<input value={form.id} onChange={(e) => set("id", e.target.value)} /></label>
        <label>Orchestrator address<input value={form.orchestrator} onChange={(e) => set("orchestrator", e.target.value)} /></label>
        {(["researcher", "writer", "publisher"] as const).map((name) => <label key={name}>{name[0].toUpperCase() + name.slice(1)} address<input value={form[name]} onChange={(e) => set(name, e.target.value)} /></label>)}
        {(["research", "writing", "publishing"] as const).map((name) => <label className="ff-form-wide" key={name}>{name[0].toUpperCase() + name.slice(1)} brief<textarea value={form[name]} onChange={(e) => set(name, e.target.value)} /></label>)}
        {(["researchAmount", "writerAmount", "publisherAmount"] as const).map((name) => <label key={name}>{name.replace("Amount", " hold")}<input type="number" min="1" value={form[name]} onChange={(e) => set(name, e.target.value)} /></label>)}
        {([['researchHours','Research deadline hours'],['writerHours','Writer deadline hours'],['publisherHours','Publisher deadline hours']] as const).map(([name,label]) => <label key={name}>{label}<input aria-label={label} type="number" min="0.25" step="0.25" value={form[name]} onChange={(e) => set(name, e.target.value)} /></label>)}
        <p className="ff-form-wide">Deadlines are measured from the time you sign. V2 gives the buyer 24 hours to review after the Publisher submission.</p>
      </div>
      {formError && <p className="ff-config-error" role="alert">{formError}</p>}
      {status.phase !== "READY" && <TransactionStatus status={status} parentHash={parentHash} childHashes={childHashes} />}
      <div className="ff-modal-actions"><button className="ff-button ff-button-outline" onClick={() => setOpen(false)}>Cancel</button><button className="ff-button ff-button-primary" disabled={disabled} onClick={create}>Create on Studionet</button></div>
    </section></div>}
  </>;
}
