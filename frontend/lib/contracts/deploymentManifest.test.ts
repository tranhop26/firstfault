import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EXPECTED_FIRSTFAULT_METHODS } from "../../../scripts/deploymentEvidence";
import {
  assertDeploymentManifestAbsent,
  buildDeploymentManifest,
  deploymentLogFields,
  type DeploymentManifestInput,
  type ManifestFileOps,
  writeDeploymentManifestAtomically,
} from "../../../scripts/writeDeploymentManifest";

const CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
const DEPLOYER_ADDRESS = "0x2222222222222222222222222222222222222222";
const TRANSACTION_HASH = `0x${"a".repeat(64)}`;
const SOURCE_DIGEST = "b".repeat(64);
const createdDirectories: string[] = [];

function validInput(): DeploymentManifestInput {
  return {
    contractAddress: CONTRACT_ADDRESS,
    deploymentTransactionHash: TRANSACTION_HASH,
    deployerAddress: DEPLOYER_ADDRESS,
    sourceSha256: SOURCE_DIGEST,
    deployedSourceSha256: SOURCE_DIGEST,
    expectedMethods: EXPECTED_FIRSTFAULT_METHODS,
    executionResult: "FINISHED_WITH_RETURN",
    deployedAt: "2026-09-05T00:00:00.000Z",
    explorerUrl: `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`,
    transactionExplorerUrl: `https://explorer-studio.genlayer.com/tx/${TRANSACTION_HASH}`,
    predecessor: null,
    successor: null,
  };
}

function missingFileError() {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

function fakeFileOps(
  overrides: Partial<ManifestFileOps> = {},
): ManifestFileOps {
  return {
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async () => {
      throw missingFileError();
    }),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("FirstFault deployment manifest", () => {
  test("builds frozen Studionet evidence without private material", () => {
    const manifest = buildDeploymentManifest(validInput());

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      project: "FirstFault",
      network: "studionet",
      chainId: 61999,
      classification: "INTENTIONALLY_FROZEN",
      sourcePath: "contracts/firstfault.py",
      constructorArgs: [],
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
    });
    expect(manifest.sourceSha256).toBe(manifest.deployedSourceSha256);
    expect(manifest.expectedMethods).toEqual(EXPECTED_FIRSTFAULT_METHODS);
    expect(JSON.stringify(manifest)).not.toMatch(/private.?key/i);
  });

  test.each([
    [{ contractAddress: "0x0" }, "contract address"],
    [{ deploymentTransactionHash: "0x12" }, "transaction hash"],
    [{ deployerAddress: "0x0" }, "deployer address"],
    [{ sourceSha256: "A".repeat(64) }, "source SHA-256"],
    [{ deployedSourceSha256: "c".repeat(64) }, "source mismatch"],
    [{ expectedMethods: EXPECTED_FIRSTFAULT_METHODS.slice(1) }, "method set"],
    [{ deployedAt: "Friday" }, "timestamp"],
    [{ explorerUrl: "http://example.com/address/1" }, "explorer URL"],
  ])("rejects malformed manifest evidence %#", (override, message) => {
    expect(() => buildDeploymentManifest({ ...validInput(), ...override })).toThrow(
      message,
    );
  });

  test("safe log fields cannot expose unapproved manifest data", () => {
    expect(deploymentLogFields(buildDeploymentManifest(validInput()))).toEqual({
      network: "studionet",
      contractAddress: CONTRACT_ADDRESS,
      deploymentTransactionHash: TRANSACTION_HASH,
      deployerAddress: DEPLOYER_ADDRESS,
      sourceSha256: SOURCE_DIGEST,
      status: "verified",
    });
  });

  test("refuses an existing manifest without changing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet.json");
    await writeFile(path, "existing", "utf8");

    await expect(writeDeploymentManifestAtomically(path, validInput())).rejects.toThrow(
      "already exists",
    );
    expect(await readFile(path, "utf8")).toBe("existing");
  });

  test("writes valid JSON atomically and leaves no temporary file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet.json");

    const manifest = await writeDeploymentManifestAtomically(path, validInput());

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(manifest);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
  });

  test("removes the temporary file when the atomic rename fails", async () => {
    const rename = vi.fn(async () => {
      throw new Error("disk failure");
    });
    const operations = fakeFileOps({ rename });

    await expect(
      writeDeploymentManifestAtomically(
        "C:/evidence/studionet.json",
        validInput(),
        operations,
      ),
    ).rejects.toThrow("disk failure");
    expect(operations.rm).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      { force: true },
    );
  });

  test("manifest absence check propagates unexpected filesystem failures", async () => {
    const operations = {
      access: vi.fn(async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      }),
    };

    await expect(
      assertDeploymentManifestAbsent("C:/evidence/studionet.json", operations),
    ).rejects.toThrow("permission denied");
  });

  test("manifest absence check accepts only a missing file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet.json");

    await expect(assertDeploymentManifestAbsent(path)).resolves.toBeUndefined();
    await writeFile(path, "existing", "utf8");
    await expect(assertDeploymentManifestAbsent(path)).rejects.toThrow("already exists");
    await expect(access(path)).resolves.toBeUndefined();
  });
});
