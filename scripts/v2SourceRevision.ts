import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const V2_SOURCE_PATH = "contracts/firstfault_v2.py";
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export type GitRunner = (args: string[], cwd: string) => Promise<string>;

const runGitProcess: GitRunner = async (args, cwd) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  return stdout;
};

export async function readCleanV2SourceCommit(
  projectRoot: string,
  runGit: GitRunner = runGitProcess,
): Promise<string> {
  try {
    await runGit(
      ["ls-files", "--error-unmatch", "--", V2_SOURCE_PATH],
      projectRoot,
    );
  } catch {
    throw new Error("V2 source must be tracked");
  }

  const sourceStatus = await runGit(
    ["status", "--porcelain", "--", V2_SOURCE_PATH],
    projectRoot,
  );
  if (sourceStatus.trim() !== "") {
    throw new Error("V2 source has uncommitted changes");
  }

  const sourceCommit = (await runGit(["rev-parse", "HEAD"], projectRoot)).trim();
  if (!COMMIT_PATTERN.test(sourceCommit)) {
    throw new Error("Invalid V2 source commit");
  }
  return sourceCommit;
}
