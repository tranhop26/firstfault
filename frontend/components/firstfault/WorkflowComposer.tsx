"use client";

import { useState } from "react";
import type { Address } from "viem";
import type { CreateWorkflowInput } from "@/lib/contracts/FirstFault";

export function WorkflowComposer({ disabled, onCreate }: { disabled: boolean; onCreate: (input: CreateWorkflowInput) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: "", orchestrator: "", researcher: "", writer: "", publisher: "", research: "", writing: "", publishing: "", researchAmount: "10", writerAmount: "10", publisherAmount: "10" });
  const set = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));
  const create = async () => {
    const now = Math.floor(Date.now() / 1000);
    await onCreate({ workflowId: form.id.trim(), orchestrator: form.orchestrator as Address, researcher: form.researcher as Address, writer: form.writer as Address, publisher: form.publisher as Address, researchBrief: form.research, writerBrief: form.writing, publisherBrief: form.publishing, amounts: [BigInt(form.researchAmount), BigInt(form.writerAmount), BigInt(form.publisherAmount)], deadlines: [BigInt(now + 3600), BigInt(now + 7200), BigInt(now + 10800)], nonce: `create-${Date.now()}-${crypto.randomUUID()}` });
    setOpen(false);
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
      </div>
      <div className="ff-modal-actions"><button className="ff-button ff-button-outline" onClick={() => setOpen(false)}>Cancel</button><button className="ff-button ff-button-primary" onClick={create}>Create on Studionet</button></div>
    </section></div>}
  </>;
}
