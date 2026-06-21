import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { scoreTask, type TaskScore } from "./checks.js";
import { loadTasks, type EvalTask } from "./tasks.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface RunnerOptions {
  model?: string;
  filter?: string;
  keep: boolean;
  jsonOut?: string;
}

function parseArgs(argv: string[]): RunnerOptions {
  const opts: RunnerOptions = { keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") opts.model = argv[++i];
    else if (a === "--filter") opts.filter = argv[++i];
    else if (a === "--keep") opts.keep = true;
    else if (a === "--json-out") opts.jsonOut = argv[++i];
  }
  return opts;
}

function hasProviderKey(): boolean {
  return [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENROUTER_API_KEY",
  ].some((k) => process.env[k]);
}

function cliEntry(): { file: string; baseArgs: string[] } {
  const dist = path.join(repoRoot, "dist", "cli.js");
  if (fs.existsSync(dist)) return { file: process.execPath, baseArgs: [dist] };
  // fall back to running from source via the local tsx
  return { file: process.execPath, baseArgs: [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), path.join(repoRoot, "src", "cli.ts")] };
}

/** Run one task in an isolated workspace and capture the agent's answer. */
function runAgent(task: EvalTask, workspace: string, model?: string): Promise<{ answer: string; code: number | null }> {
  const { file, baseArgs } = cliEntry();
  const args = [
    ...baseArgs,
    "exec",
    task.prompt,
    "--cwd",
    workspace,
    "--mode",
    task.mode ?? "acceptEdits",
  ];
  if (model) args.push("--model", model);
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd: workspace });
    let answer = "";
    child.stdout.on("data", (d) => (answer += d));
    child.stderr.on("data", () => {}); // tool activity; not part of the answer
    child.on("close", (code) => resolve({ answer: answer.trim(), code }));
    child.on("error", () => resolve({ answer: "", code: null }));
  });
}

function setupWorkspace(task: EvalTask, keep: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cyeval-${task.name}-`));
  for (const [rel, content] of Object.entries(task.setup ?? {})) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  if (keep) process.stderr.write(pc.dim(`  workspace: ${dir}\n`));
  return dir;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (!hasProviderKey()) {
    process.stderr.write(
      pc.yellow(
        "No provider API key set — skipping evals. Set ANTHROPIC_API_KEY (or another) to run.\n",
      ),
    );
    process.exit(0);
  }

  const tasks = loadTasks(undefined, opts.filter);
  if (tasks.length === 0) {
    process.stderr.write("No tasks matched.\n");
    process.exit(0);
  }

  process.stderr.write(pc.bold(`Running ${tasks.length} eval task(s)${opts.model ? ` on ${opts.model}` : ""}\n\n`));
  const scores: TaskScore[] = [];

  for (const task of tasks) {
    const workspace = setupWorkspace(task, opts.keep);
    const started = Date.now();
    let score: TaskScore;
    try {
      const { answer } = await runAgent(task, workspace, opts.model);
      score = scoreTask(task.name, task.category, task.checks, { cwd: workspace, answer }, Date.now() - started);
    } catch (err) {
      score = {
        name: task.name,
        category: task.category,
        passed: false,
        checks: [],
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    scores.push(score);
    const mark = score.passed ? pc.green("PASS") : pc.red("FAIL");
    process.stderr.write(`${mark}  ${pc.bold(task.name)} ${pc.dim(`(${task.category}, ${(score.durationMs / 1000).toFixed(1)}s)`)}\n`);
    if (!score.passed) {
      for (const c of score.checks.filter((r) => !r.ok)) {
        process.stderr.write(pc.dim(`      ✗ ${c.detail}\n`));
      }
      if (score.error) process.stderr.write(pc.dim(`      ! ${score.error}\n`));
    }
    if (!opts.keep) fs.rmSync(workspace, { recursive: true, force: true });
  }

  const passed = scores.filter((s) => s.passed).length;
  const rate = ((passed / scores.length) * 100).toFixed(0);
  process.stderr.write(`\n${pc.bold(`${passed}/${scores.length} passed (${rate}%)`)}\n`);

  if (opts.jsonOut) {
    fs.writeFileSync(
      opts.jsonOut,
      JSON.stringify({ model: opts.model ?? null, passed, total: scores.length, rate: Number(rate), scores }, null, 2),
    );
  }

  process.exit(passed === scores.length ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`eval runner error: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
