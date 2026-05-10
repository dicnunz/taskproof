import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EvidenceBundle } from "./model.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const reportDistDir = join(repoRoot, "apps/report-ui/dist");
const fallbackAssetPath = "report/assets/report.css";
const supportReceiptUrl = "https://nicdunz.gumroad.com/l/smrimu";
const operatorOsUrl = "https://nicdunz.gumroad.com/l/agent-browser-operator-os";
const miniAuditUrl = "https://nicdunz.gumroad.com/l/agent-workflow-mini-audit";
const workflowAuditUrl = "https://nicdunz.gumroad.com/l/agent-workflow-audit";

async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}

async function listFiles(rootDir: string, currentDir: string = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDir, entryPath)));
      continue;
    }

    files.push(relative(rootDir, entryPath).replaceAll("\\", "/"));
  }

  return files.sort();
}

function buildReportPayload(bundle: EvidenceBundle): Record<string, unknown> {
  const consoleByStep = new Map<string, EvidenceBundle["consoleEvents"]>();
  const networkByStep = new Map<string, EvidenceBundle["networkEvents"]>();

  for (const event of bundle.consoleEvents) {
    if (!event.stepId) {
      continue;
    }

    const existing = consoleByStep.get(event.stepId) ?? [];
    existing.push(event);
    consoleByStep.set(event.stepId, existing);
  }

  for (const event of bundle.networkEvents) {
    if (!event.stepId) {
      continue;
    }

    const existing = networkByStep.get(event.stepId) ?? [];
    existing.push(event);
    networkByStep.set(event.stepId, existing);
  }

  const assertionsTotal = bundle.stepResults.reduce(
    (count, step) => count + step.assertions.length,
    0
  );
  const assertionsPassed = bundle.stepResults.reduce(
    (count, step) => count + step.assertions.filter((assertion) => assertion.passed).length,
    0
  );
  const assertionsFailed = assertionsTotal - assertionsPassed;

  return {
    run: {
      name: bundle.run.name,
      taskId: bundle.run.id,
      targetUrl: bundle.target.initialUrl,
      specPath: bundle.run.specPath,
      startedAt: bundle.run.startedAt,
      generatedAt: bundle.run.finishedAt,
      durationMs: bundle.run.durationMs,
      rerunCommand: bundle.rerun.command,
      runnerVersion: bundle.schemaVersion
    },
    summary: {
      verdict: bundle.summary.status,
      score: {
        earned: bundle.summary.passedSteps,
        total: bundle.summary.totalSteps,
        percent: bundle.summary.score,
        label: "steps"
      },
      steps: {
        total: bundle.summary.totalSteps,
        passed: bundle.summary.passedSteps,
        failed: bundle.summary.failedSteps,
        skipped: bundle.summary.totalSteps - bundle.summary.executedSteps
      },
      assertions: {
        total: assertionsTotal,
        passed: assertionsPassed,
        failed: assertionsFailed,
        skipped: 0
      },
      consoleErrors: bundle.summary.consoleErrorCount,
      networkFailures: bundle.summary.networkFailureCount,
      durationMs: bundle.summary.durationMs,
      screenshotCount: bundle.summary.screenshotCount
    },
    steps: bundle.stepResults.map((step) => ({
      id: step.id,
      index: step.index,
      title: step.name,
      type: step.type,
      status: step.status,
      startedAt: step.startedAt,
      durationMs: step.durationMs,
      selector:
        typeof step.input.selector === "string" ? step.input.selector : undefined,
      value: typeof step.input.value === "string" ? step.input.value : undefined,
      url: step.url,
      reason: step.failure?.message ?? step.failure?.detail,
      screenshot: {
        path: toReportHref(step.artifacts.screenshot),
        label: `${step.name} screenshot`
      },
      assertions: step.assertions.map((assertion, index) => ({
        id: `${step.id}-assertion-${index + 1}`,
        label: assertion.detail ?? `${step.name} assertion`,
        status: assertion.passed ? "passed" : "failed",
        expected: String(assertion.expected),
        actual: String(assertion.actual),
        message: assertion.detail
      })),
      console: (consoleByStep.get(step.id) ?? []).map((event) => ({
        id: event.id,
        level: event.type === "warning" ? "warn" : event.type,
        text: event.text,
        timestamp: event.timestamp
      })),
      network: (networkByStep.get(step.id) ?? []).map((event) => ({
        id: event.id,
        method: event.method,
        url: event.url,
        status:
          event.kind === "http-error" || event.kind === "requestfailed" ? "failed" : "passed",
        statusCode: event.status,
        failureText: event.failureText,
        timestamp: event.timestamp
      }))
    })),
    timeline: []
  };
}

function injectBundle(template: string, bundle: EvidenceBundle): string {
  const payloadJson = JSON.stringify(buildReportPayload(bundle)).replace(/</g, "\\u003c");
  const title = `${bundle.run.name} · TaskProof`;
  const titledHtml = template.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);

  return titledHtml.replace(
    '<script id="taskproof-evidence" type="application/json"></script>',
    `<script id="taskproof-evidence" type="application/json">${payloadJson}</script>`
  );
}

function ensureSupportFooter(html: string): string {
  if (html.includes(supportReceiptUrl)) {
    return html;
  }

  const footer = `<style>
  .taskproof-support-footer {
    width: min(1480px, calc(100vw - 32px));
    margin: 0 auto 40px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.72);
    padding: 20px 22px;
    color: #223042;
    font-family: "Avenir Next", "Segoe UI Variable", "Helvetica Neue", sans-serif;
  }
  .taskproof-support-footer p { margin: 4px 0 0; color: #5b6679; }
  .taskproof-support-footer .taskproof-support-links { display: flex; flex-wrap: wrap; gap: 10px 12px; margin-top: 12px; }
  .taskproof-support-footer a { display: inline-flex; border: 1px solid rgba(37, 99, 235, 0.22); border-radius: 999px; background: rgba(37, 99, 235, 0.12); color: #2563eb; padding: 10px 14px; font-weight: 800; text-decoration: none; }
</style>
<footer class="taskproof-support-footer">
  <strong>Support TaskProof</strong>
  <p>Optional support, self-serve browser/account/public-action control templates, and written audits for redacted report bundles or UI task specs. Operator OS covers approval lanes, proof, handoffs, and go/no-go checks; public actions stay human-approved. It does not provide account access and does not fix the Codex Chrome plugin, guarantee browser automation, include custom setup, include calls, or provide legal, financial, or security advice. No app credentials, private auth flows, tokens, session cookies, production data, call, or gated report access.</p>
  <div class="taskproof-support-links">
    <a href="${supportReceiptUrl}" target="_blank" rel="noreferrer">Optional $5 support receipt</a>
    <a href="${operatorOsUrl}" target="_blank" rel="noreferrer">Operator OS kit $39</a>
    <a href="${miniAuditUrl}" target="_blank" rel="noreferrer">Mini audit $149</a>
    <a href="${workflowAuditUrl}" target="_blank" rel="noreferrer">Workflow audit $750</a>
  </div>
</footer>`;

  return html.replace("</body>", `${footer}\n  </body>`);
}

async function inlineBuiltAssets(template: string): Promise<string> {
  const cssMatch = template.match(
    /<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/
  );
  const jsMatch = template.match(
    /<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/
  );

  let result = template;

  if (cssMatch?.[1]) {
    const css = await readFile(join(reportDistDir, "assets", cssMatch[1]), "utf8");
    result = result.replace(cssMatch[0], () => {
      const escapedCss = css.replaceAll("</style>", "<\\/style>");
      return `<style>${escapedCss}</style>`;
    });
  }

  if (jsMatch?.[1]) {
    const js = await readFile(join(reportDistDir, "assets", jsMatch[1]), "utf8");
    result = result.replace(jsMatch[0], () => {
      const escapedJs = js.replaceAll("</script>", "<\\/script>");
      return `<script type="module">${escapedJs}</script>`;
    });
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toReportHref(rootRelativePath: string): string {
  return `../${rootRelativePath}`;
}

function renderFallbackReport(bundle: EvidenceBundle): string {
  const statusClass = bundle.summary.status === "passed" ? "status-pass" : "status-fail";
  const consoleByStep = new Map<string, EvidenceBundle["consoleEvents"]>();
  const networkByStep = new Map<string, EvidenceBundle["networkEvents"]>();

  for (const event of bundle.consoleEvents) {
    if (!event.stepId) {
      continue;
    }

    const entries = consoleByStep.get(event.stepId) ?? [];
    entries.push(event);
    consoleByStep.set(event.stepId, entries);
  }

  for (const event of bundle.networkEvents) {
    if (!event.stepId) {
      continue;
    }

    const entries = networkByStep.get(event.stepId) ?? [];
    entries.push(event);
    networkByStep.set(event.stepId, entries);
  }

  const stepsHtml = bundle.stepResults
    .map((step) => {
      const consoleItems = (consoleByStep.get(step.id) ?? [])
        .map((event) => `${event.type}: ${event.text}`)
        .join(" · ");
      const networkItems = (networkByStep.get(step.id) ?? [])
        .map((event) => `${event.method} ${event.url}`)
        .join(" · ");

      return `<article class="step">
  <div class="step-header">
    <div>
      <h3>${escapeHtml(step.name)}</h3>
      <p class="muted">${escapeHtml(step.type)}</p>
    </div>
    <span class="status ${step.status === "passed" ? "status-pass" : "status-fail"}">${escapeHtml(step.status)}</span>
  </div>
  <p class="muted mono">${escapeHtml(step.url)}</p>
  ${
    step.failure
      ? `<p class="error">${escapeHtml(step.failure.message)}${step.failure.detail ? ` · ${escapeHtml(step.failure.detail)}` : ""}</p>`
      : ""
  }
  <img src="${escapeHtml(toReportHref(step.artifacts.screenshot))}" alt="${escapeHtml(step.name)} screenshot" />
  <p class="muted">DOM: <a class="mono" href="${escapeHtml(toReportHref(step.artifacts.domSnapshot))}">${escapeHtml(step.artifacts.domSnapshot)}</a></p>
  <p class="muted">Console: ${escapeHtml(consoleItems || "none")}</p>
  <p class="muted">Network: ${escapeHtml(networkItems || "none")}</p>
</article>`;
    })
    .join("\n");

  const consoleRows = bundle.consoleEvents
    .map(
      (event) => `<tr>
  <td>${escapeHtml(event.id)}</td>
  <td>${escapeHtml(event.stepId ?? "setup")}</td>
  <td>${escapeHtml(event.type)}</td>
  <td>${escapeHtml(event.text)}</td>
</tr>`
    )
    .join("\n");

  const networkRows = bundle.networkEvents
    .map(
      (event) => `<tr>
  <td>${escapeHtml(event.id)}</td>
  <td>${escapeHtml(event.stepId ?? "setup")}</td>
  <td>${escapeHtml(event.method)}</td>
  <td>${escapeHtml(event.url)}</td>
  <td>${escapeHtml(event.failureText ?? String(event.status ?? ""))}</td>
</tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(bundle.run.name)} · TaskProof</title>
    <link rel="stylesheet" href="./assets/report.css" />
  </head>
  <body>
    <main>
      <section class="panel hero">
        <div class="hero-top">
          <div>
            <p class="muted">TaskProof evidence report</p>
            <h1>${escapeHtml(bundle.run.name)}</h1>
          </div>
          <span class="status ${statusClass}">${escapeHtml(bundle.summary.status)}</span>
        </div>
        <div class="cards">
          <div class="card"><span class="muted">Steps</span><strong>${bundle.summary.passedSteps}/${bundle.summary.totalSteps}</strong></div>
          <div class="card"><span class="muted">Score</span><strong>${bundle.summary.score}%</strong></div>
          <div class="card"><span class="muted">Console errors</span><strong>${bundle.summary.consoleErrorCount}</strong></div>
          <div class="card"><span class="muted">Network failures</span><strong>${bundle.summary.networkFailureCount}</strong></div>
        </div>
      </section>

      <section class="panel section two-up">
        <div class="card">
          <h2>Rerun</h2>
          <pre class="mono">${escapeHtml(bundle.rerun.command)}</pre>
        </div>
        <div class="card">
          <h2>Artifacts</h2>
          <p class="muted">Bundle: <a class="mono" href="../bundle.json">bundle.json</a></p>
          <p class="muted">Spec: <a class="mono" href="${escapeHtml(toReportHref(bundle.artifacts.specFile))}">${escapeHtml(bundle.artifacts.specFile)}</a></p>
          <p class="muted">Zip: <a class="mono" href="${escapeHtml(toReportHref(bundle.artifacts.zipFile))}">${escapeHtml(bundle.artifacts.zipFile)}</a></p>
          <p class="muted">Console log: <a class="mono" href="${escapeHtml(toReportHref(bundle.artifacts.consoleLog))}">${escapeHtml(bundle.artifacts.consoleLog)}</a></p>
          <p class="muted">Network log: <a class="mono" href="${escapeHtml(toReportHref(bundle.artifacts.networkLog))}">${escapeHtml(bundle.artifacts.networkLog)}</a></p>
        </div>
      </section>

      <section class="panel">
        <div class="section">
          <h2>Steps</h2>
        </div>
        <div class="steps">
          ${stepsHtml}
        </div>
      </section>

      <section class="panel section">
        <h2>Console events</h2>
        <table>
          <thead>
            <tr><th>ID</th><th>Step</th><th>Type</th><th>Text</th></tr>
          </thead>
          <tbody>
            ${consoleRows || '<tr><td colspan="4">None</td></tr>'}
          </tbody>
        </table>
      </section>

      <section class="panel section">
        <h2>Network events</h2>
        <table>
          <thead>
            <tr><th>ID</th><th>Step</th><th>Method</th><th>URL</th><th>Failure</th></tr>
          </thead>
          <tbody>
            ${networkRows || '<tr><td colspan="5">None</td></tr>'}
          </tbody>
        </table>
      </section>

      <footer class="panel section support-panel">
        <div>
          <h2>Support TaskProof</h2>
          <p class="muted">Optional support, self-serve browser/account/public-action control templates, and written audits for redacted report bundles or UI task specs. Operator OS covers approval lanes, proof, handoffs, and go/no-go checks; public actions stay human-approved. It does not provide account access and does not fix the Codex Chrome plugin, guarantee browser automation, include custom setup, include calls, or provide legal, financial, or security advice. No app credentials, private auth flows, tokens, session cookies, production data, call, or gated report access.</p>
        </div>
        <div class="support-links">
          <a href="${supportReceiptUrl}">Optional $5 support receipt</a>
          <a href="${operatorOsUrl}">Operator OS kit $39</a>
          <a href="${miniAuditUrl}">Mini audit $149</a>
          <a href="${workflowAuditUrl}">Workflow audit $750</a>
        </div>
      </footer>
    </main>
  </body>
</html>`;
}

const FALLBACK_CSS = `
:root {
  color-scheme: light;
  --bg: #f4efe8;
  --panel: rgba(255, 251, 246, 0.94);
  --panel-strong: #fffaf4;
  --line: #dacbbb;
  --text: #221a12;
  --muted: #64584c;
  --pass: #1f7a47;
  --pass-soft: #d9f2e2;
  --fail: #9a2b22;
  --fail-soft: #f8ddd8;
  --shadow: 0 18px 48px rgba(70, 48, 24, 0.12);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
  background:
    radial-gradient(circle at top left, rgba(184, 140, 96, 0.18), transparent 38%),
    linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
  color: var(--text);
}
main {
  width: min(1180px, calc(100vw - 32px));
  margin: 24px auto 48px;
  display: grid;
  gap: 20px;
}
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.hero { padding: 28px; display: grid; gap: 18px; }
.hero-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(2rem, 3.2vw, 3.2rem); line-height: 0.95; }
h2 { font-size: 1.15rem; margin-bottom: 12px; }
.muted { color: var(--muted); }
.status { border-radius: 999px; padding: 10px 16px; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.status-pass { color: var(--pass); background: var(--pass-soft); }
.status-fail { color: var(--fail); background: var(--fail-soft); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.card { padding: 16px; border-radius: 18px; background: var(--panel-strong); border: 1px solid var(--line); }
.card strong { display: block; font-size: 1.5rem; margin-top: 6px; }
.two-up { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.section { padding: 24px 28px 28px; }
.mono { font-family: "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace; font-size: 0.92rem; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.steps { display: grid; gap: 18px; }
.step { display: grid; gap: 14px; padding: 20px; border-top: 1px solid var(--line); }
.step:first-child { border-top: 0; }
.step-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.error { padding: 12px 14px; border-radius: 16px; background: var(--fail-soft); color: var(--fail); border: 1px solid rgba(154, 43, 34, 0.2); }
img { width: 100%; border-radius: 18px; border: 1px solid var(--line); background: #fff; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 0; border-top: 1px solid rgba(218, 203, 187, 0.7); vertical-align: top; }
th { color: var(--muted); font-size: 0.84rem; font-weight: 600; padding-top: 0; border-top: 0; }
td + td, th + th { padding-left: 12px; }
a { color: inherit; }
.support-panel { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
.support-panel a { flex: 0 0 auto; border: 1px solid var(--line); border-radius: 999px; background: var(--panel-strong); padding: 10px 14px; font-weight: 700; text-decoration: none; }
@media (max-width: 720px) {
  main { width: min(100vw - 16px, 1180px); margin-top: 12px; }
  .hero, .section { padding: 18px; }
  .step { padding: 16px; }
  .support-panel { display: block; }
  .support-panel a { display: inline-flex; margin-top: 12px; }
}
`;

async function writeFallbackReport(
  bundle: EvidenceBundle,
  rootOutputDir: string,
  reportDir: string
): Promise<{ indexPath: string; assetPaths: string[] }> {
  const assetsDir = join(reportDir, "assets");
  const reportPath = join(reportDir, "index.html");
  const cssPath = join(assetsDir, "report.css");

  await mkdir(assetsDir, { recursive: true });
  await writeFile(reportPath, renderFallbackReport(bundle), "utf8");
  await writeFile(cssPath, FALLBACK_CSS, "utf8");

  return {
    indexPath: relative(rootOutputDir, reportPath).replaceAll("\\", "/"),
    assetPaths: [fallbackAssetPath]
  };
}

export async function writeStaticReport(
  bundle: EvidenceBundle,
  rootOutputDir: string,
  reportDir: string
): Promise<{ indexPath: string; assetPaths: string[] }> {
  try {
    await access(reportDistDir);
    await mkdir(reportDir, { recursive: true });
    await copyDirectory(reportDistDir, reportDir);

    const templatePath = join(reportDistDir, "index.html");
    const html = await readFile(templatePath, "utf8");
    const rendered = ensureSupportFooter(await inlineBuiltAssets(injectBundle(html, bundle)));
    const reportPath = join(reportDir, "index.html");

    await writeFile(reportPath, rendered, "utf8");

    return {
      indexPath: relative(rootOutputDir, reportPath).replaceAll("\\", "/"),
      assetPaths: (await listFiles(join(rootOutputDir, "report/assets"))).map((asset) =>
        `report/assets/${asset}`
      )
    };
  } catch {
    return writeFallbackReport(bundle, rootOutputDir, reportDir);
  }
}
