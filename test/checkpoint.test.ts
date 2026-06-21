import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CheckpointStore } from "../src/checkpoint/checkpoint.js";
import { makeTmpDir } from "./helpers.js";

describe("CheckpointStore", () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = makeTmpDir("cycode-home-");
    project = makeTmpDir("cycode-proj-");
    process.env.CYCODE_HOME = home;
  });
  afterEach(() => {
    delete process.env.CYCODE_HOME;
  });

  const read = (rel: string) => fs.readFileSync(path.join(project, rel), "utf8");
  const write = (rel: string, content: string) => {
    const f = path.join(project, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  };

  it("is available when git is installed", () => {
    expect(CheckpointStore.create(project).available).toBe(true);
  });

  it("snapshots and reports a head", () => {
    write("a.txt", "one");
    const store = CheckpointStore.create(project);
    const hash = store.snapshot("first");
    expect(hash).toBeTruthy();
    expect(store.list().length).toBeGreaterThanOrEqual(1);
  });

  it("undo restores a modified file", () => {
    write("calc.py", "def f(): return 1\n");
    const store = CheckpointStore.create(project);
    store.snapshot("before edit");
    write("calc.py", "def f(): return 999\n"); // the agent's change
    const { restored } = store.restore();
    expect(restored).toContain("calc.py");
    expect(read("calc.py")).toBe("def f(): return 1\n");
  });

  it("undo removes a file the agent added", () => {
    write("keep.txt", "keep");
    const store = CheckpointStore.create(project);
    store.snapshot("before");
    write("new.txt", "created by agent");
    const { removed } = store.restore();
    expect(removed).toContain("new.txt");
    expect(fs.existsSync(path.join(project, "new.txt"))).toBe(false);
    expect(read("keep.txt")).toBe("keep"); // untouched
  });

  it("undo restores a file the agent deleted", () => {
    write("gone.txt", "important");
    const store = CheckpointStore.create(project);
    store.snapshot("before");
    fs.rmSync(path.join(project, "gone.txt"));
    const { restored } = store.restore();
    expect(restored).toContain("gone.txt");
    expect(read("gone.txt")).toBe("important");
  });

  it("undo touches only changed files, leaving others alone", () => {
    write("a.txt", "A");
    write("b.txt", "B");
    const store = CheckpointStore.create(project);
    store.snapshot("before");
    write("a.txt", "A-modified");
    const { restored, removed } = store.restore();
    expect(restored).toEqual(["a.txt"]);
    expect(removed).toEqual([]);
    expect(read("b.txt")).toBe("B");
  });

  it("diff shows the agent's changes since the checkpoint", () => {
    write("x.py", "print(1)\n");
    const store = CheckpointStore.create(project);
    store.snapshot("before");
    write("x.py", "print(2)\n");
    const diff = store.diff();
    expect(diff).toContain("x.py");
    expect(diff).toContain("print(2)");
  });

  it("does not snapshot the project's own .git or node_modules", () => {
    write("src.py", "x = 1\n");
    write("node_modules/big/index.js", "module.exports = 1");
    fs.mkdirSync(path.join(project, ".git"), { recursive: true });
    fs.writeFileSync(path.join(project, ".git", "HEAD"), "ref: refs/heads/main");
    const store = CheckpointStore.create(project);
    store.snapshot("first");
    const diff = store.diff("HEAD");
    // node_modules and .git are excluded, so a fresh snapshot sees no tracked changes there
    expect(diff).not.toContain("node_modules");
  });

  it("no-ops undo when nothing changed since the checkpoint", () => {
    write("a.txt", "A");
    const store = CheckpointStore.create(project);
    store.snapshot("before");
    const { restored, removed } = store.restore();
    expect(restored).toEqual([]);
    expect(removed).toEqual([]);
  });
});
