import { expect, type Page } from "@playwright/test";

import type { DemoSpec, DemoStep } from "./demoSpecs";

const renderStepError = (
  selector: string,
  expected: string,
  actual: string | number
): string => `Expected ${selector} to contain "${expected}" but received "${String(actual)}".`;

const assertText = async (
  page: Page,
  selector: string,
  text: string,
  match: "includes" | "exact" = "includes"
): Promise<void> => {
  const actualText = (await page.locator(selector).textContent())?.replace(/\s+/g, " ").trim() ?? "";
  const passed = match === "exact" ? actualText === text : actualText.includes(text);
  if (!passed) {
    throw new Error(renderStepError(selector, text, actualText));
  }
};

const assertVisible = async (page: Page, selector: string): Promise<void> => {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
};

const assertUrl = async (
  page: Page,
  baseUrl: string,
  value: string,
  match: "includes" | "exact" = "includes"
): Promise<void> => {
  const actualUrl = page.url();
  const expectedUrl = value.startsWith("/") ? `${baseUrl}${value}` : value;
  const passed = match === "exact" ? actualUrl === expectedUrl : actualUrl.includes(expectedUrl);

  if (!passed) {
    throw new Error(`Expected URL to ${match} "${expectedUrl}" but received "${actualUrl}".`);
  }
};

const assertCount = async (
  page: Page,
  selector: string,
  count: number
): Promise<void> => {
  await expect(page.locator(selector)).toHaveCount(count);
};

const executeStep = async (
  page: Page,
  baseUrl: string,
  step: DemoStep
): Promise<void> => {
  switch (step.type) {
    case "navigate":
      await page.goto(`${baseUrl}${step.url}`);
      return;
    case "click":
      await page.locator(step.selector).click();
      return;
    case "fill":
      await page.locator(step.selector).fill(step.value);
      return;
    case "press":
      if (step.selector === undefined) {
        await page.keyboard.press(step.key);
        return;
      }

      await page.locator(step.selector).press(step.key);
      return;
    case "wait":
      if (step.ms !== undefined) {
        await page.waitForTimeout(step.ms);
        return;
      }

      await page.locator(step.selector ?? "body").waitFor({ state: step.state ?? "visible" });
      return;
    case "assertText":
      await assertText(page, step.selector, step.text, step.match);
      return;
    case "assertVisible":
      await assertVisible(page, step.selector);
      return;
    case "assertUrl":
      await assertUrl(page, baseUrl, step.value, step.match);
      return;
    case "assertCount":
      await assertCount(page, step.selector, step.count);
      return;
  }
};

export const runDemoSpec = async (
  page: Page,
  baseUrl: string,
  spec: DemoSpec
): Promise<void> => {
  for (const step of spec.steps) {
    await executeStep(page, baseUrl, step);
  }
};
