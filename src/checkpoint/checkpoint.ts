import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cycodeHome, ensureDir, projectSlug } from "../util/paths.js";

/**
 * Per-turn workspace snapshots so any turn can be undone. Uses a SHADOW git
 * repo under ~/.cycode/checkpoints/<project>.git with the project as its work
 * tree — it never touches the project's own .git or history. Undo reverts only
 * the paths that actually changed, so unrelated files are never affected.
 */
export class CheckpointStore {
  private readonly gitDir: string;
  private readonly workTree: string;
  readonly available: boolean;

  private constructor(gitDir: string, workTree: string, available: boolean) {
    this.gitDir = gitDir;
    this.workTree = workTree;
    this.available = available;
  }

  private static gitInstalled(): boolean {
    const res = spawnSync("git", ["--version"], { encoding: "utf8" });
    return res.status === 0;
  }

  static create(cwd: string): CheckpointStore {
    // canonicalize so a path and its symlink (e.g. /tmp vs /private/tmp on macOS)
    // map to the same shadow repo
    let workTree: string;
    try {
      workTree = fs.realpathSync(path.resolve(cwd));
    } catch {
      workTree = path.resolve(cwd);
    }
    const gitDir = path.join(cycodeHome(), "checkpoints", `${projectSlug(workTree)}.git`);
    const store = new CheckpointStore(gitDir, workTree, CheckpointStore.gitInstalled());
    if (store.available) store.init();
    return store;
  }

  private git(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const res = spawnSync(
      "git",
      ["-c", "user.name=cycode", "-c", "user.email=cycode@local", "-c", "commit.gpgsign=false", ...args],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, GIT_DIR: this.gitDir, GIT_WORK_TREE: this.workTree },
      },
    );
    return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  }

  private init(): void {
    if (!fs.existsSync(path.join(this.gitDir, "HEAD"))) {
      ensureDir(path.dirname(this.gitDir));
      this.git(["init", "-q", "-b", "main"]);
    }
    // exclude heavy/irrelevant paths on top of the project's own .gitignore
    const exclude = path.join(this.gitDir, "info", "exclude");
    ensureDir(path.dirname(exclude));
    fs.writeFileSync(
      exclude,
      [
        "node_modules/",
        ".git/",
        "dist/",
        "build/",
        ".cycode/",
        "*.log",
        "__pycache__/",
        ".venv/",
        "venv/",
        ".DS_Store",
        "wandb/",
        "*.ckpt",
        "*.pt",
        "*.bin",
        "*.safetensors",
        "",
      ].join("\n"),
    );
  }

  private headExists(): boolean {
    return this.git(["rev-parse", "--verify", "-q", "HEAD"]).status === 0;
  }

  /** Snapshot the working tree. No-op (returns the current head) when nothing changed. */
  snapshot(label: string): string | null {
    if (!this.available) return null;
    this.git(["add", "-A"]);
    const hasHead = this.headExists();
    const dirty = this.git(["diff", "--cached", "--quiet"]).status !== 0;
    if (hasHead && !dirty) return this.head();
    const msg = label.replace(/\s+/g, " ").slice(0, 72) || "checkpoint";
    const res = this.git(["commit", "-q", "--allow-empty", "-m", msg]);
    if (res.status !== 0) return this.head();
    return this.head();
  }

  head(): string | null {
    const res = this.git(["rev-parse", "--short", "HEAD"]);
    return res.status === 0 ? res.stdout.trim() : null;
  }

  /** Recent checkpoints, newest first: [shortHash, label, relativeAge]. */
  list(limit = 20): { hash: string; label: string; when: string }[] {
    if (!this.available || !this.headExists()) return [];
    const res = this.git(["log", `-n`, String(limit), "--format=%h\t%s\t%cr"]);
    if (res.status !== 0) return [];
    return res.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, label, when] = line.split("\t");
        return { hash: hash ?? "", label: label ?? "", when: when ?? "" };
      });
  }

  /** Patch of what changed from a checkpoint (default HEAD) to the current tree. */
  diff(ref = "HEAD"): string {
    if (!this.available || !this.headExists()) return "(no checkpoints yet)";
    this.git(["add", "-A"]);
    const stat = this.git(["diff", "--stat", ref]).stdout;
    const patch = this.git(["diff", ref]).stdout;
    const body = (stat + "\n" + patch).trim();
    return body || "(no changes since the checkpoint)";
  }

  /**
   * Revert the working tree to `ref`, touching only paths that differ:
   * modified/deleted files are restored, files added since `ref` are removed.
   * Returns the list of affected paths.
   */
  restore(ref = "HEAD"): { restored: string[]; removed: string[] } {
    const restored: string[] = [];
    const removed: string[] = [];
    if (!this.available || !this.headExists()) return { restored, removed };
    this.git(["add", "-A"]);
    const res = this.git(["diff", "--name-status", "-z", ref]);
    if (res.status !== 0) return { restored, removed };
    const parts = res.stdout.split("\0").filter(Boolean);
    for (let i = 0; i < parts.length; i += 2) {
      const status = parts[i]!;
      const file = parts[i + 1];
      if (!file) continue;
      if (status.startsWith("A")) {
        // added since the checkpoint → remove it to undo
        fs.rmSync(path.join(this.workTree, file), { force: true });
        removed.push(file);
      } else {
        // modified or deleted → restore from the checkpoint
        this.git(["checkout", ref, "--", file]);
        restored.push(file);
      }
    }
    this.git(["add", "-A"]);
    return { restored, removed };
  }
}
