export type StepStatus = "passed" | "failed";
export type MatchMode = "includes" | "exact";

export interface ViewportSize {
  width: number;
  height: number;
}

interface BaseStep {
  name?: string;
}

export interface ClickStep extends BaseStep {
  type: "click";
  selector: string;
}

export interface FillStep extends BaseStep {
  type: "fill";
  selector: string;
  value: string;
}

export interface PressStep extends BaseStep {
  type: "press";
  key: string;
  selector?: string;
}

export interface NavigateStep extends BaseStep {
  type: "navigate";
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
}

export interface WaitStep extends BaseStep {
  type: "wait";
  ms?: number;
  selector?: string;
  state?: "visible" | "hidden" | "attached" | "detached";
}

export interface AssertTextStep extends BaseStep {
  type: "assertText";
  selector: string;
  text: string;
  match?: MatchMode;
}

export interface AssertVisibleStep extends BaseStep {
  type: "assertVisible";
  selector: string;
  visible?: boolean;
}

export interface AssertUrlStep extends BaseStep {
  type: "assertUrl";
  value: string;
  match?: MatchMode;
}

export interface AssertCountStep extends BaseStep {
  type: "assertCount";
  selector: string;
  count: number;
}

export type TaskStep =
  | ClickStep
  | FillStep
  | PressStep
  | NavigateStep
  | WaitStep
  | AssertTextStep
  | AssertVisibleStep
  | AssertUrlStep
  | AssertCountStep;

export interface TaskSpec {
  name: string;
  description?: string;
  viewport?: ViewportSize;
  steps: TaskStep[];
}

export interface StepAssertion {
  kind: "text" | "visible" | "url" | "count";
  passed: boolean;
  expected: string | number | boolean;
  actual: string | number | boolean;
  detail?: string;
}

export interface FailureDetail {
  message: string;
  detail?: string;
}

export interface StepArtifacts {
  screenshot: string;
  domSnapshot: string;
}

export interface StepResult {
  id: string;
  index: number;
  name: string;
  type: TaskStep["type"];
  status: StepStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  input: Record<string, unknown>;
  url: string;
  title: string;
  assertions: StepAssertion[];
  failure?: FailureDetail;
  artifacts: StepArtifacts;
}

export interface ConsoleEventRecord {
  id: string;
  timestamp: string;
  stepId: string | null;
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface NetworkEventRecord {
  id: string;
  timestamp: string;
  stepId: string | null;
  kind: "requestfailed" | "http-error";
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  failureText?: string;
}

export interface RunSummary {
  totalSteps: number;
  executedSteps: number;
  passedSteps: number;
  failedSteps: number;
  assertionCount: number;
  consoleErrorCount: number;
  networkFailureCount: number;
  screenshotCount: number;
  durationMs: number;
  score: number;
  status: StepStatus;
}

export interface EvidenceBundle {
  schemaVersion: "1.0.0";
  run: {
    id: string;
    name: string;
    specPath: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    status: StepStatus;
    outputDir: string;
  };
  target: {
    initialUrl: string;
    finalUrl: string;
    title: string;
  };
  summary: RunSummary;
  rerun: {
    cwd: string;
    command: string;
    scriptPath: string;
  };
  stepResults: StepResult[];
  consoleEvents: ConsoleEventRecord[];
  networkEvents: NetworkEventRecord[];
  artifacts: {
    specFile: string;
    reportIndex: string;
    reportAssets: string[];
    screenshotsDir: string;
    domSnapshotsDir: string;
    consoleLog: string;
    networkLog: string;
    zipFile: string;
  };
}

export interface RunResult {
  bundle: EvidenceBundle;
  outputDir: string;
  reportPath: string;
  zipPath: string;
}

export interface RunOptions {
  url: string;
  specPath: string;
  outputDir?: string;
  headed?: boolean;
}
