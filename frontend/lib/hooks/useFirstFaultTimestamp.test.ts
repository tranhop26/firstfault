import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FirstFault evidence timestamp wiring", () => {
  it("uses the shared safe timestamp for step and cure submissions", async () => {
    const source = await readFile(
      resolve(process.cwd(), "lib/hooks/useFirstFault.ts"),
      "utf8",
    );

    expect(source).toContain(
      'import { observationTimestamp } from "../firstfault/observationTimestamp";',
    );
    expect(source.match(/observationTimestamp\(\)/g)).toHaveLength(2);
    expect(source).not.toMatch(
      /submit(?:Step|Cure)[\s\S]{0,240}Date\.now\(\)/,
    );
  });
});
