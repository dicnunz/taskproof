import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import { chromium, type Page } from "playwright";

import { writeEvidenceBundle } from "./bundle.js";
import type {
  ConsoleEventRecord,
  EvidenceBundle,
  FailureDetail,
  NetworkEventRecord,
  RunOptions,
  RunResult,
  StepAssertion,
  StepResult,
  TaskSpec,
  TaskStep
} from "./model.js";
import { writeStaticReport } from "./report.js";
import { loadTaskSpec } from "./spec.js";

const DEFAULT_VIEWPORT = { width: 1440, height: 960 };
const CONSOLE_LOG_NAME = "console-events.json";
const NETWORK_LOG_NAME = "network-events.json";

function toRunId(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function relativePath(rootDir: string, targetPath: string): string {
  return relative(rootDir, targetPath).replaceAll("\\", "/");
}

function stepId(index: number): string {
  return `step-${String(index + 1).padStart(3, "0")}`;
}

function normalizeInput(step: TaskStep): Record<string, unknown> {
  return Object.fromEntries(Object.entries(step).filter(([, value]) => value !== undefined));
}

function quoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function resolveOutputDir(spec: TaskSpec, specPath: string, outputDir: string | undefined): string {
  if (outputDir) {
    return resolve(process.cwd(), outputDir);
  }

  return resolve(
    process.cwd(),
    "taskproof-runs",
    `${toRunId(new Date())}-${toSlug(spec.name || basename(specPath))}`
  );
}

function ensureFailureDetail(error: unknown): FailureDetail {
  if (error instanceof Error) {
    return {
      message: error.message,
      detail: error.stack
    };
  }

  return {
    message: String(error)
  };
}

export function buildSummary(
  spec: TaskSpec,
  stepResults: StepResult[],
  consoleEvents: ConsoleEventRecord[],
  networkEvents: NetworkEventRecord[],
  durationMs: number
): EvidenceBundle["summary"] {
  const passedSteps = stepResults.filter((result) => result.status === "passed").length;
  const failedSteps = stepResults.filter((result) => result.status === "failed").length;
  const assertionCount = stepResults.reduce(
    (total, result) => total + result.assertions.length,
    0
  );

  return {
    totalSteps: spec.steps.length,
    executedSteps: stepResults.length,
    passedSteps,
    failedSteps,
    assertionCount,
    consoleErrorCount: consoleEvents.length,
    networkFailureCount: networkEvents.length,
    screenshotCount: stepResults.length,
    durationMs,
    score: spec.steps.length === 0 ? 100 : Math.round((passedSteps / spec.steps.length) * 100),
    status: failedSteps > 0 ? "failed" : "passed"
  };
}

async function captureArtifacts(
  page: Page,
  rootDir: string,
  stepKey: string,
  screenshotsDir: string,
  domDir: string
): Promise<{ screenshot: string; domSnapshot: string }> {
  const screenshotPath = join(screenshotsDir, `${stepKey}.png`);
  const domPath = join(domDir, `${stepKey}.html`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(domPath, await page.content(), "utf8");

  return {
    screenshot: relativePath(rootDir, screenshotPath),
    domSnapshot: relativePath(rootDir, domPath)
  };
}

function assertResult(
  passed: boolean,
  kind: StepAssertion["kind"],
  expected: StepAssertion["expected"],
  actual: StepAssertion["actual"],
  detail?: string
): StepAssertion {
  return { kind, passed, expected, actual, detail };
}

async function runStep(page: Page, step: TaskStep): Promise<StepAssertion[]> {
  switch (step.type) {
    case "click":
      await page.locator(step.selector).click();
      return [];
    case "fill":
      await page.locator(step.selector).fill(step.value);
      return [];
    case "press":
      if (step.selector) {
        await page.locator(step.selector).press(step.key);
      } else {
        await page.keyboard.press(step.key);
      }
      return [];
    case "navigate":
      await page.goto(new URL(step.url, page.url()).toString(), {
        waitUntil: step.waitUntil ?? "load"
      });
      return [];
    case "wait":
      if (step.ms) {
        await page.waitForTimeout(step.ms);
        return [];
      }

      await page
        .locator(step.selector ?? "body")
        .waitFor({ state: step.state ?? "visible" });
      return [];
    case "assertText": {
      const actual = ((await page.locator(step.selector).textContent()) ?? "").trim();
      const mode = step.match ?? "includes";
      const passed = mode === "exact" ? actual === step.text : actual.includes(step.text);

      return [
        assertResult(
          passed,
          "text",
          step.text,
          actual,
          `${step.selector} ${mode === "exact" ? "equals" : "contains"} "${step.text}"`
        )
      ];
    }
    case "assertVisible": {
      const expected = step.visible ?? true;
      const actual = await page.locator(step.selector).isVisible();

      return [
        assertResult(actual === expected, "visible", expected, actual, step.selector)
      ];
    }
    case "assertUrl": {
      const actual = page.url();
      const mode = step.match ?? "includes";
      const passed = mode === "exact" ? actual === step.value : actual.includes(step.value);

      return [assertResult(passed, "url", step.value, actual, mode)];
    }
    case "assertCount": {
      const actual = await page.locator(step.selector).count();

      return [assertResult(actual === step.count, "count", step.count, actual, step.selector)];
    }
  }
}

function failingAssertion(assertions: StepAssertion[]): StepAssertion | undefined {
  return assertions.find((assertion) => !assertion.passed);
}

async function safePageTitle(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return "";
  }
}

async function prepareOutputDirectory(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });
  await Promise.all([
    rm(join(rootDir, "artifacts"), { recursive: true, force: true }),
    rm(join(rootDir, "logs"), { recursive: true, force: true }),
    rm(join(rootDir, "report"), { recursive: true, force: true }),
    rm(join(rootDir, "bundle.json"), { force: true }),
    rm(join(rootDir, "spec.json"), { force: true }),
    rm(join(rootDir, "taskproof-evidence.zip"), { force: true }),
    rm(join(rootDir, "rerun.sh"), { force: true })
  ]);
}

export async function executeTaskProof(options: RunOptions): Promise<RunResult> {
  const spec = await loadTaskSpec(options.specPath);
  const targetUrl = new URL(options.url).toString();
  const startedAt = new Date();
  const resolvedOutputDir = resolveOutputDir(spec, options.specPath, options.outputDir);
  const artifactsDir = join(resolvedOutputDir, "artifacts");
  const screenshotsDir = join(artifactsDir, "screenshots");
  const domDir = join(artifactsDir, "dom");
  const logsDir = join(resolvedOutputDir, "logs");
  const reportDir = join(resolvedOutputDir, "report");
  const runId = toRunId(startedAt);
  const specPath = resolve(options.specPath);
  const consoleLogPath = join(logsDir, CONSOLE_LOG_NAME);
  const networkLogPath = join(logsDir, NETWORK_LOG_NAME);
  const rerunScriptPath = join(resolvedOutputDir, "rerun.sh");

  await prepareOutputDirectory(resolvedOutputDir);
  await Promise.all([
    mkdir(screenshotsDir, { recursive: true }),
    mkdir(domDir, { recursive: true }),
    mkdir(logsDir, { recursive: true })
  ]);

  const browser = await chromium.launch({ headless: !options.headed });

  try {
    const page = await browser.newPage({ viewport: spec.viewport ?? DEFAULT_VIEWPORT });
    const consoleEvents: ConsoleEventRecord[] = [];
    const networkEvents: NetworkEventRecord[] = [];
    const stepResults: StepResult[] = [];
    let currentStepId: string | null = null;
    let consoleIndex = 0;
    let networkIndex = 0;

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      consoleEvents.push({
        id: `console-${String(++consoleIndex).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        stepId: currentStepId,
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    });

    page.on("pageerror", (error) => {
      consoleEvents.push({
        id: `console-${String(++consoleIndex).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        stepId: currentStepId,
        type: "error",
        text: `Page error: ${error.stack ?? error.message}`
      });
    });

    page.on("requestfailed", (request) => {
      networkEvents.push({
        id: `network-${String(++networkIndex).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        stepId: currentStepId,
        kind: "requestfailed",
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        failureText: request.failure()?.errorText
      });
    });

    page.on("response", (response) => {
      if (response.status() < 400) {
        return;
      }

      networkEvents.push({
        id: `network-${String(++networkIndex).padStart(3, "0")}`,
        timestamp: new Date().toISOString(),
        stepId: currentStepId,
        kind: "http-error",
        method: response.request().method(),
        url: response.url(),
        resourceType: response.request().resourceType(),
        status: response.status()
      });
    });

    await page.goto(targetUrl, { waitUntil: "load" });

    for (const [index, step] of spec.steps.entries()) {
      const id = stepId(index);
      const started = new Date();
      const startedTime = Date.now();
      let assertions: StepAssertion[] = [];
      let failure: FailureDetail | undefined;

      currentStepId = id;

      try {
        assertions = await runStep(page, step);
        const failedAssertion = failingAssertion(assertions);

        if (failedAssertion) {
          failure = {
            message: `Assertion failed for ${step.type}`,
            detail: failedAssertion.detail
          };
        }
      } catch (error) {
        failure = ensureFailureDetail(error);
      }

      const artifacts = await captureArtifacts(page, resolvedOutputDir, id, screenshotsDir, domDir);
      const finished = new Date();

      stepResults.push({
        id,
        index,
        name: step.name ?? `${index + 1}. ${step.type}`,
        type: step.type,
        status: failure ? "failed" : "passed",
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        durationMs: Date.now() - startedTime,
        input: normalizeInput(step),
        url: page.url(),
        title: await safePageTitle(page),
        assertions,
        failure,
        artifacts
      });

      currentStepId = null;

      if (failure) {
        break;
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const summary = buildSummary(spec, stepResults, consoleEvents, networkEvents, durationMs);
    const rerunCommand = `cd ${quoted(process.cwd())} && npm run taskproof -- run --url ${quoted(
      targetUrl
    )} --spec ${quoted(specPath)} --out ${quoted(resolvedOutputDir)}`;

    await writeFile(join(resolvedOutputDir, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
    await writeFile(consoleLogPath, `${JSON.stringify(consoleEvents, null, 2)}\n`, "utf8");
    await writeFile(networkLogPath, `${JSON.stringify(networkEvents, null, 2)}\n`, "utf8");
    await writeFile(
      rerunScriptPath,
      `#!/usr/bin/env bash\nset -euo pipefail\n${rerunCommand}\n`,
      "utf8"
    );
    await chmod(rerunScriptPath, 0o755);

    const bundle: EvidenceBundle = {
      schemaVersion: "1.0.0",
      run: {
        id: runId,
        name: spec.name,
        specPath,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        status: summary.status,
        outputDir: resolvedOutputDir
      },
      target: {
        initialUrl: targetUrl,
        finalUrl: page.url(),
        title: await safePageTitle(page)
      },
      summary,
      rerun: {
        cwd: process.cwd(),
        command: rerunCommand,
        scriptPath: relativePath(resolvedOutputDir, rerunScriptPath)
      },
      stepResults,
      consoleEvents,
      networkEvents,
      artifacts: {
        specFile: "spec.json",
        reportIndex: "",
        reportAssets: [],
        screenshotsDir: relativePath(resolvedOutputDir, screenshotsDir),
        domSnapshotsDir: relativePath(resolvedOutputDir, domDir),
        consoleLog: relativePath(resolvedOutputDir, consoleLogPath),
        networkLog: relativePath(resolvedOutputDir, networkLogPath),
        zipFile: "taskproof-evidence.zip"
      }
    };

    const report = await writeStaticReport(bundle, resolvedOutputDir, reportDir);
    bundle.artifacts.reportIndex = report.indexPath;
    bundle.artifacts.reportAssets = report.assetPaths;
    await writeFile(join(resolvedOutputDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    const zipPath = join(resolvedOutputDir, "taskproof-evidence.zip");
    await writeEvidenceBundle(resolvedOutputDir, zipPath);

    return {
      bundle,
      outputDir: resolvedOutputDir,
      reportPath: join(resolvedOutputDir, report.indexPath),
      zipPath
    };
  } finally {
    await browser.close();
  }
}
