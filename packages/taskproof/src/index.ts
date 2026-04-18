export { runCli } from "./cli.js";
export type { CliIo } from "./cli.js";
export type {
  EvidenceBundle,
  RunOptions,
  RunResult,
  TaskSpec,
  TaskStep
} from "./model.js";
export { writeStaticReport } from "./report.js";
export { buildSummary, executeTaskProof } from "./runner.js";
export { loadTaskSpec } from "./spec.js";
