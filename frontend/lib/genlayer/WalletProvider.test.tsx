// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalletProvider, useWallet } from "./WalletProvider";
import type {
  Eip1193Provider,
  WalletProviderRecord,
  WalletProviderRegistry,
} from "./providers";

const ADDRESS = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const NEXT_ADDRESS = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

class EventProvider implements Eip1193Provider {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  constructor(public request: Eip1193Provider["request"]) {}

  on(event: string, handler: (...args: any[]) => void) {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
  }

  removeListener(event: string, handler: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, value?: unknown) {
    this.listeners.get(event)?.forEach((handler) => handler(value));
  }
}

function registry(record: WalletProviderRecord): WalletProviderRegistry {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    list: () => [record],
    get: (id) => id === record.id ? record : undefined,
    subscribe: (listener) => {
      listener([record]);
      return () => undefined;
    },
  };
}

function WalletProbe() {
  const wallet = useWallet();
  return <>
    <span data-testid="wallet-name">{wallet.walletName ?? "none"}</span>
    <span data-testid="address">{wallet.address ?? "none"}</span>
    <span data-testid="loading">{String(wallet.isLoading)}</span>
    <button onClick={() => void wallet.connectWallet("okx").catch(() => undefined)}>connect-okx</button>
    <button onClick={wallet.disconnectWallet}>disconnect</button>
  </>;
}

describe("WalletProvider selected provider session", () => {
  it("connects OKX and exposes the selected provider session", async () => {
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      throw new Error(`Unexpected method: ${method}`);
    });

    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));

    await waitFor(() => expect(screen.getByTestId("wallet-name").textContent).toBe("OKX Wallet"));
    expect(screen.getByTestId("address").textContent).toBe(ADDRESS);
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("clears loading after an already-pending wallet request", async () => {
    const pending = Object.assign(new Error("request already pending"), { code: -32002 });
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts") throw pending;
      if (method === "eth_accounts") return [];
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });

    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
    expect(screen.getByTestId("address").textContent).toBe("none");
  });

  it("updates from the active provider and clears the session on disconnect", async () => {
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));

    okx.emit("accountsChanged", [NEXT_ADDRESS]);
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS));

    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
    expect(screen.getByTestId("address").textContent).toBe("none");
  });
});
