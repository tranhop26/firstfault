import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

import {
  deployFirstFaultV3,
  resumeFirstFaultV3Deployment,
  type V3DeploymentClient,
} from "../scripts/deployFirstFaultV3";
import {
  assertPrivateKey,
  normalizeSource,
  redactSecrets,
  sha256Hex,
} from "../scripts/deploymentEvidence";
import { readCleanV3SourceCommit } from "../scripts/v3SourceRevision";
import { v3DeploymentLogFields } from "../scripts/writeV3DeploymentManifest";

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

  const sourcePath = resolve(projectRoot, "contracts/firstfault_v3.py");
  const manifestPath = resolve(projectRoot, "deployments/studionet-v3.json");
  const sourceCommit = await readCleanV3SourceCommit(projectRoot);
  const source = await readFile(sourcePath, "utf8");
  const account = createAccount(privateKey);
  const endpoint = process.env.GENLAYER_RPC_URL ?? STUDIONET_ENDPOINT;
  const client = createClient({ chain: studionet, account, endpoint });
  const resumeHash = process.env.GENLAYER_V3_DEPLOYMENT_TX_HASH as
    | `0x${string}`
    | undefined;

  console.info("FirstFault V3 deployment preflight", {
    network: "studionet",
    chainId: STUDIONET_CHAIN_ID,
    deployerAddress: account.address,
    sourcePath: "contracts/firstfault_v3.py",
    sourceCommit,
    sourceSha256: sha256Hex(normalizeSource(source)),
    manifestPath: "deployments/studionet-v3.json",
    mode: resumeHash ? "resume" : "deploy",
  });

  const deploymentInput = {
    client: client as V3DeploymentClient,
    source,
    sourceCommit,
    manifestPath,
    deployerAddress: account.address,
    explorerUrl: STUDIONET_EXPLORER,
    onSubmitted: ({ deploymentTransactionHash, deployerAddress }: {
      deploymentTransactionHash: `0x${string}`;
      deployerAddress: `0x${string}`;
    }) => {
      console.info("FirstFault V3 deployment submitted", {
        network: "studionet",
        deployerAddress,
        deploymentTransactionHash,
      });
    },
  };
  const manifest = resumeHash
    ? await resumeFirstFaultV3Deployment(deploymentInput, resumeHash)
    : await deployFirstFaultV3(deploymentInput);
  console.info(
    "FirstFault V3 deployment verified",
    v3DeploymentLogFields(manifest),
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "FirstFault V3 deployment failed";
  console.error(
    redactSecrets(message, [process.env.GENLAYER_DEPLOYER_PRIVATE_KEY]),
  );
  process.exitCode = 1;
});
