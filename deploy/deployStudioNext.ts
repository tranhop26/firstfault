import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

import {
  deployFirstFaultStudioNext,
  resumeFirstFaultStudioNextDeployment,
  type DeployFirstFaultStudioNextInput,
  type StudioNextDeploymentClient,
} from "../scripts/deployFirstFaultStudioNext";
import { readStudioNextPendingDeployment } from "../scripts/studioNextDeploymentPending";
import {
  decodeStudioNextDeploymentEnvelope,
  type StudioNextRawTransaction,
} from "../scripts/studioNextDeploymentEnvelope";
import {
  assertPrivateKey,
  normalizeSource,
  redactSecrets,
  sha256Hex,
} from "../scripts/deploymentEvidence";
import { readCleanV3SourceCommit } from "../scripts/v3SourceRevision";

const ENDPOINT = "https://studio-next.genlayer.com/api";
const EXPLORER = "https://explorer-studio-dev.genlayer.com";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const privateKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
  assertPrivateKey(privateKey);
  if (studioDevnet.id !== 61997) throw new Error(`SDK Studio Devnet chain ID is ${studioDevnet.id}, expected 61997`);

  const sourcePath = resolve(projectRoot, "contracts/firstfault_v3.py");
  const manifestPath = resolve(projectRoot, "deployments/studio-next-v3.json");
  const pendingPath = resolve(projectRoot, "deployments/studio-next-v3.pending.json");
  const source = await readFile(sourcePath, "utf8");
  const sourceCommit = await readCleanV3SourceCommit(projectRoot);
  const account = createAccount(privateKey);
  const endpoint = process.env.GENLAYER_RPC_URL ?? ENDPOINT;
  if (endpoint !== ENDPOINT) throw new Error(`Studio Next deployment RPC must be ${ENDPOINT}`);
  const sdkClient = createClient({ chain: studioDevnet, account, endpoint });
  const consensusContract = studioDevnet.consensusMainContract?.address;
  if (!consensusContract) throw new Error("Studio Next consensus contract address is unavailable");
  const client = Object.assign(sdkClient, {
    getSubmittedDeploymentEnvelope: async (hash: `0x${string}`) => {
      const raw = await (sdkClient.request as (args: unknown) => Promise<StudioNextRawTransaction | null>)({
        method: "eth_getTransactionByHash",
        params: [hash],
      });
      return decodeStudioNextDeploymentEnvelope(raw, hash, account.address, consensusContract);
    },
  });
  const resumeHash = process.env.GENLAYER_STUDIO_NEXT_DEPLOYMENT_TX_HASH as `0x${string}` | undefined;

  console.info("FirstFault Studio Next deployment preflight", {
    network: "studio-next",
    chainId: 61997,
    rpc: endpoint,
    deployerAddress: account.address,
    sourceCommit,
    sourceSha256: sha256Hex(normalizeSource(source)),
    sourcePath: "contracts/firstfault_v3.py",
    manifestPath: "deployments/studio-next-v3.json",
    mode: resumeHash ? "resume" : "deploy",
  });

  const input: DeployFirstFaultStudioNextInput = {
    client: client as StudioNextDeploymentClient,
    source,
    sourceCommit,
    manifestPath,
    pendingPath,
    deployerAddress: account.address,
    explorerUrl: EXPLORER,
    onFeeQuoted: ({ feeValue }) => console.info("Studio Next refundable fee deposit quoted", {
      feeDepositWei: feeValue.toString(),
    }),
    onSubmitted: (deploymentTransactionHash) => console.info("FirstFault Studio Next deployment submitted", {
      deployerAddress: account.address,
      deploymentTransactionHash,
    }),
  };
  const manifest = resumeHash
    ? await (async () => {
      let pending;
      try {
        pending = await readStudioNextPendingDeployment(pendingPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      return resumeFirstFaultStudioNextDeployment(input, resumeHash, pending);
    })()
    : await deployFirstFaultStudioNext(input);
  console.info("FirstFault Studio Next deployment verified", manifest);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "FirstFault Studio Next deployment failed";
  console.error(redactSecrets(message, [process.env.GENLAYER_DEPLOYER_PRIVATE_KEY]));
  process.exitCode = 1;
});
