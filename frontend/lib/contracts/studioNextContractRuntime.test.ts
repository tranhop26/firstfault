import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const STUDIO_NEXT_RUNNER =
  "# { \"Depends\": \"py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng\" }";

describe("Studio Next contract runtime", () => {
  it("uses the v0.3 contract and storage API accepted by Studio Next", async () => {
    const source = await readFile(
      resolve(process.cwd(), "../contracts/firstfault_v3.py"),
      "utf8",
    );

    expect(source.split(/\r?\n/, 1)[0]).toBe(STUDIO_NEXT_RUNNER);
    expect(source).toContain("import genlayer as gl");
    expect(source).toContain("from genlayer.types import *");
    expect(source).toContain("class FirstFault(gl.contract.Contract):");
    expect(source).toContain(
      "from genlayer.storage import allow as allow_storage",
    );
    expect(source).toContain("@allow_storage");
    expect(source).toContain("gl.storage.TreeMap[");
    expect(source).toContain('gl.message.raw.get("datetime", "")');

    expect(source).not.toContain("from genlayer import *");
    expect(source).not.toContain("class FirstFault(gl.Contract):");
    expect(source).not.toContain("gl.message_raw");
    expect(source).not.toMatch(/\b(?:bigint|u(?:8|16|32|64|128|256))\s*\(/);
  });
});
