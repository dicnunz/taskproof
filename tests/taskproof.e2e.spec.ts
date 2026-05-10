import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL("..", import.meta.url));

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

test("taskproof generates a local report and evidence bundle", async ({ baseURL, page }) => {
  const outputDir = await mkdtemp(join(tmpdir(), "taskproof-e2e-"));
  const specPath = join(rootDir, "demo/specs/diagnostics-sync.yaml");

  await execFileAsync(npmCommand(), ["--workspace", "@taskproof/report-ui", "run", "build"], {
    cwd: rootDir
  });

  await execFileAsync(
    npmCommand(),
    [
      "run",
      "taskproof",
      "--",
      "run",
      "--url",
      baseURL ?? "http://127.0.0.1:43173",
      "--spec",
      specPath,
      "--out",
      outputDir
    ],
    {
      cwd: rootDir
    }
  );

  const bundle = JSON.parse(await readFile(join(outputDir, "bundle.json"), "utf8")) as {
    summary: { networkFailureCount: number };
    consoleEvents: Array<{ type: string }>;
  };

  expect(bundle.summary.networkFailureCount).toBeGreaterThan(0);
  expect(bundle.consoleEvents.some((event) => event.type === "error")).toBeTruthy();

  await page.goto(pathToFileURL(join(outputDir, "report/index.html")).toString());
  await expect(page.getByText("TaskProof", { exact: true })).toBeVisible();
  await expect(page.getByText("Diagnostics sync captures backend failure")).toBeVisible();
  await expect(page.getByText("Rerun command")).toBeVisible();
  await expect(page.getByRole("link", { name: "Optional $5 support receipt" })).toHaveAttribute(
    "href",
    "https://nicdunz.gumroad.com/l/smrimu"
  );
  await expect(page.getByRole("link", { name: "Operator OS kit $39" })).toHaveAttribute(
    "href",
    "https://nicdunz.gumroad.com/l/agent-browser-operator-os"
  );
  await expect(page.getByRole("link", { name: "Mini audit $149" })).toHaveAttribute(
    "href",
    "https://nicdunz.gumroad.com/l/agent-workflow-mini-audit"
  );
  await expect(page.getByRole("link", { name: "Workflow audit $750" })).toHaveAttribute(
    "href",
    "https://nicdunz.gumroad.com/l/agent-workflow-audit"
  );
  await expect(page.getByText("provide account access")).toBeVisible();
  await expect(page.getByText("public actions stay human-approved")).toBeVisible();
  await expect(page.getByText("does not fix the Codex Chrome plugin")).toBeVisible();
  await expect(page.getByText("legal, financial, or security advice")).toBeVisible();
  await expect(page.getByText("No app credentials")).toBeVisible();
});
