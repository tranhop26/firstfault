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

import { EXPECTED_FIRSTFAULT_V3_METHODS } from "../../../scripts/v3DeploymentEvidence";
import {
  assertV3DeploymentManifestAbsent,
  buildV3DeploymentManifest,
  type V3DeploymentManifestInput,
  type V3ManifestFileOps,
  v3DeploymentLogFields,
  writeV3DeploymentManifestAtomically,
} from "../../../scripts/writeV3DeploymentManifest";

const CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
const DEPLOYER_ADDRESS = "0x2222222222222222222222222222222222222222";
const PREDECESSOR_ADDRESS = "0x24c060E5394b5bD14a5546B055A7F049f9842987";
const TRANSACTION_HASH = `0x${"a".repeat(64)}`;
const SOURCE_DIGEST = "b".repeat(64);
const SOURCE_COMMIT = "c".repeat(40);
const createdDirectories: string[] = [];

function validInput(): V3DeploymentManifestInput {
  return {
    contractAddress: CONTRACT_ADDRESS,
    deploymentTransactionHash: TRANSACTION_HASH,
    deployerAddress: DEPLOYER_ADDRESS,
    sourceCommit: SOURCE_COMMIT,
    sourceSha256: SOURCE_DIGEST,
    deployedSourceSha256: SOURCE_DIGEST,
    expectedMethods: EXPECTED_FIRSTFAULT_V3_METHODS,
    executionResult: "FINISHED_WITH_RETURN",
    deployedAt: "2026-09-09T00:00:00.000Z",
    explorerUrl: `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`,
    transactionExplorerUrl: `https://explorer-studio.genlayer.com/tx/${TRANSACTION_HASH}`,
    predecessor: PREDECESSOR_ADDRESS,
    successor: null,
  };
}

function missingFileError() {
  return Object.assign(new Error("missing"), { code: "ENOENT" });
}

function fakeFileOps(
  overrides: Partial<V3ManifestFileOps> = {},
): V3ManifestFileOps {
  return {
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async () => {
      throw missingFileError();
    }),
    writeFile: vi.fn(async () => undefined),
    link: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("FirstFault V3 deployment manifest", () => {
  test("builds separately versioned frozen Studionet evidence", () => {
    const manifest = buildV3DeploymentManifest(validInput());

    expect(manifest).toEqual({
      schemaVersion: 1,
      project: "FirstFault",
      contractVersion: "v3",
      network: "studionet",
      chainId: 61999,
      classification: "INTENTIONALLY_FROZEN",
      contractAddress: CONTRACT_ADDRESS,
      deploymentTransactionHash: TRANSACTION_HASH,
      deployerAddress: DEPLOYER_ADDRESS,
      sourcePath: "contracts/firstfault_v3.py",
      sourceCommit: SOURCE_COMMIT,
      sourceSha256: SOURCE_DIGEST,
      deployedSourceSha256: SOURCE_DIGEST,
      constructorArgs: [],
      expectedMethods: [...EXPECTED_FIRSTFAULT_V3_METHODS],
      receiptStatus: "FINALIZED",
      executionResult: "FINISHED_WITH_RETURN",
      deployedAt: "2026-09-09T00:00:00.000Z",
      explorerUrl: `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`,
      transactionExplorerUrl: `https://explorer-studio.genlayer.com/tx/${TRANSACTION_HASH}`,
      predecessor: PREDECESSOR_ADDRESS,
      successor: null,
    });
  });

  test.each([
    [{ contractAddress: "0x0" }, "contract address"],
    [{ deployerAddress: "0x0" }, "deployer address"],
    [{ predecessor: "0x3333333333333333333333333333333333333333" }, "predecessor"],
    [{ deploymentTransactionHash: "0x12" }, "transaction hash"],
    [{ sourceCommit: "A".repeat(40) }, "source commit"],
    [{ sourceSha256: "A".repeat(64) }, "source SHA-256"],
    [{ deployedSourceSha256: "d".repeat(64) }, "source mismatch"],
    [{ expectedMethods: EXPECTED_FIRSTFAULT_V3_METHODS.slice(1) }, "method set"],
    [{ executionResult: "FINISHED_WITH_ERROR" }, "execution result"],
    [{ deployedAt: "Friday" }, "timestamp"],
    [{ explorerUrl: "https://example.com/address/1" }, "explorer URL"],
    [{ transactionExplorerUrl: "https://example.com/tx/1" }, "transaction explorer URL"],
  ])("rejects malformed V3 evidence %#", (override, message) => {
    expect(() =>
      buildV3DeploymentManifest({ ...validInput(), ...override } as V3DeploymentManifestInput),
    ).toThrow(message);
  });

  test("copies only approved fields into evidence and safe logs", () => {
    const unsafeInput = {
      ...validInput(),
      privateKey: `0x${"e".repeat(64)}`,
    } as V3DeploymentManifestInput;
    const manifest = buildV3DeploymentManifest(unsafeInput);

    expect(JSON.stringify(manifest)).not.toContain("privateKey");
    expect(v3DeploymentLogFields(manifest)).toEqual({
      network: "studionet",
      contractAddress: CONTRACT_ADDRESS,
      deploymentTransactionHash: TRANSACTION_HASH,
      deployerAddress: DEPLOYER_ADDRESS,
      sourceSha256: SOURCE_DIGEST,
      sourceCommit: SOURCE_COMMIT,
      status: "verified",
    });
  });

  test("refuses an existing V3 manifest without changing it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-v3-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet-v3.json");
    await writeFile(path, "existing", "utf8");

    await expect(
      writeV3DeploymentManifestAtomically(path, validInput()),
    ).rejects.toThrow("V3 deployment manifest already exists");
    expect(await readFile(path, "utf8")).toBe("existing");
  });

  test("writes valid V3 evidence atomically without a temporary file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-v3-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet-v3.json");

    const manifest = await writeV3DeploymentManifestAtomically(path, validInput());

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(manifest);
    expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("publishes with an exclusive link so a concurrent writer cannot replace evidence", async () => {
    const link = vi.fn(async () => {
      throw Object.assign(new Error("destination exists"), { code: "EEXIST" });
    });
    const operations = {
      ...fakeFileOps(),
      link,
    };

    await expect(
      writeV3DeploymentManifestAtomically(
        "C:/evidence/studionet-v3.json",
        validInput(),
        operations,
      ),
    ).rejects.toThrow("destination exists");
    expect(link).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      "C:/evidence/studionet-v3.json",
    );
    expect(operations.rm).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), {
      force: true,
    });
  });

  test("removes the temporary file when exclusive publication fails", async () => {
    const operations = fakeFileOps({
      link: vi.fn(async () => {
        throw new Error("disk failure");
      }),
    });

    await expect(
      writeV3DeploymentManifestAtomically(
        "C:/evidence/studionet-v3.json",
        validInput(),
        operations,
      ),
    ).rejects.toThrow("disk failure");
    expect(operations.rm).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), {
      force: true,
    });
  });

  test("manifest absence accepts only ENOENT and propagates other failures", async () => {
    const missing = { access: vi.fn(async () => { throw missingFileError(); }) };
    await expect(
      assertV3DeploymentManifestAbsent("C:/evidence/studionet-v3.json", missing),
    ).resolves.toBeUndefined();

    const denied = {
      access: vi.fn(async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      }),
    };
    await expect(
      assertV3DeploymentManifestAbsent("C:/evidence/studionet-v3.json", denied),
    ).rejects.toThrow("permission denied");
  });

  test("manifest absence rejects a file that is present", async () => {
    const directory = await mkdtemp(join(tmpdir(), "firstfault-v3-manifest-"));
    createdDirectories.push(directory);
    const path = join(directory, "studionet-v3.json");

    await expect(assertV3DeploymentManifestAbsent(path)).resolves.toBeUndefined();
    await writeFile(path, "existing", "utf8");
    await expect(assertV3DeploymentManifestAbsent(path)).rejects.toThrow(
      "V3 deployment manifest already exists",
    );
    await expect(access(path)).resolves.toBeUndefined();
  });
});
