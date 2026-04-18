import { describe, expect, it } from "vitest";

import { buildTimelineItems, collectFailureReasons, normalizeEvidence } from "./report-data";
import { sampleEvidence } from "./sample-evidence";

describe("normalizeEvidence", () => {
  it("derives summary counts from step evidence when needed", () => {
    const normalized = normalizeEvidence({
      run: {
        name: "Minimal payload"
      },
      steps: [
        {
          title: "Open page",
          type: "navigate",
          status: "passed",
          assertions: [{ label: "Page opened", status: "passed" }]
        },
        {
          title: "Verify result",
          type: "assertText",
          status: "failed",
          reason: "Expected summary banner.",
          assertions: [{ label: "Summary is visible", status: "failed" }]
        }
      ]
    });

    expect(normalized.summary.verdict).toBe("failed");
    expect(normalized.summary.steps).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0
    });
    expect(normalized.summary.assertions.failed).toBe(1);
    expect(normalized.run.name).toBe("Minimal payload");
  });
});

describe("buildTimelineItems", () => {
  it("creates a combined timeline with child assertion, console, and network evidence", () => {
    const timeline = buildTimelineItems(sampleEvidence);

    expect(timeline.some((item) => item.kind === "step")).toBe(true);
    expect(timeline.some((item) => item.kind === "assertion" && item.status === "failed")).toBe(true);
    expect(timeline.some((item) => item.kind === "console")).toBe(true);
    expect(timeline.some((item) => item.kind === "network" && item.status === "failed")).toBe(true);
  });
});

describe("collectFailureReasons", () => {
  it("surfaces root causes from failed assertions and runtime evidence", () => {
    const reasons = collectFailureReasons(sampleEvidence);

    expect(reasons.some((reason) => reason.kind === "step")).toBe(true);
    expect(reasons.some((reason) => reason.kind === "assertion")).toBe(true);
    expect(reasons.some((reason) => reason.kind === "console")).toBe(true);
    expect(reasons.some((reason) => reason.kind === "network")).toBe(true);
  });
});
