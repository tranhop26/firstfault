"use client";

import { createClient } from "genlayer-js";
import {
  GENLAYER_CHAIN,
  GENLAYER_CHAIN_ID,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_EXPLORER_URL,
  GENLAYER_NETWORK,
  GENLAYER_RPC_URL,
} from "./network";
import type { Eip1193Provider, WalletProviderRecord } from "./providers";

export {
  GENLAYER_CHAIN,
  GENLAYER_CHAIN_ID,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_EXPLORER_URL,
  GENLAYER_NETWORK,
  GENLAYER_RPC_URL,
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
  }
}

type ProviderError = Error & { code?: number };

function providerError(error: unknown, fallback: string): ProviderError {
  const source = error as { code?: number; message?: string };
  const wrapped = new Error(source?.message || fallback) as ProviderError;
  if (typeof source?.code === "number") wrapped.code = source.code;
  return wrapped;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getStudioUrl(): string {
  return GENLAYER_RPC_URL;
}

export function getContractAddress(): string {
  return process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

export function getContractVersion(): "v1" | "v2" | "v3" {
  const version = process.env.NEXT_PUBLIC_CONTRACT_VERSION;
  return version === "v3" ? "v3" : version === "v2" ? "v2" : "v1";
}

export async function requestAccounts(provider: Eip1193Provider, walletName: string): Promise<string[]> {
  try {
    return stringArray(await provider.request({ method: "eth_requestAccounts" }));
  } catch (cause) {
    throw providerError(cause, `Failed to connect to ${walletName}`);
  }
}

export async function getAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    return stringArray(await provider.request({ method: "eth_accounts" }));
  } catch (cause) {
    console.error("Error getting wallet accounts:", cause);
    return [];
  }
}

export async function getCurrentChainId(provider: Eip1193Provider): Promise<string | null> {
  try {
    const chainId = await provider.request({ method: "eth_chainId" });
    return typeof chainId === "string" ? chainId : null;
  } catch (cause) {
    console.error("Error getting wallet chain ID:", cause);
    return null;
  }
}

export async function addGenLayerNetwork(provider: Eip1193Provider, walletName: string): Promise<void> {
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [GENLAYER_NETWORK],
    });
  } catch (cause) {
    throw providerError(cause, `Failed to add Studio Next to ${walletName}`);
  }
}

export async function switchToGenLayerNetwork(provider: Eip1193Provider, walletName: string): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (cause) {
    const error = cause as { code?: number };
    if (error?.code === 4902) {
      await addGenLayerNetwork(provider, walletName);
      return;
    }
    throw providerError(cause, `Failed to switch ${walletName} to Studio Next`);
  }
}

export async function isOnGenLayerNetwork(provider: Eip1193Provider): Promise<boolean> {
  const chainId = await getCurrentChainId(provider);
  return chainId !== null && Number.parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
}

export async function connectWalletProvider(record: WalletProviderRecord): Promise<string> {
  const accounts = await requestAccounts(record.provider, record.name);
  const address = accounts[0];
  if (!address) throw new Error(`No account returned by ${record.name}`);

  if (!(await isOnGenLayerNetwork(record.provider))) {
    await switchToGenLayerNetwork(record.provider, record.name);
  }
  if (!(await isOnGenLayerNetwork(record.provider))) {
    throw new Error(`${record.name} is not connected to Studio Next`);
  }
  return address;
}

export async function switchAccount(provider: Eip1193Provider, walletName: string): Promise<string> {
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
    const accounts = stringArray(await provider.request({ method: "eth_accounts" }));
    if (!accounts[0]) throw new Error(`No account selected in ${walletName}`);
    return accounts[0];
  } catch (cause) {
    throw providerError(cause, `Failed to switch account in ${walletName}`);
  }
}

export function createGenLayerClient(address?: string, provider?: Eip1193Provider) {
  return createClient({
    chain: GENLAYER_CHAIN,
    ...(address ? { account: address as `0x${string}` } : {}),
    ...(provider ? { provider } : {}),
  });
}

export async function getClient(provider?: Eip1193Provider) {
  const address = provider ? (await getAccounts(provider))[0] : undefined;
  return createGenLayerClient(address, provider);
}
