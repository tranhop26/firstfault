import { studioDevnet } from "genlayer-js/chains";

export const GENLAYER_RPC_URL = "https://studio-next.genlayer.com/api";
export const GENLAYER_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com";

export const GENLAYER_CHAIN = {
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: {
    default: {
      http: [GENLAYER_RPC_URL],
    },
  },
};

export const GENLAYER_CHAIN_ID = GENLAYER_CHAIN.id;
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16).toUpperCase()}`;

export const GENLAYER_NETWORK = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: GENLAYER_CHAIN.name,
  nativeCurrency: GENLAYER_CHAIN.nativeCurrency,
  rpcUrls: [...GENLAYER_CHAIN.rpcUrls.default.http],
  blockExplorerUrls: [GENLAYER_EXPLORER_URL],
};
