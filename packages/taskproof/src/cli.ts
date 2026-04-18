#!/usr/bin/env node
import { Command, CommanderError } from "commander";

import { executeTaskProof } from "./runner.js";

export interface CliIo {
  stdout: {
    write(message: string): void;
  };
  stderr: {
    write(message: string): void;
  };
}

export async function runCli(args: string[], io: CliIo = defaultIo): Promise<number> {
  let exitCode = 0;

  const program = new Command();
  program
    .name("taskproof")
    .description("Evidence-first UI task evaluation harness")
    .exitOverride();

  program
    .command("run")
    .description("Run a task spec against a target URL and produce evidence")
    .requiredOption("--url <url>", "Target URL")
    .requiredOption("--spec <path>", "Path to a JSON or YAML task spec")
    .option("--out <dir>", "Output directory for evidence")
    .option("--headed", "Run the browser headed", false)
    .action(async (options) => {
      try {
        const result = await executeTaskProof({
          url: options.url,
          specPath: options.spec,
          outputDir: options.out,
          headed: options.headed
        });

        io.stdout.write(`TaskProof ${result.bundle.summary.status}\n`);
        io.stdout.write(`Report: ${result.reportPath}\n`);
        io.stdout.write(`Evidence: ${result.outputDir}\n`);
        io.stdout.write(`Rerun: ${result.bundle.rerun.command}\n`);

        if (result.bundle.summary.status === "failed") {
          exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        io.stderr.write(`TaskProof failed: ${message}\n`);
        exitCode = 1;
      }
    });

  try {
    await program.parseAsync(["node", "taskproof", ...args]);
  } catch (error) {
    if (error instanceof CommanderError) {
      io.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    throw error;
  }

  return exitCode;
}

const defaultIo: CliIo = {
  stdout: {
    write(message) {
      process.stdout.write(message);
    }
  },
  stderr: {
    write(message) {
      process.stderr.write(message);
    }
  }
};

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
