import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const demoSpecsDir = path.join(repoRoot, "demo", "specs");
const demoAppSrcDir = path.join(repoRoot, "apps", "demo-app", "src");

type DemoStepType =
  | "click"
  | "fill"
  | "press"
  | "navigate"
  | "wait"
  | "assertText"
  | "assertVisible"
  | "assertUrl"
  | "assertCount";

const supportedStepTypes: DemoStepType[] = [
  "navigate",
  "click",
  "fill",
  "press",
  "wait",
  "assertText",
  "assertVisible",
  "assertUrl",
  "assertCount"
];

const dynamicPrefixes = ["toggle-", "view-", "filter-"];
const selectorPattern = /\[data-testid="([^"]+)"\]/;
const literalTestIdPattern = /data-testid="([^"]+)"/g;

const walkFiles = (targetDir: string): string[] =>
  readdirSync(targetDir).flatMap((entry) => {
    const resolvedEntry = path.join(targetDir, entry);
    const entryStats = statSync(resolvedEntry);
    if (entryStats.isDirectory()) {
      return walkFiles(resolvedEntry);
    }

    return resolvedEntry;
  });

const parseStructured = (filePath: string): unknown => {
  const source = readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYaml(source);
  }

  return JSON.parse(source);
};

const specFiles = walkFiles(demoSpecsDir)
  .filter(
    (filePath) =>
      filePath.endsWith(".json") || filePath.endsWith(".yaml") || filePath.endsWith(".yml")
  )
  .sort((left, right) => left.localeCompare(right));

const specs = specFiles.map((filePath) => ({
  id: path.basename(filePath, path.extname(filePath)),
  payload: parseStructured(filePath) as {
    name?: string;
    steps?: Array<{ type?: DemoStepType; selector?: string }>;
  }
}));

const appTestIds = (() => {
  const ids = new Set<string>();
  walkFiles(demoAppSrcDir)
    .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    .forEach((filePath) => {
      const contents = readFileSync(filePath, "utf8");
      for (const match of contents.matchAll(literalTestIdPattern)) {
        if (match[1] !== undefined) {
          ids.add(match[1]);
        }
      }
    });
  return ids;
})();

describe("demo specs", () => {
  it("ship at least five canonical specs", () => {
    expect(specs.length).toBeGreaterThanOrEqual(5);
  });

  it("use the TaskProof CLI spec shape", () => {
    specs.forEach(({ id, payload }) => {
      expect(payload.name?.trim().length, `${id} is missing a name`).toBeGreaterThan(0);
      expect(Array.isArray(payload.steps), `${id} is missing steps`).toBe(true);
      expect(payload.steps?.length ?? 0, `${id} needs at least one step`).toBeGreaterThan(0);
    });
  });

  it("cover every supported step type across the committed demo flow", () => {
    const coveredTypes = new Set(
      specs.flatMap(({ payload }) => payload.steps?.map((step) => step.type) ?? [])
    );
    expect(Array.from(coveredTypes).sort()).toEqual([...supportedStepTypes].sort());
  });

  it("only reference selectors that exist in the live demo app", () => {
    const specTestIds = specs.flatMap(({ payload }) =>
      (payload.steps ?? []).flatMap((step) => {
        if (step.selector === undefined) {
          return [];
        }

        const match = selectorPattern.exec(step.selector);
        if (match === null || match[1] === undefined) {
          return [];
        }

        return [match[1]];
      })
    );

    specTestIds.forEach((testId) => {
      const matchesDynamicPrefix = dynamicPrefixes.some((prefix) => testId.startsWith(prefix));
      expect(
        appTestIds.has(testId) || matchesDynamicPrefix,
        `Missing data-testid="${testId}" in demo app source.`
      ).toBe(true);
    });
  });
});
