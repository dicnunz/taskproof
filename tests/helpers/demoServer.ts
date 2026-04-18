import { spawn, type ChildProcess } from "node:child_process";

import { repoRoot } from "./demoSpecs";

export const demoBaseUrl = "http://127.0.0.1:43173";

export interface DemoServerHandle {
  process: ChildProcess | null;
  logs: string[];
  startedHere: boolean;
}

const wait = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

export const waitForHttpReady = async (
  url: string,
  timeoutMs = 20_000
): Promise<void> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await wait(250);
  }

  throw new Error(`Timed out waiting for ${url} to respond.`);
};

export const startDemoServer = async (): Promise<DemoServerHandle> => {
  try {
    await waitForHttpReady(demoBaseUrl, 800);
    return {
      process: null,
      logs: [],
      startedHere: false
    };
  } catch {
    // Fall through and boot the local dev server.
  }

  const logs: string[] = [];
  const child = spawn("npm", ["run", "demo:app"], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString());
  });

  child.stderr.on("data", (chunk: Buffer) => {
    logs.push(chunk.toString());
  });

  try {
    await waitForHttpReady(demoBaseUrl);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(
      `Demo app failed to boot.\n${logs.join("")}\n${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    process: child,
    logs,
    startedHere: true
  };
};

export const stopDemoServer = async (handle: DemoServerHandle): Promise<void> =>
  new Promise((resolve) => {
    if (!handle.startedHere || handle.process === null || handle.process.exitCode !== null) {
      resolve();
      return;
    }

    handle.process.once("exit", () => resolve());
    handle.process.kill("SIGTERM");
  });
