"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExecutionResult, type GenLayerTransaction } from "genlayer-js/types";
import { isAddress, type Address } from "viem";

import FirstFault, { type CreateWorkflowInput } from "@/lib/contracts/FirstFault";
import { getContractAddress } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { projectTransactionStatus, type TransactionEvidence } from "@/lib/firstfault/status";

function evidence(receipt: GenLayerTransaction): TransactionEvidence {
  const executionSucceeded = receipt.txExecutionResultName
    ? receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN
    : receipt.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS";
  return {
    hash: String(receipt.hash ?? receipt.txId ?? ""),
    statusName: String(receipt.statusName ?? receipt.status ?? "UNKNOWN"),
    executionSucceeded,
  };
}

function nonce(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

export function useFirstFault(workflowId: string) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const configuredAddress = getContractAddress();
  const configured = isAddress(configuredAddress);
  const contract = useMemo(
    () => configured ? new FirstFault(configuredAddress as Address, wallet.address as Address | undefined) : null,
    [configured, configuredAddress, wallet.address],
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

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["firstfault", configuredAddress, workflowId] });
  };

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
      const triggered = await contract.getTriggeredReceipts(parent);
      setChildren(triggered.map(evidence));
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
    workflow,
    steps: stepsQuery.data ?? [],
    accounting: accountingQuery.data ?? null,
    loading: workflowQuery.isLoading || stepsQuery.isLoading || accountingQuery.isLoading,
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
  };
}
