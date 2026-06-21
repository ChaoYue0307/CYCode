import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Check } from "./checks.js";

export interface EvalTask {
  name: string;
  category: string;
  prompt: string;
  /** Permission mode for the run (default acceptEdits). */
  mode?: "default" | "acceptEdits" | "plan" | "bypass";
  /** Files written into the workspace before the run, keyed by relative path. */
  setup?: Record<string, string>;
  checks: Check[];
}

const TASK_FIELDS = ["name", "category", "prompt", "checks"] as const;

export function validateTask(raw: unknown, source: string): EvalTask {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}: task must be a JSON object`);
  }
  const task = raw as Record<string, unknown>;
  for (const field of TASK_FIELDS) {
    if (!(field in task)) throw new Error(`${source}: missing required field "${field}"`);
  }
  if (!Array.isArray(task.checks) || task.checks.length === 0) {
    throw new Error(`${source}: "checks" must be a non-empty array`);
  }
  return task as unknown as EvalTask;
}

export function tasksDir(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "tasks");
}

export function loadTasks(dir = tasksDir(), filter?: string): EvalTask[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const tasks: EvalTask[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const task = validateTask(JSON.parse(fs.readFileSync(full, "utf8")), file);
    if (filter && !task.name.includes(filter) && !task.category.includes(filter)) continue;
    tasks.push(task);
  }
  return tasks;
}
