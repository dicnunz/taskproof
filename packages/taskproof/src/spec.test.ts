import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadTaskSpec } from "./spec.js";

describe("loadTaskSpec", () => {
  it("parses yaml and infers a title from the file name", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taskproof-spec-"));
    const specPath = join(tempDir, "smoke-check.yaml");

    await writeFile(
      specPath,
      `steps:\n  - type: click\n    selector: '[data-testid="go"]'\n  - type: assertUrl\n    value: '/done'\n`,
      "utf8"
    );

    const spec = await loadTaskSpec(specPath);

    expect(spec.name).toBe("Smoke Check");
    expect(spec.steps).toHaveLength(2);
  });

  it("rejects invalid wait steps", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "taskproof-spec-"));
    const specPath = join(tempDir, "broken.json");

    await writeFile(specPath, JSON.stringify({ steps: [{ type: "wait" }] }), "utf8");

    await expect(loadTaskSpec(specPath)).rejects.toThrow(/wait step needs either `ms` or `selector`/);
  });
});
