import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCheck, scoreTask, type Check } from "../evals/checks.js";
import { loadTasks, tasksDir, validateTask } from "../evals/tasks.js";
import { makeTmpDir } from "./helpers.js";

describe("eval checks", () => {
  const ctx = (cwd: string, answer = "") => ({ cwd, answer });

  it("file_exists / file_contains / file_not_contains", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "a.py"), "def score(xs):\n    return sum(xs)\n");
    expect(runCheck({ type: "file_exists", path: "a.py" }, ctx(dir)).ok).toBe(true);
    expect(runCheck({ type: "file_exists", path: "missing" }, ctx(dir)).ok).toBe(false);
    expect(runCheck({ type: "file_contains", path: "a.py", text: "def score" }, ctx(dir)).ok).toBe(true);
    expect(runCheck({ type: "file_contains", path: "a.py", text: "compute_score" }, ctx(dir)).ok).toBe(false);
    expect(runCheck({ type: "file_not_contains", path: "a.py", text: "compute_score" }, ctx(dir)).ok).toBe(true);
  });

  it("file_contains supports regex", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "r.txt"), "val_acc=0.871");
    expect(runCheck({ type: "file_contains", path: "r.txt", text: "0\\.8\\d\\d", regex: true }, ctx(dir)).ok).toBe(true);
  });

  it("answer_contains matches the agent answer", () => {
    expect(runCheck({ type: "answer_contains", text: "src/numbers.py" }, ctx("/", "It's in src/numbers.py")).ok).toBe(true);
    expect(runCheck({ type: "answer_contains", text: "FACTORIAL", ignore_case: true }, ctx("/", "the factorial fn")).ok).toBe(true);
    expect(runCheck({ type: "answer_contains", text: "nope" }, ctx("/", "nothing here")).ok).toBe(false);
  });

  it("bash check passes on exit 0, fails otherwise", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "ok"), "");
    expect(runCheck({ type: "bash", command: "test -f ok" }, ctx(dir)).ok).toBe(true);
    expect(runCheck({ type: "bash", command: "test -f nope" }, ctx(dir)).ok).toBe(false);
  });

  it("scoreTask passes only when all checks pass", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "f"), "hello");
    const checks: Check[] = [
      { type: "file_exists", path: "f" },
      { type: "file_contains", path: "f", text: "hello" },
    ];
    expect(scoreTask("t", "code", checks, ctx(dir), 10).passed).toBe(true);
    expect(
      scoreTask("t", "code", [...checks, { type: "file_contains", path: "f", text: "bye" }], ctx(dir), 10).passed,
    ).toBe(false);
  });
});

describe("eval task loading", () => {
  it("validateTask rejects malformed tasks", () => {
    expect(() => validateTask({}, "x")).toThrow(/required field/);
    expect(() => validateTask({ name: "a", category: "b", prompt: "c", checks: [] }, "x")).toThrow(/non-empty/);
    expect(() =>
      validateTask({ name: "a", category: "b", prompt: "c", checks: [{ type: "file_exists", path: "p" }] }, "x"),
    ).not.toThrow();
  });

  it("loads the bundled task fixtures and they are well-formed", () => {
    const tasks = loadTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    for (const t of tasks) {
      expect(t.name).toBeTruthy();
      expect(t.checks.length).toBeGreaterThan(0);
    }
    expect(tasks.map((t) => t.name)).toContain("fix-bug-divide");
  });

  it("every shipped task file is valid JSON matching the schema", () => {
    for (const file of fs.readdirSync(tasksDir()).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(fs.readFileSync(path.join(tasksDir(), file), "utf8"));
      expect(() => validateTask(raw, file)).not.toThrow();
    }
  });

  it("filters tasks by name or category", () => {
    expect(loadTasks(undefined, "code").every((t) => t.category === "code" || t.name.includes("code"))).toBe(true);
    expect(loadTasks(undefined, "fix-bug-divide")).toHaveLength(1);
  });
});
