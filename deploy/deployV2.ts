import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

import {
  deployFirstFaultV2,
  resumeFirstFaultV2Deployment,
  type V2DeploymentClient,
} from "../scripts/deployFirstFaultV2";
import {
  assertPrivateKey,
  normalizeSource,
  redactSecrets,
  sha256Hex,
} from "../scripts/deploymentEvidence";
import { readCleanV2SourceCommit } from "../scripts/v2SourceRevision";
import { v2DeploymentLogFields } from "../scripts/writeV2DeploymentManifest";

const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_ENDPOINT = "https://studio.genlayer.com/api";
const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function main(): Promise<void> {
  const privateKey = process.env.GENLAYER_DEPLOYER_PRIVATE_KEY;
  assertPrivateKey(privateKey);
  if (studionet.id !== STUDIONET_CHAIN_ID) {
    throw new Error(
      `Configured Studionet chain ID is ${studionet.id}, expected ${STUDIONET_CHAIN_ID}`,
    );
  }

  const sourcePath = resolve(projectRoot, "contracts/firstfault_v2.py");
  const manifestPath = resolve(projectRoot, "deployments/studionet-v2.json");
  const sourceCommit = await readCleanV2SourceCommit(projectRoot);
  const source = await readFile(sourcePath, "utf8");
  const account = createAccount(privateKey);
  const endpoint = process.env.GENLAYER_RPC_URL ?? STUDIONET_ENDPOINT;
  const client = createClient({ chain: studionet, account, endpoint });
  const resumeHash = process.env.GENLAYER_V2_DEPLOYMENT_TX_HASH as
    | `0x${string}`
    | undefined;

  console.info("FirstFault V2 deployment preflight", {
    network: "studionet",
    chainId: STUDIONET_CHAIN_ID,
    deployerAddress: account.address,
    sourcePath: "contracts/firstfault_v2.py",
    sourceCommit,
    sourceSha256: sha256Hex(normalizeSource(source)),
    manifestPath: "deployments/studionet-v2.json",
    mode: resumeHash ? "resume" : "deploy",
  });

  const deploymentInput = {
    client: client as V2DeploymentClient,
    source,
    sourceCommit,
    manifestPath,
    deployerAddress: account.address,
    explorerUrl: STUDIONET_EXPLORER,
    onSubmitted: ({ deploymentTransactionHash, deployerAddress }: {
      deploymentTransactionHash: `0x${string}`;
      deployerAddress: `0x${string}`;
    }) => {
      console.info("FirstFault V2 deployment submitted", {
        network: "studionet",
        deployerAddress,
        deploymentTransactionHash,
      });
    },
  };
  const manifest = resumeHash
    ? await resumeFirstFaultV2Deployment(deploymentInput, resumeHash)
    : await deployFirstFaultV2(deploymentInput);
  console.info(
    "FirstFault V2 deployment verified",
    v2DeploymentLogFields(manifest),
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "FirstFault V2 deployment failed";
  console.error(
    redactSecrets(message, [process.env.GENLAYER_DEPLOYER_PRIVATE_KEY]),
  );
  process.exitCode = 1;
});
