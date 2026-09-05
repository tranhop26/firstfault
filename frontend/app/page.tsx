"use client";

import { useState } from "react";
import { AgentTankBadge, AgentTankEntryLabel } from "@/components/AgentTankBadge";
import { WorkflowComposer } from "@/components/firstfault/WorkflowComposer";
import { WorkflowTimeline } from "@/components/firstfault/WorkflowTimeline";
import { EvidencePanel } from "@/components/firstfault/EvidencePanel";
import { VerdictPanel } from "@/components/firstfault/VerdictPanel";
import { TransactionStatus } from "@/components/firstfault/TransactionStatus";
import { canWrite } from "@/lib/firstfault/status";
import { useFirstFault } from "@/lib/hooks/useFirstFault";
import type { CreateWorkflowInput } from "@/lib/contracts/FirstFault";

function short(value: string) { return value.length > 15 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value; }

export default function HomePage() {
  const [workflowId, setWorkflowId] = useState("");
  const [search, setSearch] = useState("");
  const [rejection, setRejection] = useState("");
  const app = useFirstFault(workflowId);
  const writable = canWrite({ connected: app.wallet.isConnected, correctNetwork: app.wallet.isOnCorrectNetwork, configured: app.configured }) && !app.actionPending;
  const isBuyer = Boolean(app.workflow && app.wallet.address?.toLowerCase() === app.workflow.buyer.toLowerCase());
  const isOrchestrator = Boolean(app.workflow && app.wallet.address?.toLowerCase() === app.workflow.orchestrator.toLowerCase());
  const total = app.steps.reduce((sum, step) => sum + BigInt(step.amount), 0n);

  const create = async (input: CreateWorkflowInput) => {
    await app.create(input);
    setSearch(input.workflowId);
    setWorkflowId(input.workflowId);
  };

  return (
    <div className="ff-app">
      <header className="ff-header">
        <div className="ff-topbar"><div className="ff-shell"><span>FirstFault for agentic commerce</span><nav><a href="#how">How it works</a><a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">GenLayer docs</a><span className="ff-network-dot">Studionet</span></nav></div></div>
        <div className="ff-mainbar"><div className="ff-shell ff-mainbar-inner">
          <div className="ff-brand-cluster"><a className="ff-logo" href="#"><span className="ff-logo-mark">F</span><span>FirstFault<small>verifiable agent settlement</small></span></a><AgentTankBadge /></div>
          <form className="ff-search" onSubmit={(event) => { event.preventDefault(); setWorkflowId(search.trim()); }}><input aria-label="Workflow ID" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by exact workflow ID" /><button>Inspect case</button></form>
          <div className="ff-wallet">
            {app.wallet.isConnected ? <><span title={app.wallet.address ?? ""}>{short(app.wallet.address ?? "")}</span><button onClick={app.wallet.disconnectWallet}>Disconnect</button></> : <button className="ff-connect" onClick={() => app.wallet.connectWallet()}>Connect wallet</button>}
          </div>
        </div></div>
        <div className="ff-subnav"><div className="ff-shell"><span>Workflow desk</span><span>Evidence</span><span>Disputes</span><span>Recovery</span><span className="ff-frozen">Intentionally frozen contract</span></div></div>
      </header>

      <main>
        <section className="ff-hero"><div className="ff-shell ff-hero-grid"><div>
          <AgentTankEntryLabel />
          <span className="ff-kicker">FIRST MATERIAL BREACH, SETTLED BY CONTRACT</span>
          <h1>When agent work breaks,<br /><em>find where trust broke first.</em></h1>
          <p>Bind three paid agent steps, preserve their evidence, and let GenLayer decide the earliest material breach. Compliant holds move; disputed value stays protected.</p>
          <div className="ff-hero-actions"><WorkflowComposer disabled={!writable} onCreate={create} status={app.status} parentHash={app.parentHash} childHashes={app.childHashes} /><button className="ff-button ff-button-ghost" onClick={() => document.getElementById("how")?.scrollIntoView()}>See the decision flow ↓</button></div>
          <p className="ff-simulated-note">All GEN shown here is simulated Studionet value.</p>
        </div><div className="ff-hero-art" aria-hidden="true"><div className="ff-orbit one"/><div className="ff-orbit two"/><div className="ff-agent a">R</div><div className="ff-agent b">W</div><div className="ff-agent c">P</div><div className="ff-shield">✓<span>BOUND<br/>EVIDENCE</span></div></div></div></section>

        <section className="ff-state-strip"><div className="ff-shell ff-state-grid">
          {[['01','DRAFT','Terms bound'],['02','IN PROGRESS','Agents deliver'],['03','IN REVIEW','Buyer responds'],['04','DISPUTED','GenLayer decides'],['05','UNRESOLVED','Funds remain held']].map(([number,title,caption]) => <div key={number}><span>{number}</span><div><strong>{title}</strong><small>{caption}</small></div></div>)}
        </div></section>

        <div className="ff-shell ff-content">
          {!app.configured && <section className="ff-config-error"><strong>Deployment address required</strong><p>Set <code>NEXT_PUBLIC_CONTRACT_ADDRESS</code> to the real Studionet deployment. FirstFault will not substitute a fake contract.</p></section>}

          {!workflowId && <>
            <section className="ff-intro" id="how"><div className="ff-section-head"><div><span className="ff-eyebrow">One narrow, complete workflow</span><h2>From immutable brief to defensible settlement</h2></div></div>
              <div className="ff-feature-grid">{[
                ["01","Lock the deal","Buyer binds three workers, briefs, deadlines and per-step holds."],
                ["02","Bind the chain","Every output commits to its own brief and the exact upstream artifact."],
                ["03","Judge the break","GenLayer identifies the earliest material breach or returns UNRESOLVED."],
                ["04","Schedule value","The contract—not the model or frontend—selects stored recipients and amounts."],
              ].map(([n,title,text]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
            </section>
            <section className="ff-proof-band"><div><span>NO ADMIN VERDICT</span><strong>The deployer cannot rewrite the outcome.</strong></div><div><span>NO FAVORABLE DEFAULT</span><strong>Missing evidence keeps disputed holds reserved.</strong></div><div><span>NO FRONTEND FICTION</span><strong>Refresh reconstructs every state from the contract.</strong></div></section>
          </>}

          {workflowId && app.loading && <section className="ff-loading"><div/><div/><div/><p>Reading contract state from Studionet…</p></section>}
          {workflowId && app.readError && !app.loading && <section className="ff-not-found"><span>⌕</span><h2>Workflow could not be read</h2><p>{app.readError}</p><button className="ff-button ff-button-primary" onClick={() => app.refresh()}>Try readback again</button></section>}

          {app.workflow && !app.loading && <>
            <section className="ff-case-head">
              <div><span className="ff-eyebrow">CASE / {app.workflow.workflow_id}</span><h2>{app.workflow.state.replaceAll("_", " ")}</h2><p>Created by <code>{short(app.workflow.buyer)}</code> · orchestrated by <code>{short(app.workflow.orchestrator)}</code></p></div>
              <div className="ff-case-badges"><span>✓ On-chain readback</span><span>◇ Evidence bound</span></div>
            </section>
            <section className="ff-accounting">
              {[['Deposited',app.workflow.deposited],['Reserved',app.workflow.reserved],['Payout scheduled',app.workflow.payout_scheduled],['Refund scheduled',app.workflow.refund_scheduled]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>simulated GEN</small></div>)}
            </section>
            <div className="ff-workspace">
              <div className="ff-main-column"><WorkflowTimeline steps={app.steps} activeAddress={app.wallet.address} canAct={writable} onSubmit={(...args) => app.submitStep(...args)} /><EvidencePanel steps={app.steps}/><VerdictPanel workflow={app.workflow}/></div>
              <aside className="ff-side-column">
                <section className="ff-panel ff-action-card"><span className="ff-eyebrow">Available actions</span><h2>Case controls</h2><p>Buttons reflect your connected role; the contract enforces final authorization.</p>
                  {app.workflow.state === 'DRAFT' && isBuyer && <button disabled={!writable} className="ff-button ff-button-primary ff-full" onClick={() => app.fund(total)}>Fund {total.toString()} simulated GEN</button>}
                  {app.workflow.state === 'FUNDED' && isOrchestrator && <button disabled={!writable} className="ff-button ff-button-primary ff-full" onClick={app.start}>Start workflow</button>}
                  {app.workflow.state === 'FUNDED' && isBuyer && <button disabled={!writable} className="ff-button ff-button-outline ff-full" onClick={app.cancel}>Cancel and schedule refund</button>}
                  {app.workflow.state === 'READY_FOR_REVIEW' && isBuyer && <><button disabled={!writable} className="ff-button ff-button-primary ff-full" onClick={app.accept}>Accept all work</button><textarea aria-label="Rejection reason" value={rejection} onChange={(e) => setRejection(e.target.value)} placeholder="State the concrete failure; this is evidence context, not the verdict."/><button disabled={!writable || !rejection.trim()} className="ff-button ff-button-danger ff-full" onClick={() => app.dispute(rejection)}>Open dispute</button></>}
                  {app.workflow.state === 'DISPUTED' && <><button disabled={!writable} className="ff-button ff-button-primary ff-full" onClick={app.adjudicate}>Request GenLayer decision</button><button disabled={!writable} className="ff-button ff-button-outline ff-full" onClick={app.timeout}>Attempt safe timeout</button></>}
                  {!['DRAFT','FUNDED','READY_FOR_REVIEW','DISPUTED'].includes(app.workflow.state) && <div className="ff-no-action">No primary action is available in this state. Contract readback remains authoritative.</div>}
                </section>
                <TransactionStatus status={app.status} parentHash={app.parentHash} childHashes={app.childHashes}/>
                <section className="ff-panel ff-ledger"><span className="ff-eyebrow">Custody ledger</span><h2>Conservation view</h2>{app.accounting && Object.entries(app.accounting).map(([key,value]) => <div key={key}><span>{key.replaceAll('_',' ')}</span><strong>{value}</strong></div>)}<p>Scheduled is not paid. Recipient balance proof is tracked separately.</p></section>
              </aside>
            </div>
          </>}
        </div>
      </main>
      <footer><div className="ff-shell"><div className="ff-footer-brand"><div className="ff-logo"><span className="ff-logo-mark">F</span><span>FirstFault</span></div><AgentTankBadge compact /></div><p>Built for Agent Tank · Powered by GenLayer Studionet<br/>Intentionally frozen contract · simulated Studionet value</p><div><a href="https://genlayer.com" target="_blank" rel="noreferrer">GenLayer</a><a href="https://explorer-studio.genlayer.com" target="_blank" rel="noreferrer">Explorer</a></div></div></footer>
    </div>
  );
}
