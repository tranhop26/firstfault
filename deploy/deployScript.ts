import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

import {
  assertPrivateKey,
  normalizeSource,
  redactSecrets,
  sha256Hex,
} from "../scripts/deploymentEvidence";
import {
  deployFirstFault,
  type DeploymentClient,
} from "../scripts/deployFirstFault";
import { deploymentLogFields } from "../scripts/writeDeploymentManifest";

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

  const sourcePath = resolve(projectRoot, "contracts/firstfault.py");
  const manifestPath = resolve(projectRoot, "deployments/studionet.json");
  const source = await readFile(sourcePath, "utf8");
  const account = createAccount(privateKey);
  const endpoint = process.env.GENLAYER_RPC_URL ?? STUDIONET_ENDPOINT;
  const client = createClient({ chain: studionet, account, endpoint });

  console.info("FirstFault deployment preflight", {
    network: "studionet",
    chainId: STUDIONET_CHAIN_ID,
    deployerAddress: account.address,
    sourcePath: "contracts/firstfault.py",
    sourceSha256: sha256Hex(normalizeSource(source)),
  });

  const manifest = await deployFirstFault({
    client: client as DeploymentClient,
    source,
    manifestPath,
    deployerAddress: account.address,
    explorerUrl: STUDIONET_EXPLORER,
    onSubmitted: ({ deploymentTransactionHash, deployerAddress }) => {
      console.info("FirstFault deployment submitted", {
        network: "studionet",
        deployerAddress,
        deploymentTransactionHash,
      });
    },
  });
  console.info("FirstFault deployment verified", deploymentLogFields(manifest));
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "FirstFault deployment failed";
  console.error(
    redactSecrets(message, [process.env.GENLAYER_DEPLOYER_PRIVATE_KEY]),
  );
  process.exitCode = 1;
});
