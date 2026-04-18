import { sampleEvidence } from "./sample-evidence";
import type {
  ConsoleLevel,
  EvidenceArtifact,
  EvidenceAssertion,
  EvidenceConsoleEntry,
  EvidenceCounts,
  EvidenceNetworkEntry,
  EvidenceRun,
  EvidenceStatus,
  EvidenceStep,
  EvidenceSummary,
  EvidenceTimelineEvent,
  FailureReason,
  LoadedEvidence,
  TaskProofEvidence,
  TimelineItem,
  TimelineKind
} from "./types";

const KNOWN_STATUSES = new Set<EvidenceStatus>([
  "passed",
  "failed",
  "skipped",
  "running",
  "unknown"
]);

const KNOWN_CONSOLE_LEVELS = new Set<ConsoleLevel>(["error", "warn", "info", "log", "debug"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function normalizeStatus(value: unknown, fallback: EvidenceStatus = "unknown"): EvidenceStatus {
  const normalized = asString(value)?.toLowerCase() as EvidenceStatus | undefined;
  return normalized && KNOWN_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeConsoleLevel(value: unknown): ConsoleLevel {
  const normalized = asString(value)?.toLowerCase() as ConsoleLevel | undefined;
  return normalized && KNOWN_CONSOLE_LEVELS.has(normalized) ? normalized : "log";
}

function coerceCounts(raw: Record<string, unknown> | undefined, fallback: EvidenceCounts): EvidenceCounts {
  if (!raw) {
    return fallback;
  }

  return {
    total: asNumber(raw.total) ?? fallback.total,
    passed: asNumber(raw.passed) ?? fallback.passed,
    failed: asNumber(raw.failed) ?? fallback.failed,
    skipped: asNumber(raw.skipped) ?? fallback.skipped
  };
}

function normalizeArtifact(raw: unknown, fallbackLabel: string): EvidenceArtifact | undefined {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return {
      path: raw,
      label: fallbackLabel
    };
  }

  const record = asRecord(raw);
  const path = asString(record?.path) ?? asString(record?.src) ?? asString(record?.url);
  if (!path) {
    return undefined;
  }

  return {
    path,
    label: asString(record?.label) ?? fallbackLabel,
    thumbnailPath: asString(record?.thumbnailPath) ?? asString(record?.thumbPath)
  };
}

function normalizeAssertions(raw: unknown, stepId: string, stepTitle: string): EvidenceAssertion[] {
  return asArray(raw).map((entry, index) => {
    const record = asRecord(entry);

    return {
      id: asString(record?.id) ?? `${stepId}-assertion-${index + 1}`,
      label:
        asString(record?.label) ??
        asString(record?.name) ??
        asString(record?.message) ??
        `${stepTitle} assertion ${index + 1}`,
      status: normalizeStatus(record?.status, "unknown"),
      expected: asString(record?.expected),
      actual: asString(record?.actual),
      message: asString(record?.message)
    };
  });
}

function normalizeConsole(raw: unknown, stepId: string): EvidenceConsoleEntry[] {
  return asArray(raw).map((entry, index) => {
    const record = asRecord(entry);

    return {
      id: asString(record?.id) ?? `${stepId}-console-${index + 1}`,
      level: normalizeConsoleLevel(record?.level),
      text: asString(record?.text) ?? asString(record?.message) ?? "Console entry",
      timestamp: asString(record?.timestamp)
    };
  });
}

function normalizeNetwork(raw: unknown, stepId: string): EvidenceNetworkEntry[] {
  return asArray(raw).map((entry, index) => {
    const record = asRecord(entry);
    const statusCode = asNumber(record?.statusCode) ?? asNumber(record?.status);
    const failureText = asString(record?.failureText) ?? asString(record?.error);
    const derivedStatus = failureText || (typeof statusCode === "number" && statusCode >= 400) ? "failed" : "passed";

    return {
      id: asString(record?.id) ?? `${stepId}-network-${index + 1}`,
      method: asString(record?.method) ?? "GET",
      url: asString(record?.url) ?? "unknown request",
      status: normalizeStatus(record?.status, derivedStatus),
      statusCode,
      failureText,
      timestamp: asString(record?.timestamp)
    };
  });
}

function normalizeStep(raw: unknown, index: number): EvidenceStep {
  const record = asRecord(raw) ?? {};
  const type = asString(record.type) ?? asString(record.kind) ?? "step";
  const title = asString(record.title) ?? asString(record.name) ?? `${index + 1}. ${type}`;
  const id = asString(record.id) ?? `step-${String(index + 1).padStart(2, "0")}`;
  const assertions = normalizeAssertions(record.assertions ?? record.assertionResults, id, title);
  const consoleEntries = normalizeConsole(record.console ?? record.consoleEntries, id);
  const networkEntries = normalizeNetwork(record.network ?? record.networkEntries, id);

  return {
    id,
    index,
    title,
    type,
    status: normalizeStatus(record.status, "unknown"),
    startedAt: asString(record.startedAt) ?? asString(record.timestamp),
    durationMs: asNumber(record.durationMs),
    selector: asString(record.selector),
    value: asString(record.value),
    url: asString(record.url),
    reason: asString(record.reason) ?? asString(record.failureReason) ?? asString(record.error),
    screenshot: normalizeArtifact(record.screenshot ?? record.image ?? record.artifact, title),
    assertions,
    console: consoleEntries,
    network: networkEntries
  };
}

function deriveCounts(steps: EvidenceStep[]): {
  steps: EvidenceCounts;
  assertions: EvidenceCounts;
  consoleErrors: number;
  networkFailures: number;
  screenshotCount: number;
} {
  const stepCounts: EvidenceCounts = {
    total: steps.length,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  const assertionCounts: EvidenceCounts = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  let consoleErrors = 0;
  let networkFailures = 0;
  let screenshotCount = 0;

  for (const step of steps) {
    if (step.status === "passed") {
      stepCounts.passed += 1;
    } else if (step.status === "failed") {
      stepCounts.failed += 1;
    } else if (step.status === "skipped") {
      stepCounts.skipped += 1;
    }

    if (step.screenshot) {
      screenshotCount += 1;
    }

    for (const assertion of step.assertions) {
      assertionCounts.total += 1;
      if (assertion.status === "passed") {
        assertionCounts.passed += 1;
      } else if (assertion.status === "failed") {
        assertionCounts.failed += 1;
      } else if (assertion.status === "skipped") {
        assertionCounts.skipped += 1;
      }
    }

    for (const entry of step.console) {
      if (entry.level === "error") {
        consoleErrors += 1;
      }
    }

    for (const entry of step.network) {
      if (entry.status === "failed") {
        networkFailures += 1;
      }
    }
  }

  return {
    steps: stepCounts,
    assertions: assertionCounts,
    consoleErrors,
    networkFailures,
    screenshotCount
  };
}

function deriveScore(
  rawScore: Record<string, unknown> | undefined,
  steps: EvidenceCounts,
  assertions: EvidenceCounts
): EvidenceSummary["score"] {
  const earned = asNumber(rawScore?.earned) ?? assertions.passed ?? steps.passed;
  const total = asNumber(rawScore?.total) ?? assertions.total ?? steps.total ?? 1;
  const explicitPercent = asNumber(rawScore?.percent);
  const percent = explicitPercent ?? Math.round((earned / total) * 100);

  return {
    earned,
    total,
    percent,
    label: asString(rawScore?.label) ?? (assertions.total > 0 ? "assertions" : "steps")
  };
}

function normalizeRun(raw: Record<string, unknown> | undefined, durationMs: number): EvidenceRun {
  return {
    name: asString(raw?.name) ?? asString(raw?.taskName) ?? "TaskProof report",
    taskId: asString(raw?.taskId) ?? asString(raw?.id),
    targetUrl: asString(raw?.targetUrl) ?? asString(raw?.url),
    specPath: asString(raw?.specPath),
    startedAt: asString(raw?.startedAt),
    generatedAt: asString(raw?.generatedAt) ?? asString(raw?.finishedAt),
    durationMs: asNumber(raw?.durationMs) ?? durationMs,
    rerunCommand: asString(raw?.rerunCommand),
    runnerVersion: asString(raw?.runnerVersion) ?? asString(raw?.version)
  };
}

function normalizeExtraTimeline(raw: unknown): EvidenceTimelineEvent[] {
  return asArray(raw).map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const kind = (asString(record.kind) ?? "step") as TimelineKind;

    return {
      id: asString(record.id) ?? `timeline-${index + 1}`,
      kind,
      title: asString(record.title) ?? asString(record.label) ?? kind,
      detail: asString(record.detail) ?? asString(record.message),
      status: normalizeStatus(record.status, "unknown"),
      stepId: asString(record.stepId),
      stepIndex: asNumber(record.stepIndex),
      timestamp: asString(record.timestamp)
    };
  });
}

export function normalizeEvidence(raw: unknown): TaskProofEvidence {
  const source = asRecord(raw) ?? {};
  const steps = asArray(source.steps).map((step, index) => normalizeStep(step, index));
  const derived = deriveCounts(steps);
  const summarySource = asRecord(source.summary);
  const durationMs =
    asNumber(summarySource?.durationMs) ??
    asNumber(asRecord(source.run)?.durationMs) ??
    asNumber(asRecord(source.meta)?.durationMs) ??
    steps.reduce((total, step) => total + (step.durationMs ?? 0), 0);

  const summary: EvidenceSummary = {
    verdict:
      normalizeStatus(summarySource?.verdict, "unknown") === "unknown"
        ? derived.steps.failed > 0
          ? "failed"
          : "passed"
        : normalizeStatus(summarySource?.verdict),
    score: deriveScore(asRecord(summarySource?.score), derived.steps, derived.assertions),
    steps: coerceCounts(asRecord(summarySource?.steps), derived.steps),
    assertions: coerceCounts(asRecord(summarySource?.assertions), derived.assertions),
    consoleErrors: asNumber(summarySource?.consoleErrors) ?? derived.consoleErrors,
    networkFailures: asNumber(summarySource?.networkFailures) ?? derived.networkFailures,
    durationMs,
    screenshotCount: asNumber(summarySource?.screenshotCount) ?? derived.screenshotCount
  };

  return {
    run: normalizeRun(asRecord(source.run) ?? asRecord(source.meta), summary.durationMs),
    summary,
    steps,
    timeline: normalizeExtraTimeline(source.timeline)
  };
}

function parseInlineEvidence(): LoadedEvidence {
  const script = document.getElementById("taskproof-evidence");
  const payload = script?.textContent?.trim();
  if (payload) {
    try {
      return {
        report: normalizeEvidence(JSON.parse(payload)),
        errors: [],
        source: "script"
      };
    } catch (error) {
      return {
        report: null,
        errors: [
          error instanceof Error ? error.message : "Failed to parse inline evidence payload."
        ],
        source: "script"
      };
    }
  }

  if (import.meta.env.DEV) {
    return {
      report: sampleEvidence,
      errors: [],
      source: "sample"
    };
  }

  return {
    report: null,
    errors: [
      "No TaskProof evidence payload was found. Inject `window.__TASKPROOF_EVIDENCE__` or an inline #taskproof-evidence JSON script."
    ],
    source: "empty"
  };
}

function offsetFromTimestamp(timestamp: string | undefined, runStart: string | undefined, fallback: number): number {
  if (!timestamp) {
    return fallback;
  }

  const point = Date.parse(timestamp);
  const base = runStart ? Date.parse(runStart) : Number.NaN;
  if (Number.isFinite(point) && Number.isFinite(base)) {
    return Math.max(point - base, 0);
  }

  return fallback;
}

export function buildTimelineItems(report: TaskProofEvidence): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const step of report.steps) {
    const baseOffset = offsetFromTimestamp(
      step.startedAt,
      report.run.startedAt,
      step.index * 1000
    );

    items.push({
      id: step.id,
      kind: "step",
      title: step.title,
      detail: step.reason ?? step.selector ?? step.url ?? step.type,
      status: step.status,
      stepId: step.id,
      stepIndex: step.index,
      offsetMs: baseOffset,
      timestamp: step.startedAt,
      screenshot: step.screenshot
    });

    step.assertions.forEach((assertion, index) => {
      items.push({
        id: assertion.id,
        kind: "assertion",
        title: assertion.label,
        detail:
          assertion.message ??
          [assertion.expected ? `expected ${assertion.expected}` : undefined, assertion.actual ? `actual ${assertion.actual}` : undefined]
            .filter(Boolean)
            .join(" | "),
        status: assertion.status,
        stepId: step.id,
        stepIndex: step.index,
        offsetMs: baseOffset + index + 1,
        screenshot: step.screenshot
      });
    });

    step.console.forEach((entry, index) => {
      items.push({
        id: entry.id,
        kind: "console",
        title: entry.level.toUpperCase(),
        detail: entry.text,
        status: entry.level === "error" ? "failed" : "passed",
        stepId: step.id,
        stepIndex: step.index,
        offsetMs: offsetFromTimestamp(entry.timestamp, report.run.startedAt, baseOffset + 100 + index),
        timestamp: entry.timestamp,
        screenshot: step.screenshot
      });
    });

    step.network.forEach((entry, index) => {
      items.push({
        id: entry.id,
        kind: "network",
        title: `${entry.method} ${entry.statusCode ?? ""}`.trim(),
        detail: entry.failureText ? `${entry.url} | ${entry.failureText}` : entry.url,
        status: entry.status,
        stepId: step.id,
        stepIndex: step.index,
        offsetMs: offsetFromTimestamp(entry.timestamp, report.run.startedAt, baseOffset + 200 + index),
        timestamp: entry.timestamp,
        screenshot: step.screenshot
      });
    });
  }

  for (const event of report.timeline) {
    items.push({
      id: event.id,
      kind: event.kind,
      title: event.title,
      detail: event.detail,
      status: event.status,
      stepId: event.stepId,
      stepIndex: event.stepIndex,
      offsetMs: offsetFromTimestamp(event.timestamp, report.run.startedAt, items.length + 1),
      timestamp: event.timestamp,
      screenshot: report.steps.find((step) => step.id === event.stepId)?.screenshot
    });
  }

  return items.slice().sort((left, right) => left.offsetMs - right.offsetMs);
}

export function collectFailureReasons(report: TaskProofEvidence): FailureReason[] {
  const reasons: FailureReason[] = [];

  for (const step of report.steps) {
    if (step.status === "failed" && step.reason) {
      reasons.push({
        id: `${step.id}-reason`,
        kind: "step",
        reason: step.reason,
        stepId: step.id,
        stepLabel: `Step ${step.index + 1}: ${step.title}`,
        timelineId: step.id
      });
    }

    for (const assertion of step.assertions) {
      if (assertion.status === "failed") {
        reasons.push({
          id: `${assertion.id}-reason`,
          kind: "assertion",
          reason: assertion.message ?? `${assertion.label} failed.`,
          stepId: step.id,
          stepLabel: `Step ${step.index + 1}: ${step.title}`,
          timelineId: assertion.id
        });
      }
    }

    for (const entry of step.console) {
      if (entry.level === "error") {
        reasons.push({
          id: `${entry.id}-reason`,
          kind: "console",
          reason: entry.text,
          stepId: step.id,
          stepLabel: `Step ${step.index + 1}: ${step.title}`,
          timelineId: entry.id
        });
      }
    }

    for (const entry of step.network) {
      if (entry.status === "failed") {
        reasons.push({
          id: `${entry.id}-reason`,
          kind: "network",
          reason:
            entry.failureText ??
            `${entry.method} ${entry.url} failed${entry.statusCode ? ` with ${entry.statusCode}` : "."}`,
          stepId: step.id,
          stepLabel: `Step ${step.index + 1}: ${step.title}`,
          timelineId: entry.id
        });
      }
    }
  }

  return reasons;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.round((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatOffset(offsetMs: number): string {
  return `+${formatDuration(offsetMs)}`;
}

export function formatTimestamp(timestamp: string | undefined): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function loadEvidence(): LoadedEvidence {
  return parseInlineEvidence();
}

export function statusRank(status: EvidenceStatus): number {
  if (status === "failed") {
    return 0;
  }

  if (status === "running") {
    return 1;
  }

  if (status === "passed") {
    return 2;
  }

  if (status === "skipped") {
    return 3;
  }

  return 4;
}

export function shouldHighlightStatus(status: EvidenceStatus): boolean {
  return status === "failed" || status === "passed";
}

export function isSuccessfulVerdict(status: EvidenceStatus): boolean {
  return status === "passed";
}

export function hasRealEvidence(report: TaskProofEvidence | null): report is TaskProofEvidence {
  return Boolean(report && (report.steps.length > 0 || report.summary.score.total > 0));
}
