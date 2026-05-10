import { expect, test } from "@playwright/test";

import { loadDemoSpecs } from "./helpers/demoSpecs";
import { demoBaseUrl } from "./helpers/demoServer";
import { runDemoSpec } from "./helpers/demoRunner";

const specs = loadDemoSpecs();
const passingSpecs = specs.filter((spec) => spec.id !== "regression-catch");
const regressionSpec = specs.find((spec) => spec.id === "regression-catch");

test.describe.configure({ mode: "serial" });

for (const spec of passingSpecs) {
  test(spec.id, async ({ page }) => {
    await page.goto(demoBaseUrl);
    await runDemoSpec(page, demoBaseUrl, spec);
  });
}

test("regression-catch fails deterministically", async ({ page }) => {
  expect(regressionSpec).toBeDefined();
  await page.goto(demoBaseUrl);
  await expect(runDemoSpec(page, demoBaseUrl, regressionSpec!)).rejects.toThrow(
    "4 visible tasks in Inbox."
  );
});
