import { useEffect, useState } from "react";

import {
  buildTimelineItems,
  collectFailureReasons,
  formatDuration,
  formatOffset,
  formatTimestamp,
  hasRealEvidence,
  isSuccessfulVerdict,
  loadEvidence
} from "./report-data";
import type {
  EvidenceStatus,
  FailureReason,
  TaskProofEvidence,
  TimelineItem,
  TimelineKind
} from "./types";

type StatusFilter = "all" | "passed" | "failed";
type Tone = "success" | "failure" | "active" | "muted";

interface CategoryFilters {
  step: boolean;
  assertion: boolean;
  console: boolean;
  network: boolean;
}

const DEFAULT_CATEGORY_FILTERS: CategoryFilters = {
  step: true,
  assertion: true,
  console: true,
  network: true
};

const KIND_LABELS: Record<TimelineKind, string> = {
  step: "steps",
  assertion: "assertions",
  console: "console",
  network: "network"
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  passed: "Passed",
  failed: "Failed"
};
const SUPPORT_RECEIPT_URL = "https://nicdunz.gumroad.com/l/smrimu";

function statusTone(status: EvidenceStatus): Tone {
  if (status === "passed") {
    return "success";
  }

  if (status === "failed") {
    return "failure";
  }

  if (status === "running") {
    return "active";
  }

  return "muted";
}

function selectInitialTimelineItem(items: TimelineItem[]): string | null {
  const firstFailed = items.find((item) => item.status === "failed");
  return firstFailed?.id ?? items[0]?.id ?? null;
}

function matchesStatusFilter(item: TimelineItem, filter: StatusFilter): boolean {
  if (filter === "all") {
    return true;
  }

  return item.status === filter;
}

function matchesCategoryFilter(item: TimelineItem, filters: CategoryFilters): boolean {
  return filters[item.kind];
}

function copyText(value: string): Promise<void> {
  return navigator.clipboard.writeText(value);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function runtimeIssueCount(report: TaskProofEvidence | null): number {
  if (!report) {
    return 0;
  }

  return report.summary.consoleErrors + report.summary.networkFailures;
}

function buildHeroSummary(report: TaskProofEvidence | null): string {
  if (!report) {
    return "Evidence payload missing.";
  }

  const issues = runtimeIssueCount(report);

  if (isSuccessfulVerdict(report.summary.verdict)) {
    if (issues > 0) {
      return `Task assertions passed, but ${issues} runtime ${pluralize(issues, "issue")} were still captured for review.`;
    }

    return "Task completed cleanly with stable evidence.";
  }

  if (issues > 0) {
    return "Run failed and captured runtime issues for root-cause review.";
  }

  return "Run failed with captured evidence for root-cause review.";
}

function buildRuntimeNotice(report: TaskProofEvidence | null): string | null {
  if (!report) {
    return null;
  }

  const consoleErrors = report.summary.consoleErrors;
  const networkFailures = report.summary.networkFailures;
  const issues = consoleErrors + networkFailures;

  if (issues === 0) {
    return null;
  }

  return `${issues} runtime ${pluralize(issues, "issue")} captured: ${consoleErrors} console ${pluralize(consoleErrors, "error")} and ${networkFailures} network ${pluralize(networkFailures, "failure")}.`;
}

export default function App() {
  const { report, errors, source } = loadEvidence();
  const timeline = report ? buildTimelineItems(report) : [];
  const failureReasons = report ? collectFailureReasons(report) : [];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilters, setCategoryFilters] = useState<CategoryFilters>(DEFAULT_CATEGORY_FILTERS);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(selectInitialTimelineItem(timeline));
  const [copied, setCopied] = useState(false);

  const visibleTimeline = timeline.filter(
    (item) => matchesStatusFilter(item, statusFilter) && matchesCategoryFilter(item, categoryFilters)
  );
  const selectedItem =
    visibleTimeline.find((item) => item.id === selectedItemId) ??
    timeline.find((item) => item.id === selectedItemId) ??
    visibleTimeline[0];
  const selectedStep = report?.steps.find((step) => step.id === selectedItem?.stepId);
  const screenshotItems = report?.steps.filter((step) => step.screenshot) ?? [];
  const selectedScreenshot =
    selectedStep?.screenshot ??
    report?.steps.find((step) => step.id === selectedItem?.stepId)?.screenshot ??
    screenshotItems[0]?.screenshot;
  const kindCounts = {
    step: timeline.filter((item) => item.kind === "step").length,
    assertion: timeline.filter((item) => item.kind === "assertion").length,
    console: timeline.filter((item) => item.kind === "console").length,
    network: timeline.filter((item) => item.kind === "network").length
  };
  const runtimeNotice = buildRuntimeNotice(report);
  const runtimeIssues = runtimeIssueCount(report);

  useEffect(() => {
    const nextId = selectInitialTimelineItem(visibleTimeline);
    if (!selectedItemId || !visibleTimeline.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(nextId);
    }
  }, [selectedItemId, visibleTimeline]);

  async function handleCopyCommand(): Promise<void> {
    if (!report?.run.rerunCommand) {
      return;
    }

    try {
      await copyText(report.run.rerunCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleCategoryToggle(kind: TimelineKind): void {
    setCategoryFilters((current) => ({
      ...current,
      [kind]: !current[kind]
    }));
  }

  function jumpToFailure(reason: FailureReason): void {
    if (!reason.timelineId) {
      return;
    }

    setSelectedItemId(reason.timelineId);
  }

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">TaskProof</div>
          <h1>{report?.run.name ?? "TaskProof report"}</h1>
          <p className="hero-summary">{buildHeroSummary(report)}</p>
          <dl className="meta-grid">
            <MetaRow label="Target" value={report?.run.targetUrl ?? "Not provided"} mono />
            <MetaRow label="Spec" value={report?.run.specPath ?? "Not provided"} mono />
            <MetaRow
              label="Generated"
              value={formatTimestamp(report?.run.generatedAt) ?? "Not provided"}
            />
            <MetaRow
              label="Source"
              value={source === "sample" ? "Dev sample payload" : source}
            />
          </dl>
        </div>

        <div className="hero-score">
          <div className={`verdict-chip verdict-chip--${statusTone(report?.summary.verdict ?? "unknown")}`}>
            {(report?.summary.verdict ?? "unknown").toUpperCase()}
          </div>
          <div className="score-ring">
            <strong>{report?.summary.score.percent ?? 0}%</strong>
            <span>{report?.summary.score.label ?? "score"}</span>
          </div>
          <div className="score-caption">
            {report
              ? `${report.summary.score.earned} / ${report.summary.score.total} ${report.summary.score.label} passed`
              : "0 / 0 checks passed"}
          </div>
        </div>
      </header>

      <section className="metric-strip">
        <MetricCard
          label="Steps"
          value={
            report
              ? `${report.summary.steps.passed}/${report.summary.steps.total}`
              : "0/0"
          }
          detail={report ? `${report.summary.steps.failed} failed` : "No evidence"}
          tone={statusTone(report?.summary.steps.failed ? "failed" : "passed")}
        />
        <MetricCard
          label="Assertions"
          value={
            report
              ? `${report.summary.assertions.passed}/${report.summary.assertions.total}`
              : "0/0"
          }
          detail={report ? `${report.summary.assertions.failed} failed` : "No evidence"}
          tone={statusTone(report?.summary.assertions.failed ? "failed" : "passed")}
        />
        <MetricCard
          label="Console Errors"
          value={String(report?.summary.consoleErrors ?? 0)}
          detail="error entries"
          tone={statusTone((report?.summary.consoleErrors ?? 0) > 0 ? "failed" : "passed")}
        />
        <MetricCard
          label="Network Failures"
          value={String(report?.summary.networkFailures ?? 0)}
          detail="failed requests"
          tone={statusTone((report?.summary.networkFailures ?? 0) > 0 ? "failed" : "passed")}
        />
        <MetricCard
          label="Duration"
          value={formatDuration(report?.summary.durationMs ?? 0)}
          detail={`${report?.summary.screenshotCount ?? 0} screenshots`}
          tone="muted"
        />
      </section>

      {errors.length > 0 ? (
        <section className="notice-panel">
          <strong>Evidence load issue</strong>
          <p>{errors[0]}</p>
        </section>
      ) : null}

      {runtimeNotice ? (
        <section className="notice-panel notice-panel--warning">
          <strong>
            {isSuccessfulVerdict(report?.summary.verdict ?? "unknown")
              ? "Spec passed with runtime issues"
              : "Runtime issues captured"}
          </strong>
          <p>
            {runtimeNotice}
            {runtimeIssues > 0 ? " TaskProof keeps these signals visible even when the task assertions pass." : ""}
          </p>
        </section>
      ) : null}

      <section className="command-panel">
        <div>
          <div className="panel-heading">Rerun command</div>
          <pre>{report?.run.rerunCommand ?? "Runner did not provide a rerun command."}</pre>
        </div>
        <button
          className="copy-button"
          type="button"
          disabled={!report?.run.rerunCommand}
          onClick={() => {
            void handleCopyCommand();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </section>

      <main className="report-grid">
        <section className="timeline-panel surface-panel">
          <div className="panel-header">
            <div>
              <div className="panel-heading">Timeline</div>
              <p className="panel-subtitle">
                Step execution with assertions, console, and network evidence.
              </p>
            </div>
            <div className="count-chip">{visibleTimeline.length} visible</div>
          </div>

          <div className="filter-row">
            <div className="segmented-control">
              {(["all", "passed", "failed"] as StatusFilter[]).map((filter) => (
                <button
                  key={filter}
                  className={statusFilter === filter ? "is-active" : undefined}
                  type="button"
                  onClick={() => setStatusFilter(filter)}
                >
                  {STATUS_LABELS[filter]}
                </button>
              ))}
            </div>

            <div className="toggle-group">
              {(Object.keys(KIND_LABELS) as TimelineKind[]).map((kind) => (
                <button
                  key={kind}
                  className={categoryFilters[kind] ? "toggle-pill is-on" : "toggle-pill"}
                  type="button"
                  aria-pressed={categoryFilters[kind]}
                  onClick={() => handleCategoryToggle(kind)}
                >
                  <span>{KIND_LABELS[kind]}</span>
                  <strong>{kindCounts[kind]}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="timeline-list">
            {visibleTimeline.map((item) => (
              <button
                key={item.id}
                className={selectedItem?.id === item.id ? "timeline-item is-selected" : "timeline-item"}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
              >
                <div className={`timeline-rail timeline-rail--${statusTone(item.status)}`} />
                <div className="timeline-main">
                  <div className="timeline-title-row">
                    <span className="timeline-kind">{item.kind}</span>
                    <span className={`timeline-status timeline-status--${statusTone(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="timeline-time">{formatOffset(item.offsetMs)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  {item.detail ? <p>{item.detail}</p> : null}
                </div>
              </button>
            ))}

            {visibleTimeline.length === 0 ? (
              <div className="empty-state">
                No events match the current filters.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="detail-column">
          <section className="surface-panel">
            <div className="panel-header">
              <div>
                <div className="panel-heading">Selected event</div>
                <p className="panel-subtitle">Focused evidence for the current timeline item.</p>
              </div>
            </div>

            {selectedItem ? (
              <div className="detail-stack">
                <div className="detail-title-row">
                  <h2>{selectedItem.title}</h2>
                  <div className={`verdict-chip verdict-chip--${statusTone(selectedItem.status)}`}>
                    {selectedItem.status}
                  </div>
                </div>
                {selectedItem.detail ? <p className="detail-body">{selectedItem.detail}</p> : null}
                <dl className="meta-grid">
                  <MetaRow
                    label="Step"
                    value={
                      selectedStep ? `#${selectedStep.index + 1} ${selectedStep.title}` : "Standalone event"
                    }
                  />
                  <MetaRow
                    label="At"
                    value={formatTimestamp(selectedItem.timestamp) ?? formatOffset(selectedItem.offsetMs)}
                    mono
                  />
                  <MetaRow label="Type" value={selectedStep?.type ?? selectedItem.kind} mono />
                  <MetaRow
                    label="Duration"
                    value={selectedStep?.durationMs ? formatDuration(selectedStep.durationMs) : "Not recorded"}
                    mono
                  />
                  <MetaRow label="Selector" value={selectedStep?.selector ?? "Not recorded"} mono />
                  <MetaRow label="URL" value={selectedStep?.url ?? report?.run.targetUrl ?? "Not recorded"} mono />
                </dl>
              </div>
            ) : (
              <div className="empty-state">Load evidence to inspect event details.</div>
            )}
          </section>

          <section className="surface-panel">
            <div className="panel-header">
              <div>
                <div className="panel-heading">Captured issues</div>
                <p className="panel-subtitle">
                  Direct causes surfaced from failed steps, console errors, and network failures.
                </p>
              </div>
              <div className="count-chip">{failureReasons.length}</div>
            </div>

            {failureReasons.length > 0 ? (
              <div className="failure-list">
                {failureReasons.map((reason) => (
                  <button
                    key={reason.id}
                    className="failure-item"
                    type="button"
                    onClick={() => jumpToFailure(reason)}
                  >
                    <span className={`failure-kind failure-kind--${reason.kind}`}>{reason.kind}</span>
                    <strong>{reason.stepLabel}</strong>
                    <p>{reason.reason}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                {hasRealEvidence(report) ? "No failures were recorded." : "No evidence loaded."}
              </div>
            )}
          </section>

          <section className="surface-panel">
            <div className="panel-header">
              <div>
                <div className="panel-heading">Screenshots</div>
                <p className="panel-subtitle">Captured step frames tied to the selected evidence.</p>
              </div>
              <div className="count-chip">{screenshotItems.length}</div>
            </div>

            {selectedScreenshot ? (
              <div className="screenshot-viewer">
                <div className="screenshot-frame">
                  <img src={selectedScreenshot.path} alt={selectedScreenshot.label} />
                </div>
                <div className="screenshot-caption">
                  <strong>{selectedScreenshot.label}</strong>
                  <span>{selectedStep ? `Step ${selectedStep.index + 1}` : "Captured artifact"}</span>
                </div>
                <div className="screenshot-strip">
                  {screenshotItems.map((step) => {
                    const screenshot = step.screenshot;
                    if (!screenshot) {
                      return null;
                    }

                    const isActive = screenshot.path === selectedScreenshot.path;
                    return (
                      <button
                        key={step.id}
                        className={isActive ? "thumb-button is-active" : "thumb-button"}
                        type="button"
                        onClick={() => setSelectedItemId(step.id)}
                      >
                        <span>{String(step.index + 1).padStart(2, "0")}</span>
                        <strong>{step.title}</strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state">Runner did not provide screenshots.</div>
            )}
          </section>
        </aside>
      </main>

      <footer className="support-panel">
        <div>
          <div className="panel-heading">Support TaskProof</div>
          <p>
            Optional $5 receipt for teams that used this report to make a UI
            debugging or review decision. Reports stay local and ungated.
          </p>
        </div>
        <a href={SUPPORT_RECEIPT_URL} target="_blank" rel="noreferrer">
          Optional $5 support receipt
        </a>
      </footer>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <section className={`metric-card metric-card--${props.tone}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </section>
  );
}

function MetaRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd className={props.mono ? "is-mono" : undefined}>{props.value}</dd>
    </>
  );
}
