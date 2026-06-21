import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * A check is one verifiable assertion about a task's outcome. A task passes
 * only when all of its checks pass. Checks inspect the workspace (files,
 * shell commands) or the agent's final answer text.
 */
export type Check =
  | { type: "file_exists"; path: string }
  | { type: "file_contains"; path: string; text: string; regex?: boolean }
  | { type: "file_not_contains"; path: string; text: string; regex?: boolean }
  | { type: "answer_contains"; text: string; regex?: boolean; ignore_case?: boolean }
  | { type: "bash"; command: string };

export interface CheckResult {
  ok: boolean;
  detail: string;
}

export interface CheckContext {
  /** Workspace directory the task ran in. */
  cwd: string;
  /** The agent's final answer text (stdout of `cycode exec`). */
  answer: string;
}

function matches(haystack: string, needle: string, regex?: boolean, ignoreCase?: boolean): boolean {
  if (regex) return new RegExp(needle, ignoreCase ? "i" : "").test(haystack);
  return ignoreCase
    ? haystack.toLowerCase().includes(needle.toLowerCase())
    : haystack.includes(needle);
}

function readFileSafe(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function runCheck(check: Check, ctx: CheckContext): CheckResult {
  switch (check.type) {
    case "file_exists": {
      const ok = fs.existsSync(path.join(ctx.cwd, check.path));
      return { ok, detail: ok ? `${check.path} exists` : `${check.path} is missing` };
    }
    case "file_contains": {
      const content = readFileSafe(path.join(ctx.cwd, check.path));
      if (content === null) return { ok: false, detail: `${check.path} is missing` };
      const ok = matches(content, check.text, check.regex);
      return { ok, detail: `${check.path} ${ok ? "contains" : "does not contain"} ${JSON.stringify(check.text)}` };
    }
    case "file_not_contains": {
      const content = readFileSafe(path.join(ctx.cwd, check.path));
      if (content === null) return { ok: true, detail: `${check.path} absent (vacuously ok)` };
      const found = matches(content, check.text, check.regex);
      return { ok: !found, detail: `${check.path} ${found ? "still contains" : "no longer contains"} ${JSON.stringify(check.text)}` };
    }
    case "answer_contains": {
      const ok = matches(ctx.answer, check.text, check.regex, check.ignore_case);
      return { ok, detail: `answer ${ok ? "mentions" : "omits"} ${JSON.stringify(check.text)}` };
    }
    case "bash": {
      const res = spawnSync("/bin/bash", ["-c", check.command], {
        cwd: ctx.cwd,
        encoding: "utf8",
        timeout: 60_000,
      });
      const ok = res.status === 0;
      const out = (res.stdout + res.stderr).trim().slice(0, 200);
      return { ok, detail: `\`${check.command}\` exit ${res.status}${out ? ` — ${out}` : ""}` };
    }
  }
}

export interface TaskScore {
  name: string;
  category: string;
  passed: boolean;
  checks: CheckResult[];
  durationMs: number;
  error?: string;
}

/** A task passes only if every check passes. */
export function scoreTask(
  name: string,
  category: string,
  checks: Check[],
  ctx: CheckContext,
  durationMs: number,
): TaskScore {
  const results = checks.map((c) => runCheck(c, ctx));
  return {
    name,
    category,
    passed: results.every((r) => r.ok),
    checks: results,
    durationMs,
  };
}
