import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDir = join(rootDir, "examples/assets");
const sampleReportDir = join(rootDir, "examples/sample-report");
const reportFile = join(sampleReportDir, "report/index.html");
const demoUrl = "http://127.0.0.1:43173";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runCommand(args) {
  await execFileAsync(npmCommand(), args, { cwd: rootDir });
}

async function waitForUrl(url, timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureDemoServer() {
  try {
    await waitForUrl(demoUrl, 800);
    return { child: null, startedHere: false };
  } catch {
    const { spawn } = await import("node:child_process");
    const child = spawn(npmCommand(), ["run", "demo:app"], {
      cwd: rootDir,
      stdio: "ignore"
    });

    await waitForUrl(demoUrl);
    return { child, startedHere: true };
  }
}

async function stopDemoServer(server) {
  if (!server.startedHere || server.child === null || server.child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    server.child.once("exit", () => resolve());
    server.child.kill("SIGTERM");
  });
}

async function buildSampleReport() {
  await runCommand(["run", "demo:eval"]);
  await rm(sampleReportDir, { recursive: true, force: true });
  await cp(join(rootDir, "artifacts/demo-eval"), sampleReportDir, { recursive: true });
}

async function renderSocialPreview(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0;background:#0f172a;font-family:'Avenir Next','Helvetica Neue','Segoe UI',sans-serif;">
        <div style="position:relative;width:1200px;height:630px;overflow:hidden;color:#f8fafc;background:
          radial-gradient(circle at 16% 14%, rgba(251,191,36,0.18), transparent 32%),
          radial-gradient(circle at 85% 18%, rgba(59,130,246,0.18), transparent 28%),
          linear-gradient(180deg,#0f172a 0%,#111827 100%);">
          <div style="position:absolute;left:72px;top:76px;display:flex;align-items:center;gap:24px;">
            <div style="width:108px;height:108px;border-radius:28px;background:linear-gradient(135deg,#1e293b 0%,#0b1220 100%);display:grid;place-items:center;box-shadow:0 20px 40px rgba(0,0,0,0.28);">
              <svg width="70" height="70" viewBox="0 0 70 70" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 37L28 51L56 19" stroke="#FDBA74" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <div style="font-size:18px;letter-spacing:0.24em;text-transform:uppercase;color:#94a3b8;">Open-source dev tool</div>
              <div style="margin-top:12px;font-size:68px;font-weight:700;line-height:0.92;">TaskProof</div>
            </div>
          </div>
          <div style="position:absolute;left:72px;top:252px;max-width:820px;font-size:30px;line-height:1.35;color:#d6dde7;">
            Evidence-first UI task evaluation for web apps. Run a spec, capture screenshots and runtime failures, and ship a deterministic local report.
          </div>
          <div style="position:absolute;left:72px;bottom:70px;display:flex;gap:14px;">
            <div style="padding:14px 18px;border-radius:999px;background:rgba(255,255,255,0.08);font-size:18px;">Playwright runner</div>
            <div style="padding:14px 18px;border-radius:999px;background:rgba(255,255,255,0.08);font-size:18px;">Static HTML report</div>
            <div style="padding:14px 18px;border-radius:999px;background:rgba(255,255,255,0.08);font-size:18px;">Local-first</div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.screenshot({ path: join(assetsDir, "social-preview.png") });
  await page.close();
}

async function captureDemoApp(browser) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 980 } });
  await page.goto(demoUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(assetsDir, "demo-app.png"), fullPage: true });
  await page.close();
}

async function captureReport(browser) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
  await page.goto(pathToFileURL(reportFile).toString(), { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(assetsDir, "report-overview.png"), fullPage: true });
  await page.close();
}

async function recordDemoGif(browser) {
  const videoDir = join(tmpdir(), "taskproof-video");
  await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 920 }
    }
  });
  const page = await context.newPage();

  await page.goto(demoUrl, { waitUntil: "networkidle" });
  await page.fill('[data-testid="task-input"]', "Ship launch notes");
  await page.press('[data-testid="task-input"]', "Enter");
  await page.waitForTimeout(450);
  await page.click('[data-testid="view-diagnostics"]');
  await page.waitForTimeout(450);
  await page.click('[data-testid="run-sync"]');
  await page.waitForTimeout(1200);

  const video = page.video();
  await context.close();

  const videoPath = await video.path();
  const palettePath = join(videoDir, "palette.png");
  const gifPath = join(assetsDir, "demo.gif");

  await execFileAsync("/opt/homebrew/bin/ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vf",
    "fps=10,scale=1200:-1:flags=lanczos,palettegen",
    palettePath
  ]);
  await execFileAsync("/opt/homebrew/bin/ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-i",
    palettePath,
    "-lavfi",
    "fps=10,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse",
    gifPath
  ]);
}

async function main() {
  await mkdir(assetsDir, { recursive: true });
  await buildSampleReport();
  const server = await ensureDemoServer();
  const browser = await chromium.launch({ headless: true });

  try {
    await renderSocialPreview(browser);
    await captureDemoApp(browser);
    await captureReport(browser);
    await recordDemoGif(browser);
    await writeFile(join(assetsDir, ".generated"), "Generated by scripts/generate-readme-assets.mjs\n");
  } finally {
    await browser.close();
    await stopDemoServer(server);
  }
}

await main();
