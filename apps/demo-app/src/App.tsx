import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type View = "inbox" | "today" | "done" | "diagnostics";
type Tag = "all" | "bug" | "customer" | "ops";

interface Task {
  id: string;
  title: string;
  note: string;
  tag: Exclude<Tag, "all">;
  lane: "inbox" | "today";
  done: boolean;
  priority: "High" | "Medium" | "Low";
}

const INITIAL_TASKS: Task[] = [
  {
    id: "fix-billing-edge-case",
    title: "Fix billing edge case",
    note: "The discount summary still clips on Safari widths.",
    tag: "bug",
    lane: "today",
    done: false,
    priority: "High"
  },
  {
    id: "review-onboarding-copy",
    title: "Review onboarding copy",
    note: "Tighten the empty-state language before launch notes go out.",
    tag: "customer",
    lane: "inbox",
    done: false,
    priority: "Medium"
  },
  {
    id: "prepare-incident-notes",
    title: "Prepare incident notes",
    note: "Summarize the rollback and owner actions for the weekly brief.",
    tag: "ops",
    lane: "inbox",
    done: false,
    priority: "Medium"
  },
  {
    id: "ship-release-summary",
    title: "Ship release summary",
    note: "Done earlier today. Keep it around as a completed reference.",
    tag: "customer",
    lane: "today",
    done: true,
    priority: "Low"
  }
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readViewFromUrl(): View {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "today" || view === "done" || view === "diagnostics") {
    return view;
  }

  return "inbox";
}

function writeViewToUrl(view: View): void {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.pushState({}, "", url);
}

function matchesView(task: Task, view: View): boolean {
  if (view === "done") {
    return task.done;
  }

  if (view === "today") {
    return task.lane === "today" && !task.done;
  }

  if (view === "inbox") {
    return !task.done;
  }

  return false;
}

function viewLabel(view: View): string {
  if (view === "today") {
    return "Today";
  }

  if (view === "done") {
    return "Done";
  }

  if (view === "diagnostics") {
    return "Diagnostics";
  }

  return "Inbox";
}

export default function App() {
  const [view, setView] = useState<View>(() => readViewFromUrl());
  const [tagFilter, setTagFilter] = useState<Tag>("all");
  const [draft, setDraft] = useState("");
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [syncState, setSyncState] = useState<"idle" | "running" | "failed" | "passed">("idle");
  const [syncMessage, setSyncMessage] = useState("No background sync has run yet.");

  useEffect(() => {
    const handlePopState = (): void => {
      setView(readViewFromUrl());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openTasks = tasks.filter((task) => !task.done).length;
  const doneTasks = tasks.filter((task) => task.done).length;
  const todayTasks = tasks.filter((task) => task.lane === "today" && !task.done).length;
  const visibleTasks = tasks.filter(
    (task) =>
      matchesView(task, view) && (tagFilter === "all" || task.tag === tagFilter)
  );

  function changeView(nextView: View): void {
    setView(nextView);
    writeViewToUrl(nextView);
  }

  function handleAddTask(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const title = draft.trim();
    if (!title) {
      return;
    }

    const id = slugify(title);
    setTasks((current) => [
      {
        id,
        title,
        note: "Added locally in the demo workspace.",
        tag: "ops",
        lane: "inbox",
        done: false,
        priority: "Medium"
      },
      ...current.filter((task) => task.id !== id)
    ]);
    setDraft("");
    changeView("inbox");
    setTagFilter("all");
  }

  function toggleTask(taskId: string): void {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              done: !task.done
            }
          : task
      )
    );
  }

  async function runSync(): Promise<void> {
    setSyncState("running");
    setSyncMessage("Running a background sync against the local demo endpoint.");

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ taskCount: tasks.length, openTasks })
      });

      if (!response.ok) {
        const message = `Sync failed gracefully with HTTP ${response.status}.`;
        console.error("TaskProof demo sync failed", {
          status: response.status,
          url: "/api/sync"
        });
        setSyncState("failed");
        setSyncMessage(message);
        return;
      }

      setSyncState("passed");
      setSyncMessage("Sync completed.");
    } catch (error) {
      console.error("TaskProof demo sync crashed", error);
      setSyncState("failed");
      setSyncMessage("Sync failed gracefully because the demo endpoint is unavailable.");
    }
  }

  return (
    <div className="demo-shell">
      <div className="mesh mesh-a" />
      <div className="mesh mesh-b" />
      <header className="topbar">
        <div>
          <div className="eyebrow">Bundled Demo App</div>
          <h1>Northstar Workboard</h1>
          <p className="lede">
            A compact operations board designed to give TaskProof something real to
            inspect, drive, and verify in CI.
          </p>
        </div>

        <div className="stat-row">
          <StatCard label="Open" value={String(openTasks)} accent="amber" />
          <StatCard label="Today" value={String(todayTasks)} accent="mint" />
          <StatCard label="Done" value={String(doneTasks)} accent="slate" />
        </div>
      </header>

      <main className="layout">
        <section className="main-panel">
          <div className="panel-topline">
            <nav className="view-switcher" aria-label="Views">
              <ViewButton
                active={view === "inbox"}
                testId="view-inbox"
                onClick={() => changeView("inbox")}
              >
                Inbox
              </ViewButton>
              <ViewButton
                active={view === "today"}
                testId="view-today"
                onClick={() => changeView("today")}
              >
                Today
              </ViewButton>
              <ViewButton
                active={view === "done"}
                testId="view-done"
                onClick={() => changeView("done")}
              >
                Done
              </ViewButton>
              <ViewButton
                active={view === "diagnostics"}
                testId="view-diagnostics"
                onClick={() => changeView("diagnostics")}
              >
                Diagnostics
              </ViewButton>
            </nav>

            <div className="status-pill" data-testid="board-status">
              {view === "diagnostics"
                ? "Diagnostics surface is active."
                : `${visibleTasks.length} visible ${visibleTasks.length === 1 ? "task" : "tasks"} in ${viewLabel(view)}.`}
            </div>
          </div>

          {view === "diagnostics" ? (
            <section className="diagnostics-grid">
              <article className="diagnostic-card">
                <div className="card-label">Background sync</div>
                <h2 data-testid="sync-status">
                  {syncState === "running"
                    ? "Sync is running."
                    : syncState === "failed"
                      ? "Sync failed gracefully."
                      : syncState === "passed"
                        ? "Sync completed."
                        : "Sync has not been run yet."}
                </h2>
                <p>{syncMessage}</p>
                <button
                  className="primary-button"
                  data-testid="run-sync"
                  type="button"
                  onClick={() => {
                    void runSync();
                  }}
                >
                  Run sync check
                </button>
              </article>

              <article className="diagnostic-card">
                <div className="card-label">Readiness notes</div>
                <ul className="diagnostic-list">
                  <li data-testid="diagnostic-note">No auth or backend required.</li>
                  <li>UI state is fully local.</li>
                  <li>Network failure path is intentionally observable.</li>
                </ul>
              </article>
            </section>
          ) : (
            <>
              <section className="composer-panel">
                <div>
                  <div className="card-label">Quick add</div>
                  <h2>Add a fresh ops task</h2>
                </div>
                <form className="composer-form" onSubmit={handleAddTask}>
                  <input
                    data-testid="task-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder='Add a task like "Send launch note"'
                  />
                  <button className="primary-button" data-testid="add-task" type="submit">
                    Add task
                  </button>
                </form>
              </section>

              <section className="toolbar">
                <div className="card-label">Filter by stream</div>
                <div className="filter-row">
                  <FilterButton
                    active={tagFilter === "all"}
                    testId="filter-all"
                    onClick={() => setTagFilter("all")}
                  >
                    All
                  </FilterButton>
                  <FilterButton
                    active={tagFilter === "bug"}
                    testId="filter-bug"
                    onClick={() => setTagFilter("bug")}
                  >
                    Bug
                  </FilterButton>
                  <FilterButton
                    active={tagFilter === "customer"}
                    testId="filter-customer"
                    onClick={() => setTagFilter("customer")}
                  >
                    Customer
                  </FilterButton>
                  <FilterButton
                    active={tagFilter === "ops"}
                    testId="filter-ops"
                    onClick={() => setTagFilter("ops")}
                  >
                    Ops
                  </FilterButton>
                </div>
              </section>

              <section className="task-grid" data-testid="task-list">
                {visibleTasks.map((task) => (
                  <article className="task-card" data-testid="task-card" key={task.id}>
                    <div className="task-topline">
                      <span className={`priority priority-${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                      <span className={`tag tag-${task.tag}`}>{task.tag}</span>
                    </div>
                    <h2>{task.title}</h2>
                    <p>{task.note}</p>
                    <div className="task-footer">
                      <span>{task.lane === "today" ? "Today lane" : "Inbox lane"}</span>
                      <button
                        className="ghost-button"
                        data-testid={`toggle-${task.id}`}
                        type="button"
                        onClick={() => toggleTask(task.id)}
                      >
                        {task.done ? "Reopen" : "Mark done"}
                      </button>
                    </div>
                  </article>
                ))}
                {visibleTasks.length === 0 ? (
                  <article className="empty-card">
                    <div className="card-label">Clear view</div>
                    <h2>Nothing is sitting here right now.</h2>
                    <p>Try another view or reset the stream filter to inspect more tasks.</p>
                  </article>
                ) : null}
              </section>
            </>
          )}
        </section>

        <aside className="side-panel">
          <section className="surface-card">
            <div className="card-label">What to test</div>
            <h2>Stable hooks for TaskProof</h2>
            <ul className="checklist">
              <li>Top-level view buttons have durable `data-testid` hooks.</li>
              <li>Task cards share `data-testid="task-card"` for count assertions.</li>
              <li>The diagnostics view intentionally emits a failed network response.</li>
            </ul>
          </section>

          <section className="surface-card">
            <div className="card-label">Current route</div>
            <h2 data-testid="route-display">{window.location.pathname + window.location.search}</h2>
            <p>Route changes are reflected in the browser URL for assertUrl coverage.</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function ViewButton({
  active,
  children,
  onClick,
  testId
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={`view-button ${active ? "is-active" : ""}`}
      data-testid={testId}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FilterButton({
  active,
  children,
  onClick,
  testId
}: {
  active: boolean;
  children: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className={`filter-button ${active ? "is-active" : ""}`}
      data-testid={testId}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent: "amber" | "mint" | "slate";
}) {
  return (
    <article className={`stat-card accent-${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
