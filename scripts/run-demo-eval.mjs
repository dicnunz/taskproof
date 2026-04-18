import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const demoUrl = "http://127.0.0.1:43173";
const outputDir = join(rootDir, "artifacts/demo-eval");
const specPath = join(rootDir, "demo/specs/diagnostics-sync.yaml");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand(), args, {
      cwd: rootDir,
      stdio: "inherit",
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: npm ${args.join(" ")}`));
    });
  });
}

function waitForUrl(url, timeoutMs = 120_000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 500) < 500) {
          resolve();
          return;
        }

        retry();
      });

      request.on("error", retry);
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      setTimeout(tick, 350);
    };

    tick();
  });
}

async function ensureDemoServer() {
  try {
    await waitForUrl(demoUrl, 800);
    return { child: null, startedHere: false };
  } catch {
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

async function main() {
  await runCommand(["--workspace", "@taskproof/report-ui", "run", "build"]);
  await rm(outputDir, { recursive: true, force: true });
  const server = await ensureDemoServer();

  try {
    await runCommand([
      "run",
      "taskproof",
      "--",
      "run",
      "--url",
      demoUrl,
      "--spec",
      specPath,
      "--out",
      outputDir
    ]);
  } finally {
    await stopDemoServer(server);
  }
}

await main();
