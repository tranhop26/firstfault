import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const root = readJson("../../../package.json");
const frontend = readJson("../../package.json");
const lock = readJson("../../../package-lock.json");

describe("Studio Next release dependencies", () => {
  it.each([
    ["genlayer-js", "2.0.0-rc.1"],
    ["@genlayer/transaction-kit", "0.1.0-rc.2"],
    ["@genlayer/transaction-kit-react", "0.1.0-rc.2"],
  ])("pins %s to %s in package metadata and the npm lock", (name, version) => {
    expect(frontend.dependencies[name]).toBe(version);
    expect(lock.packages.frontend.dependencies[name]).toBe(version);
    const entry = lock.packages[`frontend/node_modules/${name}`]
      ?? lock.packages[`node_modules/${name}`];
    expect(entry.version).toBe(version);
    expect(entry.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    expect(entry.integrity).toMatch(/^sha512-/);
  });

  it("uses the same exact SDK version for deploy and frontend code", () => {
    expect(root.devDependencies["genlayer-js"]).toBe("2.0.0-rc.1");
    expect(frontend.dependencies["genlayer-js"]).toBe(root.devDependencies["genlayer-js"]);
  });
});
