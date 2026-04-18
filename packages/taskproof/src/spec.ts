import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { TaskSpec } from "./model.js";

const stepNameSchema = z.string().trim().min(1).optional();

const clickStepSchema = z.object({
  type: z.literal("click"),
  name: stepNameSchema,
  selector: z.string().trim().min(1)
});

const fillStepSchema = z.object({
  type: z.literal("fill"),
  name: stepNameSchema,
  selector: z.string().trim().min(1),
  value: z.string()
});

const pressStepSchema = z.object({
  type: z.literal("press"),
  name: stepNameSchema,
  key: z.string().trim().min(1),
  selector: z.string().trim().min(1).optional()
});

const navigateStepSchema = z.object({
  type: z.literal("navigate"),
  name: stepNameSchema,
  url: z.string().trim().min(1),
  waitUntil: z
    .enum(["load", "domcontentloaded", "networkidle", "commit"])
    .optional()
});

const waitStepSchema = z
  .object({
    type: z.literal("wait"),
    name: stepNameSchema,
    ms: z.number().int().positive().optional(),
    selector: z.string().trim().min(1).optional(),
    state: z.enum(["visible", "hidden", "attached", "detached"]).optional()
  })
  .superRefine((value, ctx) => {
    if (!value.ms && !value.selector) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wait step needs either `ms` or `selector`"
      });
    }
  });

const assertTextStepSchema = z.object({
  type: z.literal("assertText"),
  name: stepNameSchema,
  selector: z.string().trim().min(1),
  text: z.string(),
  match: z.enum(["includes", "exact"]).optional()
});

const assertVisibleStepSchema = z.object({
  type: z.literal("assertVisible"),
  name: stepNameSchema,
  selector: z.string().trim().min(1),
  visible: z.boolean().optional()
});

const assertUrlStepSchema = z.object({
  type: z.literal("assertUrl"),
  name: stepNameSchema,
  value: z.string().trim().min(1),
  match: z.enum(["includes", "exact"]).optional()
});

const assertCountStepSchema = z.object({
  type: z.literal("assertCount"),
  name: stepNameSchema,
  selector: z.string().trim().min(1),
  count: z.number().int().min(0)
});

const taskStepSchema = z.discriminatedUnion("type", [
  clickStepSchema,
  fillStepSchema,
  pressStepSchema,
  navigateStepSchema,
  waitStepSchema,
  assertTextStepSchema,
  assertVisibleStepSchema,
  assertUrlStepSchema,
  assertCountStepSchema
]);

const taskSpecSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  viewport: z
    .object({
      width: z.number().int().min(320),
      height: z.number().int().min(320)
    })
    .optional(),
  steps: z.array(taskStepSchema).min(1)
});

function defaultSpecName(filePath: string): string {
  const fileName = basename(filePath, extname(filePath));

  return fileName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseSource(rawSource: string, filePath: string): unknown {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return parseYaml(rawSource);
  }

  return JSON.parse(rawSource);
}

export async function loadTaskSpec(filePath: string): Promise<TaskSpec> {
  const rawSource = await readFile(filePath, "utf8");
  const parsed = parseSource(rawSource, filePath);
  const spec = taskSpecSchema.parse(parsed);

  return {
    ...spec,
    name: spec.name ?? defaultSpecName(filePath)
  };
}
