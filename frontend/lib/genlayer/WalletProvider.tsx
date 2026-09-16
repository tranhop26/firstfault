"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  connectWalletProvider,
  GENLAYER_CHAIN_ID,
  getAccounts,
  getCurrentChainId,
  isOnGenLayerNetwork,
  switchAccount,
} from "./client";
import {
  getBrowserWalletProviderRegistry,
  type Eip1193Provider,
  type WalletId,
  type WalletProviderRecord,
  type WalletProviderRegistry,
} from "./providers";
import { error as toastError, userRejected } from "../utils/toast";

export interface WalletOption {
  id: WalletId;
  name: "MetaMask" | "OKX Wallet";
  installed: boolean;
  installUrl: string;
}

const WALLET_OPTIONS: Record<WalletId, Omit<WalletOption, "installed">> = {
  metamask: {
    id: "metamask",
    name: "MetaMask",
    installUrl: "https://metamask.io/download/",
  },
  okx: {
    id: "okx",
    name: "OKX Wallet",
    installUrl: "https://www.okx.com/web3",
  },
};

function optionsFrom(records: WalletProviderRecord[]): WalletOption[] {
  const installed = new Set(records.map((record) => record.id));
  return (["metamask", "okx"] as WalletId[]).map((id) => ({
    ...WALLET_OPTIONS[id],
    installed: installed.has(id),
  }));
}

export interface WalletState {
  address: string | null;
  chainId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isDiscovering: boolean;
  isOnCorrectNetwork: boolean;
  walletId: WalletId | null;
  walletName: WalletOption["name"] | null;
  provider: Eip1193Provider | null;
  availableWallets: WalletOption[];
  pendingWalletId: WalletId | null;
}

interface WalletContextValue extends WalletState {
  connectWallet: (walletId: WalletId) => Promise<string>;
  disconnectWallet: () => void;
  switchWalletAccount: () => Promise<string>;
}

interface WalletProviderProps {
  children: ReactNode;
  registry?: WalletProviderRegistry;
  connectionTimeoutMs?: number;
}

const initialState: WalletState = {
  address: null,
  chainId: null,
  isConnected: false,
  isLoading: false,
  isDiscovering: true,
  isOnCorrectNetwork: false,
  walletId: null,
  walletName: null,
  provider: null,
  availableWallets: optionsFrom([]),
  pendingWalletId: null,
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function errorCode(cause: unknown): number | undefined {
  return (cause as { code?: number })?.code;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unexpected wallet error";
}

function withConnectionTimeout<T>(promise: Promise<T>, timeoutMs: number, walletName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`${walletName} did not respond. Open the wallet and try again.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (cause) => {
        window.clearTimeout(timeout);
        reject(cause);
      },
    );
  });
}

export function WalletProvider({
  children,
  registry: suppliedRegistry,
  connectionTimeoutMs = 30_000,
}: WalletProviderProps) {
  const activeRegistry = useMemo(
    () => suppliedRegistry ?? getBrowserWalletProviderRegistry(),
    [suppliedRegistry],
  );
  const [state, setState] = useState<WalletState>(initialState);
  const activeProviderRef = useRef<Eip1193Provider | null>(null);

  useEffect(() => {
    if (!activeRegistry) {
      setState((previous) => ({ ...previous, isDiscovering: false }));
      return;
    }
    const syncWallets = (records: WalletProviderRecord[]) => {
      setState((previous) => ({
        ...previous,
        availableWallets: optionsFrom(records),
        isDiscovering: false,
      }));
    };
    const unsubscribe = activeRegistry.subscribe(syncWallets);
    activeRegistry.start();
    syncWallets(activeRegistry.list());
    return () => {
      unsubscribe();
      activeRegistry.stop();
    };
  }, [activeRegistry]);

  useEffect(() => {
    const provider = state.provider;
    if (!provider) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      const chainId = await getCurrentChainId(provider);
      const correctNetwork = await isOnGenLayerNetwork(provider);
      if (activeProviderRef.current !== provider) return;
      setState((previous) => ({
        ...previous,
        address: accounts[0] || null,
        chainId,
        isConnected: accounts.length > 0,
        isOnCorrectNetwork: correctNetwork,
      }));
    };
    const handleChainChanged = async (chainId: string) => {
      const accounts = await getAccounts(provider);
      if (activeProviderRef.current !== provider) return;
      setState((previous) => ({
        ...previous,
        address: accounts[0] || null,
        chainId,
        isConnected: accounts.length > 0,
        isOnCorrectNetwork: Number.parseInt(chainId, 16) === GENLAYER_CHAIN_ID,
      }));
    };
    const handleDisconnect = () => {
      activeProviderRef.current = null;
      setState((previous) => ({
        ...previous,
        address: null,
        chainId: null,
        isConnected: false,
        isOnCorrectNetwork: false,
        walletId: null,
        walletName: null,
        provider: null,
        pendingWalletId: null,
      }));
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);
    provider.on("disconnect", handleDisconnect);
    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
      provider.removeListener("disconnect", handleDisconnect);
    };
  }, [state.provider]);

  const connectWallet = useCallback(async (walletId: WalletId) => {
    const option = WALLET_OPTIONS[walletId];
    const record = activeRegistry?.get(walletId);
    if (!record) {
      const cause = new Error(`${option.name} is not installed`);
      toastError(`${option.name} not found`, {
        description: `Install ${option.name}, then try again.`,
        action: {
          label: `Install ${option.name}`,
          onClick: () => window.open(option.installUrl, "_blank"),
        },
      });
      throw cause;
    }

    setState((previous) => ({ ...previous, isLoading: true, pendingWalletId: walletId }));
    try {
      const address = await withConnectionTimeout(
        connectWalletProvider(record),
        connectionTimeoutMs,
        record.name,
      );
      const chainId = await getCurrentChainId(record.provider);
      const correctNetwork = await isOnGenLayerNetwork(record.provider);
      activeProviderRef.current = record.provider;
      setState((previous) => ({
        ...previous,
        address,
        chainId,
        isConnected: true,
        isLoading: false,
        isOnCorrectNetwork: correctNetwork,
        walletId,
        walletName: record.name,
        provider: record.provider,
        pendingWalletId: null,
      }));
      return address;
    } catch (cause) {
      setState((previous) => ({ ...previous, isLoading: false, pendingWalletId: null }));
      const code = errorCode(cause);
      const message = errorMessage(cause);
      if (code === 4001) {
        userRejected("Connection cancelled");
      } else if (code === -32002) {
        toastError("Wallet request already pending", {
          description: `Open ${option.name} to finish or cancel it.`,
        });
      } else {
        toastError("Failed to connect wallet", { description: message });
      }
      throw cause;
    }
  }, [activeRegistry, connectionTimeoutMs]);

  const disconnectWallet = useCallback(() => {
    activeProviderRef.current = null;
    setState((previous) => ({
      ...previous,
      address: null,
      chainId: null,
      isConnected: false,
      isLoading: false,
      isOnCorrectNetwork: false,
      walletId: null,
      walletName: null,
      provider: null,
      pendingWalletId: null,
    }));
  }, []);

  const switchWalletAccount = useCallback(async () => {
    if (!state.provider || !state.walletName) throw new Error("Connect a wallet first");
    setState((previous) => ({ ...previous, isLoading: true }));
    try {
      const address = await switchAccount(state.provider, state.walletName);
      const chainId = await getCurrentChainId(state.provider);
      const correctNetwork = await isOnGenLayerNetwork(state.provider);
      setState((previous) => ({
        ...previous,
        address,
        chainId,
        isConnected: true,
        isLoading: false,
        isOnCorrectNetwork: correctNetwork,
      }));
      return address;
    } catch (cause) {
      setState((previous) => ({ ...previous, isLoading: false }));
      if (errorCode(cause) === 4001) userRejected("Account switch cancelled");
      else toastError("Failed to switch account", { description: errorMessage(cause) });
      throw cause;
    }
  }, [state.provider, state.walletName]);

  const value: WalletContextValue = {
    ...state,
    connectWallet,
    disconnectWallet,
    switchWalletAccount,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
