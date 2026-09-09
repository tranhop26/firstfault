import { describe, expect, test, vi } from "vitest";

import {
  readCleanV2SourceCommit,
  type GitRunner,
} from "../../../scripts/v2SourceRevision";

const SOURCE_COMMIT = "a".repeat(40);

function successfulRunner() {
  const runGit = vi.fn<GitRunner>(async (args) => {
    if (args[0] === "status") return "";
    if (args[0] === "rev-parse") return `${SOURCE_COMMIT}\n`;
    return "contracts/firstfault_v2.py\n";
  });
  return runGit;
}

describe("FirstFault V2 source revision gate", () => {
  test("returns HEAD only after proving the V2 source is tracked and clean", async () => {
    const runGit = successfulRunner();

    await expect(readCleanV2SourceCommit("C:/repo", runGit)).resolves.toBe(
      SOURCE_COMMIT,
    );
    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ["ls-files", "--error-unmatch", "--", "contracts/firstfault_v2.py"],
      "C:/repo",
    );
    expect(runGit).toHaveBeenNthCalledWith(
      2,
      ["status", "--porcelain", "--", "contracts/firstfault_v2.py"],
      "C:/repo",
    );
    expect(runGit).toHaveBeenNthCalledWith(
      3,
      ["rev-parse", "HEAD"],
      "C:/repo",
    );
  });

  test("rejects a V2 source that is not tracked", async () => {
    const runGit = vi.fn<GitRunner>(async () => {
      throw new Error("pathspec did not match");
    });

    await expect(readCleanV2SourceCommit("C:/repo", runGit)).rejects.toThrow(
      "V2 source must be tracked",
    );
    expect(runGit).toHaveBeenCalledTimes(1);
  });

  test("rejects tracked V2 source with staged or unstaged changes", async () => {
    const runGit = successfulRunner();
    runGit.mockImplementation(async (args) => {
      if (args[0] === "status") return " M contracts/firstfault_v2.py\n";
      return "contracts/firstfault_v2.py\n";
    });

    await expect(readCleanV2SourceCommit("C:/repo", runGit)).rejects.toThrow(
      "V2 source has uncommitted changes",
    );
    expect(runGit).toHaveBeenCalledTimes(2);
  });

  test.each(["", "A".repeat(40), "a".repeat(39), `0x${"a".repeat(40)}`])(
    "rejects malformed HEAD output %#",
    async (head) => {
      const runGit = successfulRunner();
      runGit.mockImplementation(async (args) => {
        if (args[0] === "status") return "";
        if (args[0] === "rev-parse") return head;
        return "contracts/firstfault_v2.py\n";
      });

      await expect(readCleanV2SourceCommit("C:/repo", runGit)).rejects.toThrow(
        "Invalid V2 source commit",
      );
    },
  );
});
