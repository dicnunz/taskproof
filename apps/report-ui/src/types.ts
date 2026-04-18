export type EvidenceStatus = "passed" | "failed" | "skipped" | "running" | "unknown";

export type TimelineKind = "step" | "assertion" | "console" | "network";

export type ConsoleLevel = "error" | "warn" | "info" | "log" | "debug";

export interface EvidenceArtifact {
  path: string;
  label: string;
  thumbnailPath?: string;
}

export interface EvidenceAssertion {
  id: string;
  label: string;
  status: EvidenceStatus;
  expected?: string;
  actual?: string;
  message?: string;
}

export interface EvidenceConsoleEntry {
  id: string;
  level: ConsoleLevel;
  text: string;
  timestamp?: string;
}

export interface EvidenceNetworkEntry {
  id: string;
  method: string;
  url: string;
  status: EvidenceStatus;
  statusCode?: number;
  failureText?: string;
  timestamp?: string;
}

export interface EvidenceStep {
  id: string;
  index: number;
  title: string;
  type: string;
  status: EvidenceStatus;
  startedAt?: string;
  durationMs?: number;
  selector?: string;
  value?: string;
  url?: string;
  reason?: string;
  screenshot?: EvidenceArtifact;
  assertions: EvidenceAssertion[];
  console: EvidenceConsoleEntry[];
  network: EvidenceNetworkEntry[];
}

export interface EvidenceCounts {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface EvidenceSummary {
  verdict: EvidenceStatus;
  score: {
    earned: number;
    total: number;
    percent: number;
    label: string;
  };
  steps: EvidenceCounts;
  assertions: EvidenceCounts;
  consoleErrors: number;
  networkFailures: number;
  durationMs: number;
  screenshotCount: number;
}

export interface EvidenceRun {
  name: string;
  taskId?: string;
  targetUrl?: string;
  specPath?: string;
  startedAt?: string;
  generatedAt?: string;
  durationMs?: number;
  rerunCommand?: string;
  runnerVersion?: string;
}

export interface EvidenceTimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  status: EvidenceStatus;
  stepId?: string;
  stepIndex?: number;
  timestamp?: string;
}

export interface TaskProofEvidence {
  run: EvidenceRun;
  summary: EvidenceSummary;
  steps: EvidenceStep[];
  timeline: EvidenceTimelineEvent[];
}

export interface LoadedEvidence {
  report: TaskProofEvidence | null;
  errors: string[];
  source: "script" | "sample" | "empty";
}

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  status: EvidenceStatus;
  stepId?: string;
  stepIndex?: number;
  offsetMs: number;
  timestamp?: string;
  screenshot?: EvidenceArtifact;
}

export interface FailureReason {
  id: string;
  kind: TimelineKind;
  reason: string;
  stepId?: string;
  stepLabel: string;
  timelineId?: string;
}
