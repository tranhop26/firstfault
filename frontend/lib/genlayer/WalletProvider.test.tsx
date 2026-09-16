// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalletProvider, useWallet } from "./WalletProvider";
import type {
  Eip1193Provider,
  WalletProviderRecord,
  WalletProviderRegistry,
} from "./providers";

const ADDRESS = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";
const NEXT_ADDRESS = "0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2";
const OLD_EVENT_ADDRESS = "0x76D4D79c9cA9A96C8F5470F231FE65E9954Fd9d8";

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
    <button onClick={() => void wallet.switchWalletAccount().catch(() => undefined)}>switch-account</button>
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

  it("clears loading when a wallet extension never answers", async () => {
    const okx = new EventProvider(() => new Promise(() => undefined));
    render(<WalletProvider
      registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}
      connectionTimeoutMs={20}
    >
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
  });

  it("times out when a final chain read hangs after the wallet connection succeeds", async () => {
    let chainReads = 0;
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") {
        chainReads += 1;
        if (chainReads >= 3) return new Promise(() => undefined);
        return "0xf22d";
      }
      return null;
    });
    render(<WalletProvider
      registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}
      connectionTimeoutMs={20}
    >
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
  });

  it("does not repopulate state when a pending connection finishes after disconnect", async () => {
    let releaseAccounts: ((accounts: string[]) => void) | undefined;
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts") {
        return new Promise<string[]>((resolve) => { releaseAccounts = resolve; });
      }
      if (method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(releaseAccounts).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    await act(async () => releaseAccounts?.([ADDRESS]));

    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
    expect(screen.getByTestId("address").textContent).toBe("none");
    expect(screen.getByTestId("loading").textContent).toBe("false");
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

  it("ignores an in-flight provider event after disconnect", async () => {
    let delayChainRead = false;
    let releaseChainRead: (() => void) | undefined;
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId" && delayChainRead) {
        return new Promise<string>((resolve) => {
          releaseChainRead = () => {
            delayChainRead = false;
            resolve("0xf22d");
          };
        });
      }
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));

    delayChainRead = true;
    okx.emit("accountsChanged", [NEXT_ADDRESS]);
    await waitFor(() => expect(releaseChainRead).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    await act(async () => releaseChainRead?.());

    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
    expect(screen.getByTestId("address").textContent).toBe("none");
  });

  it("ignores an old event after disconnecting and reconnecting the same provider", async () => {
    let selectedAddress = ADDRESS;
    let delayChainRead = false;
    let releaseChainRead: (() => void) | undefined;
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [selectedAddress];
      if (method === "eth_chainId" && delayChainRead) {
        delayChainRead = false;
        return new Promise<string>((resolve) => {
          releaseChainRead = () => {
            resolve("0xf22d");
          };
        });
      }
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));

    delayChainRead = true;
    okx.emit("accountsChanged", [OLD_EVENT_ADDRESS]);
    await waitFor(() => expect(releaseChainRead).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    selectedAddress = NEXT_ADDRESS;
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS));
    await act(async () => releaseChainRead?.());

    expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS);
  });

  it("installs a fresh event session after an empty account event and reconnect", async () => {
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

    okx.emit("accountsChanged", []);
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("none"));
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));
    okx.emit("accountsChanged", [NEXT_ADDRESS]);

    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS));
  });

  it("installs a fresh event session after a chain event finds no accounts", async () => {
    let accountsForRead = [ADDRESS];
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts") return [ADDRESS];
      if (method === "eth_accounts") return accountsForRead;
      if (method === "eth_chainId") return "0xf22d";
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));

    accountsForRead = [];
    okx.emit("chainChanged", "0xf22d");
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("none"));
    accountsForRead = [ADDRESS];
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));
    okx.emit("accountsChanged", [NEXT_ADDRESS]);

    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS));
  });

  it("bounds account switching and clears loading when the wallet hangs", async () => {
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      if (method === "wallet_requestPermissions") return new Promise(() => undefined);
      return null;
    });
    render(<WalletProvider
      registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}
      connectionTimeoutMs={20}
    >
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));
    fireEvent.click(screen.getByRole("button", { name: "switch-account" }));

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("address").textContent).toBe(ADDRESS);
  });

  it("clears loading when the provider disconnects during an account switch", async () => {
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      if (method === "wallet_requestPermissions") return new Promise(() => undefined);
      return null;
    });
    render(<WalletProvider
      registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}
      connectionTimeoutMs={20}
    >
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));
    fireEvent.click(screen.getByRole("button", { name: "switch-account" }));
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("true"));
    okx.emit("disconnect");

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("wallet-name").textContent).toBe("none");
    expect(screen.getByTestId("address").textContent).toBe("none");
  });

  it("keeps a newer account event when an older account-switch operation finishes later", async () => {
    let switching = false;
    let releasePermissions: (() => void) | undefined;
    const okx = new EventProvider(async ({ method }) => {
      if (method === "eth_requestAccounts") return [ADDRESS];
      if (method === "eth_accounts") return [ADDRESS];
      if (method === "eth_chainId") return "0xf22d";
      if (method === "wallet_requestPermissions" && switching) {
        return new Promise((resolve) => { releasePermissions = () => resolve([]); });
      }
      return null;
    });
    render(<WalletProvider registry={registry({ id: "okx", name: "OKX Wallet", provider: okx })}>
      <WalletProbe />
    </WalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "connect-okx" }));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(ADDRESS));

    switching = true;
    fireEvent.click(screen.getByRole("button", { name: "switch-account" }));
    await waitFor(() => expect(releasePermissions).toBeTypeOf("function"));
    okx.emit("accountsChanged", [NEXT_ADDRESS]);
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS));
    await act(async () => releasePermissions?.());

    expect(screen.getByTestId("address").textContent).toBe(NEXT_ADDRESS);
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
