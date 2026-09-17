import { describe, expect, it, vi } from "vitest";

import { validateSelectedWalletBeforeSubmit } from "../genlayer/walletValidation";
import type { Eip1193Provider } from "../genlayer/providers";

const ADDRESS = "0x21b45103dd05c43969daF3CbB4277391777e2eC7";

describe("selected wallet pre-sign validation", () => {
  it("checks chain and account through the selected provider", async () => {
    const selected: Eip1193Provider = {
      request: vi.fn(async ({ method }) => {
        if (method === "eth_chainId") return "0xf22d";
        if (method === "eth_accounts") return [ADDRESS];
        throw new Error(`Unexpected method: ${method}`);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    await expect(validateSelectedWalletBeforeSubmit(selected, ADDRESS)).resolves.toBeUndefined();
    expect(selected.request).toHaveBeenCalledTimes(2);
  });

  it("rejects an account change before signing", async () => {
    const selected: Eip1193Provider = {
      request: vi.fn(async ({ method }) => method === "eth_chainId"
        ? "0xf22d"
        : ["0x35C9979d30992b13EF6dF7036bC745E2e1cD76a2"]),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    await expect(validateSelectedWalletBeforeSubmit(selected, ADDRESS))
      .rejects.toThrow("Wallet account changed before signing");
  });
});
