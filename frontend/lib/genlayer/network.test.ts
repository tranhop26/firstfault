import { describe, expect, it } from "vitest";

import {
  GENLAYER_CHAIN,
  GENLAYER_CHAIN_ID,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_EXPLORER_URL,
  GENLAYER_NETWORK,
  GENLAYER_RPC_URL,
} from "./network";

describe("Studio Next network configuration", () => {
  it("binds SDK, wallet, RPC, and explorer metadata to chain 61997", () => {
    expect(GENLAYER_CHAIN_ID).toBe(61997);
    expect(GENLAYER_CHAIN.id).toBe(61997);
    expect(GENLAYER_CHAIN_ID_HEX).toBe("0xF22D");
    expect(GENLAYER_RPC_URL).toBe("https://studio-next.genlayer.com/api");
    expect(GENLAYER_EXPLORER_URL).toBe("https://explorer-studio-dev.genlayer.com");
    expect(GENLAYER_CHAIN.rpcUrls.default.http).toEqual([GENLAYER_RPC_URL]);
    expect(GENLAYER_NETWORK).toMatchObject({
      chainId: GENLAYER_CHAIN_ID_HEX,
      chainName: "GenLayer Studio Next",
      rpcUrls: [GENLAYER_RPC_URL],
      blockExplorerUrls: [GENLAYER_EXPLORER_URL],
    });
  });
});
