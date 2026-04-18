# TaskProof Plan

## Goal
Build a polished local-first open-source project that evaluates web UI tasks against a target URL and a JSON or YAML task spec, captures evidence with Playwright, and produces a machine-readable bundle, a polished interactive HTML report, and a deterministic rerun command.

## Repo Shape
- `packages/taskproof`: CLI, runner, evidence model, zip/export helpers
- `apps/report-ui`: React + Vite report renderer used by generated reports
- `apps/demo-app`: bundled demo target app used by local validation and CI
- `examples`: committed sample report and README visuals
- `scripts`: small local automation for demo runs and asset generation

## Milestones

### M0. Repo Contract
Deliverables:
- `PLAN.md`
- `AGENTS.md`
- npm workspace scaffold
- strict TypeScript, Vitest, Playwright, ESLint, GitHub Actions baseline

Acceptance criteria:
- root commands exist for install, lint, typecheck, test, e2e, build, demo flows
- repo conventions and stop rules are documented

Validation:
- `npm install`
- `npm run lint`
- `npm run typecheck`

### M1. Evidence Runner And CLI
Deliverables:
- CLI command to run an evaluation from `--url` and `--spec`
- support for `click`, `fill`, `press`, `navigate`, `wait`, `assertText`, `assertVisible`, `assertUrl`, `assertCount`
- screenshot after each step
- console error capture
- failed network request capture
- timing, assertion result, scorecard, pass/fail summary
- deterministic rerun command
- zipped evidence bundle

Acceptance criteria:
- successful runs emit a stable output directory with JSON evidence, screenshots, DOM snapshots, HTML report, and `.zip`
- failed steps stop the run and explain the failure reason in evidence
- invalid specs fail with precise validation errors

Validation:
- `npm run test`
- `npm run demo:eval`

### M2. Interactive Report UI
Deliverables:
- polished HTML report generated from run evidence
- timeline of steps and events
- filters for passed, failed, assertions, console, network
- screenshot viewer
- scorecard and rerun command panel

Acceptance criteria:
- report opens as static HTML fully local
- report remains useful on both narrow and wide screens
- failure reasons are visible without opening raw JSON

Validation:
- `npm run build`
- local preview of generated report

### M3. Demo App And Specs
Deliverables:
- bundled demo web app with realistic flows
- at least 5 task specs covering success and failure cases
- one beautiful committed sample report in `examples/sample-report`

Acceptance criteria:
- CI can prove TaskProof against only repo-local assets
- demo app is intentionally styled and not placeholder-grade

Validation:
- `npm run demo:app`
- `npm run e2e`
- `npm run demo:eval`

### M4. Docs, Assets, And Release Shape
Deliverables:
- sharp `README.md` with exact quickstart
- architecture diagram
- screenshots
- demo GIF
- logo and social preview image
- MIT license

Acceptance criteria:
- README explains what TaskProof is, how it works, and exact commands
- visuals reflect the actual shipped UI

Validation:
- README command flow works from a clean clone

### M5. Final Review And Ship
Deliverables:
- separate Codex review pass
- cleaned generated artifacts committed intentionally
- git history prepared for push

Acceptance criteria:
- all required validation commands pass
- if a command fails twice, scope is reduced and repaired rather than thrashed
- repo is either pushed to GitHub or left fully ready with exact push commands

Validation:
- `npm install`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run e2e`
- `npm run build`
- `npm run demo:eval`

## Scope Guardrails
- no auth, database, cloud service, or paid API
- no placeholder UI or dead code
- v1 focuses on deterministic evidence capture and excellent reporting, not broad action coverage
- if any validation command fails twice, stop adding scope, fix the root cause, update this plan if scope changes, then continue
