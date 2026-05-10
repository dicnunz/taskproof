import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "./cli.js";
import type { EvidenceBundle } from "./model.js";

describe("runCli", () => {
  const cleanupTargets: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.allSettled(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolvePromise, rejectPromise) => {
            server.close((error) => {
              if (error !== undefined && error !== null) {
                rejectPromise(error);
                return;
              }

              resolvePromise();
            });
          })
      )
    );

    await Promise.allSettled(
      cleanupTargets.splice(0).map((target) => rm(target, { recursive: true, force: true }))
    );
  });

  it("runs all supported steps and writes the canonical output tree", async () => {
    const { baseUrl } = await createDemoServer(servers);
    const sandbox = await mkdtemp(join(os.tmpdir(), "taskproof-cli-"));
    cleanupTargets.push(sandbox);
    const specPath = join(sandbox, "task.yaml");
    const outputDir = join(sandbox, "output");
    const stdout: string[] = [];
    const stderr: string[] = [];

    await writeFile(
      specPath,
      `
name: runner success
steps:
  - type: navigate
    url: /start
  - type: fill
    selector: "#name"
    value: Runner
  - type: press
    selector: "#name"
    key: Enter
  - type: assertText
    selector: "#greeting"
    text: "Entered: Runner"
    match: exact
  - type: click
    selector: "#trigger"
  - type: wait
    selector: "#message"
  - type: assertVisible
    selector: "#message"
  - type: assertText
    selector: "#message"
    text: "Saved Runner"
    match: exact
  - type: assertUrl
    value: /done?name=Runner
    match: includes
  - type: assertCount
    selector: ".item"
    count: 2
`,
      "utf8"
    );

    const exitCode = await runCli(
      ["run", "--url", `${baseUrl}/`, "--spec", specPath, "--out", outputDir],
      {
        stdout: {
          write(message) {
            stdout.push(message);
          }
        },
        stderr: {
          write(message) {
            stderr.push(message);
          }
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toBe("");
    expect(stdout.join("")).toContain("TaskProof passed");

    const bundle = await readBundle(outputDir);
    expect(bundle.run.status).toBe("passed");
    expect(bundle.summary.totalSteps).toBe(10);
    expect(bundle.summary.executedSteps).toBe(10);
    expect(bundle.summary.consoleErrorCount).toBeGreaterThanOrEqual(1);
    expect(bundle.summary.networkFailureCount).toBeGreaterThanOrEqual(1);
    expect(bundle.consoleEvents[0]?.text).toContain("simulated console failure");
    expect(bundle.networkEvents.some((event) => event.url.includes("/missing.json"))).toBe(true);
    expect(bundle.artifacts.specFile).toBe("spec.json");
    expect(bundle.artifacts.reportIndex).toBe("report/index.html");

    for (const step of bundle.stepResults) {
      await expect(stat(resolve(outputDir, step.artifacts.screenshot))).resolves.toBeDefined();
      await expect(stat(resolve(outputDir, step.artifacts.domSnapshot))).resolves.toBeDefined();
    }

    await expect(stat(join(outputDir, "bundle.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "spec.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "logs", "console-events.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "logs", "network-events.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "report", "index.html"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "taskproof-evidence.zip"))).resolves.toBeDefined();
    expect(await readdir(join(outputDir, "report", "assets"))).not.toHaveLength(0);

    const report = await readFile(join(outputDir, "report", "index.html"), "utf8");
    expect(report).toContain("runner success");
    expect(report).toContain("Optional $5 support receipt");
    expect(report).toContain("https://nicdunz.gumroad.com/l/smrimu");
    expect(report).toContain("Operator OS kit $39");
    expect(report).toContain("https://nicdunz.gumroad.com/l/agent-browser-operator-os");
    expect(report).toContain("Mini audit $149");
    expect(report).toContain("https://nicdunz.gumroad.com/l/agent-workflow-mini-audit");
    expect(report).toContain("Workflow audit $750");
    expect(report).toContain("https://nicdunz.gumroad.com/l/agent-workflow-audit");
    expect(report.toLowerCase()).toContain("provide account access");
    expect(report.toLowerCase()).toContain("public actions stay human-approved");
    expect(report.toLowerCase()).toContain("does not fix the codex chrome plugin");
    expect(report.toLowerCase()).toContain("legal, financial, or security advice");
    expect(report).toContain("No app credentials");
  });

  it("returns a failing exit code and stops after the first failed step", async () => {
    const { baseUrl } = await createDemoServer(servers);
    const sandbox = await mkdtemp(join(os.tmpdir(), "taskproof-cli-fail-"));
    cleanupTargets.push(sandbox);
    const specPath = join(sandbox, "task.json");
    const outputDir = join(sandbox, "output");
    const stderr: string[] = [];

    await writeFile(
      specPath,
      JSON.stringify(
        {
          name: "runner failure",
          steps: [
            {
              type: "navigate",
              url: "/start"
            },
            {
              type: "assertText",
              selector: "#title",
              text: "Wrong value",
              match: "exact"
            },
            {
              type: "assertVisible",
              selector: "#message"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const exitCode = await runCli(
      ["run", "--url", `${baseUrl}/`, "--spec", specPath, "--out", outputDir],
      {
        stdout: {
          write() {}
        },
        stderr: {
          write(message) {
            stderr.push(message);
          }
        }
      }
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toBe("");

    const bundle = await readBundle(outputDir);
    expect(bundle.run.status).toBe("failed");
    expect(bundle.summary.executedSteps).toBe(2);
    expect(bundle.stepResults).toHaveLength(2);
    expect(bundle.stepResults[1]?.status).toBe("failed");
    expect(bundle.stepResults[1]?.failure?.detail).toContain("equals");
  });

  it("prints clean help output without Commander sentinel noise", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["run", "--help"], {
      stdout: {
        write(message) {
          stdout.push(message);
        }
      },
      stderr: {
        write(message) {
          stderr.push(message);
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Usage: taskproof run [options]");
    expect(stdout.join("")).toContain("Examples:");
    expect(stdout.join("")).not.toContain("(outputHelp)");
    expect(stderr.join("")).toBe("");
  });

  it("prints the optional support receipt link", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(["support"], {
      stdout: {
        write(message) {
          stdout.push(message);
        }
      },
      stderr: {
        write(message) {
          stderr.push(message);
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("Support TaskProof");
    expect(stdout.join("")).toContain("https://nicdunz.gumroad.com/l/smrimu");
    expect(stdout.join("")).toContain("https://nicdunz.gumroad.com/l/agent-browser-operator-os");
    expect(stdout.join("")).toContain("https://nicdunz.gumroad.com/l/agent-workflow-mini-audit");
    expect(stdout.join("")).toContain("https://nicdunz.gumroad.com/l/agent-workflow-audit");
    expect(stdout.join("").toLowerCase()).toContain("provide account access");
    expect(stdout.join("").toLowerCase()).toContain("public actions stay human-approved");
    expect(stdout.join("").toLowerCase()).toContain("does not fix the codex chrome plugin");
    expect(stdout.join("").toLowerCase()).toContain("legal, financial, or security advice");
    expect(stdout.join("")).toContain("No app credentials");
    expect(stderr.join("")).toBe("");
  });

  it("uses repo-relative rerun metadata for repo-local specs and outputs", async () => {
    const { baseUrl } = await createDemoServer(servers);
    const sandbox = await mkdtemp(join(process.cwd(), ".taskproof-cli-local-"));
    cleanupTargets.push(sandbox);
    const specPath = join(sandbox, "task.yaml");
    const outputDir = join(sandbox, "output");

    await writeFile(
      specPath,
      `
name: relative metadata
steps:
  - type: navigate
    url: /start
  - type: assertVisible
    selector: "#title"
`,
      "utf8"
    );

    const exitCode = await runCli(["run", "--url", `${baseUrl}/`, "--spec", specPath, "--out", outputDir]);

    expect(exitCode).toBe(0);

    const bundle = await readBundle(outputDir);
    expect(bundle.run.specPath).toBe(`./${relative(process.cwd(), specPath).replaceAll("\\", "/")}`);
    expect(bundle.run.outputDir).toBe(`./${relative(process.cwd(), outputDir).replaceAll("\\", "/")}`);
    expect(bundle.rerun.command).not.toContain("cd ");
    expect(bundle.rerun.command).toContain(`--spec './${relative(process.cwd(), specPath).replaceAll("\\", "/")}'`);
    expect(bundle.rerun.command).toContain(`--out './${relative(process.cwd(), outputDir).replaceAll("\\", "/")}'`);

    const rerunScript = await readFile(join(outputDir, "rerun.sh"), "utf8");
    expect(rerunScript).toContain(`cd '${process.cwd()}'`);
  });
});

async function createDemoServer(servers: Server[]): Promise<{ baseUrl: string }> {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname === "/missing.json") {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "missing" }));
      return;
    }

    response.statusCode = 200;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>TaskProof Demo</title>
  </head>
  <body>
    <main>
      <h1 id="title">TaskProof Demo</h1>
      <p id="path">${requestUrl.pathname}</p>
      <label>
        Name
        <input id="name" />
      </label>
      <button id="trigger">Trigger</button>
      <p id="greeting"></p>
      <p id="message" hidden>Pending</p>
      <ul>
        <li class="item">Alpha</li>
        <li class="item">Beta</li>
      </ul>
    </main>
    <script>
      const input = document.querySelector("#name");
      const greeting = document.querySelector("#greeting");
      const message = document.querySelector("#message");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          greeting.textContent = "Entered: " + input.value;
        }
      });
      document.querySelector("#trigger").addEventListener("click", async () => {
        message.hidden = false;
        message.textContent = "Saved " + input.value;
        history.pushState({}, "", "/done?name=" + encodeURIComponent(input.value));
        console.error("simulated console failure");
        await fetch("/missing.json").catch(() => {});
      });
    </script>
  </body>
</html>`);
  });

  servers.push(server);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
    server.on("error", rejectPromise);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Unable to resolve demo server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function readBundle(outputDir: string): Promise<EvidenceBundle> {
  return JSON.parse(await readFile(join(outputDir, "bundle.json"), "utf8")) as EvidenceBundle;
}
