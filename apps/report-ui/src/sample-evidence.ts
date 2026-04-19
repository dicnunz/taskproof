import type { TaskProofEvidence } from "./types";

export const sampleEvidence: TaskProofEvidence = {
  run: {
    name: "Diagnostics sync captures backend failure",
    taskId: "diagnostics-sync-captures-backend-failure",
    targetUrl: "http://127.0.0.1:43173/",
    specPath: "./demo/specs/diagnostics-sync.yaml",
    startedAt: "2026-04-18T20:36:16.588Z",
    generatedAt: "2026-04-18T20:36:18.557Z",
    durationMs: 1969,
    rerunCommand:
      "npm run taskproof -- run --url 'http://127.0.0.1:43173/' --spec './demo/specs/diagnostics-sync.yaml' --out './artifacts/demo-eval'",
    runnerVersion: "0.1.0"
  },
  summary: {
    verdict: "passed",
    score: {
      earned: 5,
      total: 5,
      percent: 100,
      label: "steps"
    },
    steps: {
      total: 5,
      passed: 5,
      failed: 0,
      skipped: 0
    },
    assertions: {
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0
    },
    consoleErrors: 2,
    networkFailures: 2,
    durationMs: 1969,
    screenshotCount: 5
  },
  steps: [
    {
      id: "step-01",
      index: 0,
      title: "1. click",
      type: "click",
      status: "passed",
      startedAt: "2026-04-18T20:36:16.760Z",
      durationMs: 182,
      selector: "[data-testid='view-diagnostics']",
      url: "http://127.0.0.1:43173/?view=diagnostics",
      screenshot: {
        path: "artifacts/screenshots/step-001.png",
        label: "Open diagnostics view"
      },
      assertions: [],
      console: [],
      network: []
    },
    {
      id: "step-02",
      index: 1,
      title: "2. click",
      type: "click",
      status: "passed",
      startedAt: "2026-04-18T20:36:16.980Z",
      durationMs: 214,
      selector: "[data-testid='run-sync']",
      screenshot: {
        path: "artifacts/screenshots/step-002.png",
        label: "Trigger sync probe"
      },
      assertions: [],
      console: [
        {
          id: "console-01",
          level: "error",
          text: "Failed to load resource: the server responded with a status of 404 (Not Found)",
          timestamp: "2026-04-18T20:36:17.216Z"
        },
        {
          id: "console-02",
          level: "error",
          text: "TaskProof demo sync failed {status: 404, url: /api/sync}",
          timestamp: "2026-04-18T20:36:17.216Z"
        }
      ],
      network: [
        {
          id: "network-01",
          method: "POST",
          url: "http://127.0.0.1:43173/api/sync",
          status: "failed",
          statusCode: 404,
          failureText: "Not Found",
          timestamp: "2026-04-18T20:36:17.216Z"
        },
        {
          id: "network-02",
          method: "POST",
          url: "http://127.0.0.1:43173/api/sync",
          status: "failed",
          failureText: "net::ERR_ABORTED",
          timestamp: "2026-04-18T20:36:17.217Z"
        }
      ]
    },
    {
      id: "step-03",
      index: 2,
      title: "3. wait",
      type: "wait",
      status: "passed",
      startedAt: "2026-04-18T20:36:17.220Z",
      durationMs: 610,
      url: "http://127.0.0.1:43173/?view=diagnostics",
      screenshot: {
        path: "artifacts/screenshots/step-003.png",
        label: "Allow diagnostic state to settle"
      },
      assertions: [],
      console: [],
      network: []
    },
    {
      id: "step-04",
      index: 3,
      title: "4. assertText",
      type: "assertText",
      status: "passed",
      startedAt: "2026-04-18T20:36:17.842Z",
      durationMs: 116,
      selector: "[data-testid='sync-status']",
      url: "http://127.0.0.1:43173/?view=diagnostics",
      screenshot: {
        path: "artifacts/screenshots/step-004.png",
        label: "Confirm graceful sync failure"
      },
      assertions: [
        {
          id: "assert-01",
          label: "Sync status reports the graceful failure",
          status: "passed",
          expected: "Sync failed gracefully.",
          actual: "Sync failed gracefully.",
          message: "[data-testid='sync-status'] equals \"Sync failed gracefully.\""
        }
      ],
      console: [],
      network: []
    },
    {
      id: "step-05",
      index: 4,
      title: "5. assertText",
      type: "assertText",
      status: "passed",
      startedAt: "2026-04-18T20:36:17.976Z",
      durationMs: 121,
      selector: "[data-testid='diagnostic-note']",
      url: "http://127.0.0.1:43173/?view=diagnostics",
      screenshot: {
        path: "artifacts/screenshots/step-005.png",
        label: "Confirm the local-only diagnostics note"
      },
      assertions: [
        {
          id: "assert-02",
          label: "Diagnostics note explains the local-only failure path",
          status: "passed",
          expected: "No auth or backend required. Runtime failures stay visible.",
          actual: "No auth or backend required. Runtime failures stay visible.",
          message:
            "[data-testid='diagnostic-note'] contains \"No auth or backend required. Runtime failures stay visible.\""
        }
      ],
      console: [],
      network: []
    }
  ],
  timeline: []
};
