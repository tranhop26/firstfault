import { GENLAYER_CHAIN_ID } from "./network";
import type { Eip1193Provider } from "./providers";

export async function validateSelectedWalletBeforeSubmit(
  provider: Eip1193Provider,
  expectedAddress: string,
): Promise<void> {
  const [rawChainId, rawAccounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  const chainId = typeof rawChainId === "string" ? Number.parseInt(rawChainId, 16) : Number(rawChainId);
  const accounts = Array.isArray(rawAccounts) ? rawAccounts : [];
  const activeAddress = typeof accounts[0] === "string" ? accounts[0] : "";
  if (chainId !== GENLAYER_CHAIN_ID) {
    throw new Error("Wallet network changed before signing; switch back to Studio Next");
  }
  if (activeAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Wallet account changed before signing; review the fee again");
  }
}
