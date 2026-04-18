import { describe, expect, it } from "vitest";

import type { ConsoleEventRecord, NetworkEventRecord, TaskSpec } from "./model.js";
import { buildSummary } from "./runner.js";

describe("buildSummary", () => {
  it("computes scorecard details from step and event data", () => {
    const spec: TaskSpec = {
      name: "Summary Demo",
      steps: [
        { type: "click", selector: "[data-testid='a']" },
        { type: "assertVisible", selector: "[data-testid='b']" }
      ]
    };
    const consoleEvents: ConsoleEventRecord[] = [
      {
        id: "console-001",
        timestamp: new Date().toISOString(),
        stepId: "step-001",
        type: "error",
        text: "boom"
      }
    ];
    const networkEvents: NetworkEventRecord[] = [
      {
        id: "network-001",
        timestamp: new Date().toISOString(),
        stepId: "step-001",
        kind: "requestfailed",
        method: "GET",
        url: "http://example.test",
        resourceType: "xhr"
      }
    ];

    const summary = buildSummary(
      spec,
      [
        {
          id: "step-001",
          index: 0,
          name: "1. click",
          type: "click",
          status: "passed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 12,
          input: {},
          url: "http://example.test",
          title: "Demo",
          assertions: [],
          artifacts: {
            screenshot: "artifacts/screenshots/step-001.png",
            domSnapshot: "artifacts/dom/step-001.html"
          }
        },
        {
          id: "step-002",
          index: 1,
          name: "2. assertVisible",
          type: "assertVisible",
          status: "failed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 21,
          input: {},
          url: "http://example.test",
          title: "Demo",
          assertions: [
            {
              kind: "visible",
              passed: false,
              expected: true,
              actual: false
            }
          ],
          failure: {
            message: "Assertion failed"
          },
          artifacts: {
            screenshot: "artifacts/screenshots/step-002.png",
            domSnapshot: "artifacts/dom/step-002.html"
          }
        }
      ],
      consoleEvents,
      networkEvents,
      33
    );

    expect(summary.status).toBe("failed");
    expect(summary.score).toBe(50);
    expect(summary.assertionCount).toBe(1);
    expect(summary.consoleErrorCount).toBe(1);
    expect(summary.networkFailureCount).toBe(1);
  });
});
