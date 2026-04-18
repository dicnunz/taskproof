import type { TaskProofEvidence } from "./types";

export const sampleEvidence: TaskProofEvidence = {
  run: {
    name: "Checkout smoke test",
    taskId: "checkout-smoke",
    targetUrl: "http://127.0.0.1:43173/login",
    specPath: "examples/specs/checkout-smoke.json",
    startedAt: "2026-04-18T15:03:21.000Z",
    generatedAt: "2026-04-18T15:03:33.000Z",
    durationMs: 12040,
    rerunCommand:
      "npm run taskproof -- --url http://127.0.0.1:43173/login --spec examples/specs/checkout-smoke.json",
    runnerVersion: "0.1.0"
  },
  summary: {
    verdict: "failed",
    score: {
      earned: 7,
      total: 9,
      percent: 78,
      label: "assertions"
    },
    steps: {
      total: 6,
      passed: 5,
      failed: 1,
      skipped: 0
    },
    assertions: {
      total: 6,
      passed: 5,
      failed: 1,
      skipped: 0
    },
    consoleErrors: 1,
    networkFailures: 1,
    durationMs: 12040,
    screenshotCount: 6
  },
  steps: [
    {
      id: "step-01",
      index: 0,
      title: "Navigate to login",
      type: "navigate",
      status: "passed",
      startedAt: "2026-04-18T15:03:21.000Z",
      durationMs: 1090,
      url: "http://127.0.0.1:43173/login",
      screenshot: {
        path: "artifacts/step-01.png",
        label: "Navigate to login"
      },
      assertions: [
        {
          id: "assert-01",
          label: "URL includes /login",
          status: "passed",
          expected: "/login",
          actual: "http://127.0.0.1:43173/login"
        }
      ],
      console: [],
      network: []
    },
    {
      id: "step-02",
      index: 1,
      title: "Wait for auth form",
      type: "assertVisible",
      status: "passed",
      startedAt: "2026-04-18T15:03:22.200Z",
      durationMs: 640,
      selector: "[data-testid='auth-form']",
      screenshot: {
        path: "artifacts/step-02.png",
        label: "Auth form visible"
      },
      assertions: [
        {
          id: "assert-02",
          label: "Auth form is visible",
          status: "passed",
          expected: "[data-testid='auth-form']",
          actual: "visible"
        }
      ],
      console: [],
      network: []
    },
    {
      id: "step-03",
      index: 2,
      title: "Fill email",
      type: "fill",
      status: "passed",
      startedAt: "2026-04-18T15:03:23.100Z",
      durationMs: 540,
      selector: "#email",
      value: "qa@taskproof.local",
      screenshot: {
        path: "artifacts/step-03.png",
        label: "Email field populated"
      },
      assertions: [],
      console: [],
      network: []
    },
    {
      id: "step-04",
      index: 3,
      title: "Fill password",
      type: "fill",
      status: "passed",
      startedAt: "2026-04-18T15:03:24.000Z",
      durationMs: 520,
      selector: "#password",
      value: "super-secret-password",
      screenshot: {
        path: "artifacts/step-04.png",
        label: "Password field populated"
      },
      assertions: [],
      console: [],
      network: []
    },
    {
      id: "step-05",
      index: 4,
      title: "Submit credentials",
      type: "click",
      status: "passed",
      startedAt: "2026-04-18T15:03:24.900Z",
      durationMs: 2840,
      selector: "[data-testid='login-submit']",
      screenshot: {
        path: "artifacts/step-05.png",
        label: "Submit request in flight"
      },
      assertions: [
        {
          id: "assert-03",
          label: "Submit button remains enabled",
          status: "passed",
          expected: "enabled",
          actual: "enabled"
        }
      ],
      console: [
        {
          id: "console-01",
          level: "error",
          text: "POST /api/session returned 500: cannot create session",
          timestamp: "2026-04-18T15:03:26.100Z"
        }
      ],
      network: [
        {
          id: "network-01",
          method: "POST",
          url: "http://127.0.0.1:43173/api/session",
          status: "failed",
          statusCode: 500,
          failureText: "Internal Server Error",
          timestamp: "2026-04-18T15:03:26.000Z"
        }
      ]
    },
    {
      id: "step-06",
      index: 5,
      title: "Verify dashboard redirect",
      type: "assertUrl",
      status: "failed",
      startedAt: "2026-04-18T15:03:28.000Z",
      durationMs: 1710,
      url: "http://127.0.0.1:43173/login?error=session",
      reason: "Expected URL to contain /dashboard after submit.",
      screenshot: {
        path: "artifacts/step-06.png",
        label: "Redirect assertion failed"
      },
      assertions: [
        {
          id: "assert-04",
          label: "URL includes /dashboard",
          status: "failed",
          expected: "/dashboard",
          actual: "/login?error=session",
          message: "Login flow stayed on the login page because the session request failed."
        },
        {
          id: "assert-05",
          label: "Error banner is visible",
          status: "passed",
          expected: "[data-testid='login-error']",
          actual: "visible"
        }
      ],
      console: [],
      network: []
    }
  ],
  timeline: []
};
