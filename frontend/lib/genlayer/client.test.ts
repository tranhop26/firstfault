import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((config: unknown) => ({ config })),
}));

vi.mock("genlayer-js", () => ({
  createClient: createClientMock,
}));

import {
  connectWalletProvider,
  createGenLayerClient,
  requestAccounts,
} from "./client";
import type { Eip1193Provider, WalletProviderRecord } from "./providers";

const ADDRESS = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";

function record(id: "metamask" | "okx", provider: Eip1193Provider): WalletProviderRecord {
  return {
    id,
    name: id === "metamask" ? "MetaMask" : "OKX Wallet",
    provider,
  };
}

describe("provider-bound GenLayer client", () => {
  beforeEach(() => {
    createClientMock.mockClear();
  });

  it("connects and checks Studio Next through only the selected OKX provider", async () => {
    const okx: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return [ADDRESS];
        if (method === "eth_chainId") return "0xf22d";
        throw new Error(`Unexpected method: ${method}`);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const phantom: Eip1193Provider = {
      isPhantom: true,
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { ethereum: phantom },
    });

    await expect(connectWalletProvider(record("okx", okx))).resolves.toBe(ADDRESS);
    expect(okx.request).toHaveBeenCalledWith({ method: "eth_requestAccounts" });
    expect(okx.request).toHaveBeenCalledWith({ method: "eth_chainId" });
    expect(phantom.request).not.toHaveBeenCalled();
  });

  it("switches the selected provider and verifies the resulting chain", async () => {
    let chainId = "0x1";
    const metamask: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_requestAccounts") return [ADDRESS];
        if (method === "eth_chainId") return chainId;
        if (method === "wallet_switchEthereumChain") {
          chainId = "0xf22d";
          return null;
        }
        throw new Error(`Unexpected method: ${method}`);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    await expect(connectWalletProvider(record("metamask", metamask))).resolves.toBe(ADDRESS);
    expect(metamask.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xF22D" }],
    });
  });

  it("preserves pending-request errors so the UI can recover", async () => {
    const pending = Object.assign(new Error("request already pending"), { code: -32002 });
    const metamask: Eip1193Provider = {
      request: vi.fn(async () => { throw pending; }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    await expect(requestAccounts(metamask, "MetaMask")).rejects.toMatchObject({ code: -32002 });
  });

  it("passes the exact selected provider to genlayer-js", () => {
    const okx: Eip1193Provider = {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    createGenLayerClient(ADDRESS, okx);

    expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({
      account: ADDRESS,
      provider: okx,
    }));
  });
});
