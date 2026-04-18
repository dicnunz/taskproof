import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

export const repoRoot = path.resolve(import.meta.dirname, "..", "..");
export const demoSpecsDir = path.join(repoRoot, "demo", "specs");
export const demoAppSrcDir = path.join(repoRoot, "apps", "demo-app", "src");

export type DemoStep =
  | { type: "navigate"; url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "press"; selector?: string; key: string }
  | { type: "wait"; ms?: number; selector?: string; state?: "visible" | "hidden" | "attached" | "detached" }
  | { type: "assertText"; selector: string; text: string; match?: "includes" | "exact" }
  | { type: "assertVisible"; selector: string; visible?: boolean }
  | { type: "assertUrl"; value: string; match?: "includes" | "exact" }
  | { type: "assertCount"; selector: string; count: number };

export interface DemoSpec {
  id: string;
  name: string;
  description?: string;
  viewport?: {
    width: number;
    height: number;
  };
  steps: DemoStep[];
  expectedStatus: "passed" | "failed";
  expectedMessageIncludes?: string;
  sourcePath: string;
}

export const supportedStepTypes: DemoStep["type"][] = [
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

const walkFiles = (targetDir: string): string[] =>
  readdirSync(targetDir).flatMap((entry) => {
    const resolvedEntry = path.join(targetDir, entry);
    const entryStats = statSync(resolvedEntry);
    if (entryStats.isDirectory()) {
      return walkFiles(resolvedEntry);
    }

    return resolvedEntry;
  });

const readStructured = <Value>(filePath: string): Value => {
  const source = readFileSync(filePath, "utf8");

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYaml(source) as Value;
  }

  return JSON.parse(source) as Value;
};

const expectedFailures: Record<string, string> = {
  "regression-catch": "4 visible tasks in Inbox."
};

export const loadDemoSpecs = (): DemoSpec[] =>
  walkFiles(demoSpecsDir)
    .filter(
      (filePath) =>
        filePath.endsWith(".json") || filePath.endsWith(".yaml") || filePath.endsWith(".yml")
    )
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => {
      const id = path.basename(filePath, path.extname(filePath));
      const parsed = readStructured<
        Omit<DemoSpec, "sourcePath" | "id" | "expectedStatus" | "expectedMessageIncludes">
      >(filePath);
      return {
        id,
        ...parsed,
        expectedStatus: id in expectedFailures ? "failed" : "passed",
        expectedMessageIncludes: expectedFailures[id],
        sourcePath: filePath
      };
    });

export const validateSpec = (spec: DemoSpec): string[] => {
  const errors: string[] = [];

  if (spec.id.trim().length === 0) {
    errors.push("Spec id is required.");
  }

  if (spec.steps.length === 0) {
    errors.push(`${spec.id}: at least one step is required.`);
  }

  if (spec.name.trim().length === 0) {
    errors.push(`${spec.id}: name is required.`);
  }

  if (
    spec.viewport !== undefined &&
    (!Number.isFinite(spec.viewport.width) ||
      !Number.isFinite(spec.viewport.height) ||
      spec.viewport.width < 320 ||
      spec.viewport.height < 320)
  ) {
    errors.push(`${spec.id}: viewport must be at least 320 by 320.`);
  }

  spec.steps.forEach((step, index) => {
    const prefix = `${spec.id}: step ${index + 1}`;

    switch (step.type) {
      case "navigate":
        if (step.url.trim().length === 0) {
          errors.push(`${prefix}: navigate url is required.`);
        }
        break;
      case "assertUrl":
        if (step.value.trim().length === 0) {
          errors.push(`${prefix}: assertUrl value is required.`);
        }
        break;
      case "click":
        if (step.selector.trim().length === 0) {
          errors.push(`${prefix}: selector is required.`);
        }
        break;
      case "fill":
        if (step.selector.trim().length === 0) {
          errors.push(`${prefix}: selector is required.`);
        }
        if (step.value.length === 0) {
          errors.push(`${prefix}: fill value is required.`);
        }
        break;
      case "press":
        if (step.key.trim().length === 0) {
          errors.push(`${prefix}: key is required.`);
        }
        break;
      case "wait":
        if (step.ms === undefined && step.selector === undefined) {
          errors.push(`${prefix}: wait needs ms or selector.`);
        }
        if (step.ms !== undefined && (!Number.isFinite(step.ms) || step.ms < 0)) {
          errors.push(`${prefix}: wait ms must be a non-negative number.`);
        }
        break;
      case "assertText":
        if (step.selector.trim().length === 0 || step.text.trim().length === 0) {
          errors.push(`${prefix}: selector and text are required.`);
        }
        break;
      case "assertVisible":
        if (step.selector.trim().length === 0) {
          errors.push(`${prefix}: selector is required.`);
        }
        break;
      case "assertCount":
        if (step.selector.trim().length === 0 || step.count < 0) {
          errors.push(`${prefix}: selector and non-negative count are required.`);
        }
        break;
      default:
        errors.push(`${prefix}: unsupported step type.`);
    }
  });

  return errors;
};

const selectorTestIdPattern = /\[data-testid="([^"]+)"\]/;
const dataTestIdPattern = /data-testid="([^"]+)"/g;

export const extractSpecTestIds = (specs: DemoSpec[]): string[] =>
  specs.flatMap((spec) =>
    spec.steps.flatMap((step) => {
      if (!("selector" in step) || step.selector === undefined) {
        return [];
      }

      const match = selectorTestIdPattern.exec(step.selector);
      if (match === null || match[1] === undefined) {
        return [];
      }

      const testId = match[1];
      return testId === undefined ? [] : [testId];
    })
  );

export const collectDemoAppTestIds = (): Set<string> => {
  const testIds = new Set<string>();

  walkFiles(demoAppSrcDir)
    .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    .forEach((filePath) => {
      const fileContents = readFileSync(filePath, "utf8");
      for (const match of fileContents.matchAll(dataTestIdPattern)) {
        if (match[1] !== undefined) {
          testIds.add(match[1]);
        }
      }
    });

  return testIds;
};

export const dynamicTestIdPrefixes = ["toggle-"];
