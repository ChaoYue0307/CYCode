import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectDiagnostics, formatDiagnostics } from "../src/doctor.js";
import { runInit } from "../src/init.js";
import { makeTmpDir } from "./helpers.js";

describe("doctor", () => {
  let home: string;
  let project: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = makeTmpDir("cycode-home-");
    project = makeTmpDir("cycode-proj-");
    process.env.CYCODE_HOME = home;
    for (const k of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    delete process.env.CYCODE_HOME;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("reports a key fail when no provider key is present", () => {
    const diags = collectDiagnostics(project);
    const keys = diags.find((d) => d.name === "provider keys")!;
    expect(keys.status).toBe("fail");
  });

  it("reports ok when a provider key is present", () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const diags = collectDiagnostics(project);
    expect(diags.find((d) => d.name === "provider keys")!.status).toBe("ok");
    expect(diags.find((d) => d.name === "default model")!.detail).toContain("anthropic/");
  });

  it("flags invalid config JSON", () => {
    fs.mkdirSync(path.join(project, ".cycode"), { recursive: true });
    fs.writeFileSync(path.join(project, ".cycode", "config.json"), "{ not json");
    const diags = collectDiagnostics(project);
    expect(diags.find((d) => d.name === "project config")!.status).toBe("fail");
  });

  it("includes git and CYCODE_HOME checks and formats with marks", () => {
    const text = formatDiagnostics(collectDiagnostics(project));
    expect(text).toContain("git (checkpoints/undo)");
    expect(text).toMatch(/[✓⚠✗]/);
  });
});

describe("init", () => {
  let home: string;
  let project: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = makeTmpDir("cycode-home-");
    project = makeTmpDir("cycode-proj-");
    process.env.CYCODE_HOME = home;
    saved.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "k";
  });
  afterEach(() => {
    delete process.env.CYCODE_HOME;
    if (saved.ANTHROPIC_API_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY;
  });

  it("scaffolds config + AGENTS.md with a detected model", () => {
    const result = runInit(project);
    expect(result.created).toContain(".cycode/config.json");
    expect(result.created).toContain("AGENTS.md");
    const config = JSON.parse(fs.readFileSync(path.join(project, ".cycode", "config.json"), "utf8"));
    expect(config.model).toContain("anthropic/");
    expect(config.permissions.deny).toContain("bash(rm -rf *)");
  });

  it("does not overwrite an existing config without force", () => {
    fs.mkdirSync(path.join(project, ".cycode"), { recursive: true });
    fs.writeFileSync(path.join(project, ".cycode", "config.json"), '{"model":"custom/x"}');
    const result = runInit(project);
    expect(result.skipped.some((s) => s.includes("config.json"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(project, ".cycode", "config.json"), "utf8")).model).toBe("custom/x");
  });

  it("overwrites with force", () => {
    fs.mkdirSync(path.join(project, ".cycode"), { recursive: true });
    fs.writeFileSync(path.join(project, ".cycode", "config.json"), '{"model":"custom/x"}');
    runInit(project, true);
    expect(JSON.parse(fs.readFileSync(path.join(project, ".cycode", "config.json"), "utf8")).model).toContain("anthropic/");
  });
});
