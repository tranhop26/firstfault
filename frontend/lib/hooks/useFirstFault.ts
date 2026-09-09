"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExecutionResult, TransactionStatus, type GenLayerTransaction, type TransactionHash } from "genlayer-js/types";
import { isAddress, type Address } from "viem";

import FirstFault, { type CreateWorkflowInput } from "@/lib/contracts/FirstFault";
import { getContractAddress, getContractVersion } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { projectTransactionStatus, type TransactionEvidence } from "@/lib/firstfault/status";
import {
  clearReconciliationHash,
  getReconciliationStorage,
  readReconciliationHash,
  writeReconciliationHash,
} from "@/lib/firstfault/reconciliationStorage";

function evidence(receipt: GenLayerTransaction): TransactionEvidence {
  const externalTransferSucceeded = receipt.type === 0 && receipt.statusName === TransactionStatus.FINALIZED;
  const executionSucceeded = externalTransferSucceeded || (receipt.txExecutionResultName
    ? receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN
    : receipt.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS");
  return {
    hash: String(receipt.hash ?? receipt.txId ?? ""),
    statusName: String(receipt.statusName ?? receipt.status ?? "UNKNOWN"),
    executionSucceeded,
    value: String(receipt.value ?? 0),
  };
}

function nonce(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

export function useFirstFault(workflowId: string) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const configuredAddress = getContractAddress();
  const contractVersion = getContractVersion();
  const configured = isAddress(configuredAddress);
  const reconciliationKey = `firstfault:parent:${configuredAddress.toLowerCase()}:${workflowId.trim()}`;
  const contract = useMemo(
    () => configured ? new FirstFault(
      configuredAddress as Address,
      wallet.address as Address | undefined,
      undefined,
      (hash) => {
        const storage = getReconciliationStorage(window);
        if (storage) writeReconciliationHash(storage, reconciliationKey, hash);
      },
    ) : null,
    [configured, configuredAddress, reconciliationKey, wallet.address],
  );
  const [receipt, setReceipt] = useState<TransactionEvidence | null>(null);
  const [children, setChildren] = useState<TransactionEvidence[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const enabled = Boolean(contract && workflowId.trim());
  const workflowQuery = useQuery({
    queryKey: ["firstfault", configuredAddress, workflowId, "workflow"],
    queryFn: () => contract!.getWorkflow(workflowId),
    enabled,
    retry: false,
  });
  const stepsQuery = useQuery({
    queryKey: ["firstfault", configuredAddress, workflowId, "steps"],
    queryFn: () => Promise.all([0, 1, 2].map((index) => contract!.getStep(workflowId, index))),
    enabled,
    retry: false,
  });
  const accountingQuery = useQuery({
    queryKey: ["firstfault", configuredAddress, workflowId, "accounting"],
    queryFn: () => contract!.getAccounting(workflowId),
    enabled,
    retry: false,
  });
  const recoveryQuery = useQuery({
    queryKey: ["firstfault", configuredAddress, workflowId, "recovery"],
    queryFn: () => contract!.getRecovery(workflowId),
    enabled,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["firstfault", configuredAddress, workflowId] });
  };

  useEffect(() => {
    setReceipt(null);
    setChildren([]);
    setActionError(null);
    if (!contract || !enabled) return;
    const storage = getReconciliationStorage(window);
    if (!storage) return;
    const storedHash = readReconciliationHash(storage, reconciliationKey);
    if (!storedHash) return;
    let active = true;
    setSubmitted(true);
    Promise.all([
      contract.getTransactionReceipt(storedHash),
      contract.getTriggeredReceiptsByHash(storedHash),
    ])
      .then(async ([parent, triggered]) => {
        if (!active) return;
        setReceipt(evidence(parent));
        setChildren(triggered.map(evidence));
        if (triggered.length === 0) clearReconciliationHash(storage, reconciliationKey);
        await queryClient.invalidateQueries({ queryKey: ["firstfault", configuredAddress, workflowId] });
      })
      .catch((cause) => {
        if (active) setActionError(cause instanceof Error ? cause.message : "Unable to reconcile transfer finality");
      })
      .finally(() => {
        if (active) setSubmitted(false);
      });
    return () => {
      active = false;
    };
  }, [configuredAddress, contract, enabled, queryClient, reconciliationKey, workflowId]);

  useEffect(() => {
    if (!contract || !enabled || receipt || submitted) return;
    const scheduled = workflowQuery.data
      ? BigInt(workflowQuery.data.payout_scheduled) + BigInt(workflowQuery.data.refund_scheduled)
      : 0n;
    if (scheduled === 0n) return;
    const storage = getReconciliationStorage(window);
    if (storage && readReconciliationHash(storage, reconciliationKey)) return;
    let active = true;
    contract.findSettlementEvidence(workflowId)
      .then((proof) => {
        if (!active || !proof) return;
        setReceipt(evidence(proof.parent));
        setChildren(proof.children.map(evidence));
      })
      .catch(() => {
        // Readback stays visible; status reports that receipt proof is unavailable.
      });
    return () => { active = false; };
  }, [contract, enabled, receipt, reconciliationKey, submitted, workflowId, workflowQuery.data]);

  const mutation = useMutation({
    mutationFn: async (action: () => Promise<GenLayerTransaction>) => {
      if (!contract) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured with a valid deployed address.");
      if (!wallet.isConnected) throw new Error("Connect a wallet before submitting a contract action.");
      if (!wallet.isOnCorrectNetwork) throw new Error("Switch to GenLayer Studionet before submitting.");
      setSubmitted(true);
      setActionError(null);
      setReceipt(null);
      setChildren([]);
      const parent = await action();
      setReceipt(evidence(parent));
      const parentHash = (parent.hash ?? parent.txId) as TransactionHash | undefined;
      const storage = getReconciliationStorage(window);
      if (parentHash && storage) writeReconciliationHash(storage, reconciliationKey, parentHash);
      const triggered = await contract.getTriggeredReceipts(parent);
      setChildren(triggered.map(evidence));
      if (triggered.length === 0 && storage) clearReconciliationHash(storage, reconciliationKey);
      await refresh();
      return parent;
    },
    onError: (cause) => setActionError(cause instanceof Error ? cause.message : "Unknown contract error"),
    onSettled: () => setSubmitted(false),
  });

  const run = (action: () => Promise<GenLayerTransaction>) => mutation.mutateAsync(action);
  const workflow = workflowQuery.data ?? null;
  const status = projectTransactionStatus({
    connected: wallet.isConnected,
    correctNetwork: wallet.isOnCorrectNetwork,
    receipt,
    triggeredReceipts: children,
    readback: workflow,
    error: actionError,
    submitted,
  });

  return {
    wallet,
    configured,
    configuredAddress,
    contractVersion,
    workflow,
    steps: stepsQuery.data ?? [],
    accounting: accountingQuery.data ?? null,
    recovery: recoveryQuery.data ?? null,
    loading: workflowQuery.isLoading || stepsQuery.isLoading || accountingQuery.isLoading || recoveryQuery.isLoading,
    readError: workflowQuery.error instanceof Error ? workflowQuery.error.message : null,
    actionPending: mutation.isPending,
    status,
    parentHash: receipt?.hash || null,
    childHashes: children.map((child) => child.hash).filter(Boolean),
    refresh,
    create: (input: CreateWorkflowInput) => run(() => contract!.createWorkflow(input)),
    fund: (value: bigint) => run(() => contract!.fundWorkflow(workflowId, nonce("fund"), value)),
    start: () => run(() => contract!.startWorkflow(workflowId, nonce("start"))),
    submitStep: (stepIndex: number, output: string, upstreamHash: string, sourceUrl: string) =>
      run(async () => (await contract!.submitStep(workflowId, stepIndex, output, upstreamHash, sourceUrl, BigInt(Math.floor(Date.now() / 1000)), nonce(`step-${stepIndex}`))).receipt),
    accept: () => run(() => contract!.acceptWorkflow(workflowId, nonce("accept"))),
    dispute: (reason: string) => run(() => contract!.openDispute(workflowId, reason, nonce("dispute"))),
    adjudicate: () => run(() => contract!.adjudicate(workflowId, nonce("adjudicate"))),
    cancel: () => run(() => contract!.cancelWorkflow(workflowId, nonce("cancel"))),
    timeout: () => run(() => contract!.timeoutToUnresolved(workflowId, nonce("timeout"))),
    timeoutIncomplete: () => run(() => contract!.timeoutIncompleteToUnresolved(workflowId, nonce("timeout-incomplete"))),
    timeoutReview: () => run(() => contract!.timeoutReviewToUnresolved(workflowId, nonce("timeout-review"))),
    retryAdjudication: () => run(() => contract!.retryAdjudication(workflowId, nonce("retry-adjudication"))),
    submitCure: (evidenceText: string, sourceUrl: string) => run(() => contract!.submitCure(workflowId, evidenceText, sourceUrl, BigInt(Math.floor(Date.now() / 1000)), nonce("cure"))),
    proposeSettlement: (amounts: readonly [bigint, bigint, bigint, bigint]) => run(() => contract!.proposeMutualSettlement(workflowId, amounts, nonce("proposal"))),
    approveSettlement: (version: bigint, hash: string) => run(() => contract!.approveMutualSettlement(workflowId, version, hash, nonce("approval"))),
    executeSettlement: () => run(() => contract!.executeMutualSettlement(workflowId, nonce("execute-settlement"))),
  };
}
