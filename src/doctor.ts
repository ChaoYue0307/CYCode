import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { loadConfig, projectConfigPath, userConfigPath } from "./config.js";
import { DEFAULT_KEY_ENV, hasKey, defaultModelSpec, COMPATIBLE } from "./provider/registry.js";
import { cycodeHome } from "./util/paths.js";

export type CheckStatus = "ok" | "warn" | "fail";

export interface Diagnostic {
  name: string;
  status: CheckStatus;
  detail: string;
}

function commandExists(cmd: string): boolean {
  if (cmd === "sandbox-exec") return fs.existsSync("/usr/bin/sandbox-exec");
  const res = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return !res.error;
}

function jsonParses(file: string): boolean | null {
  if (!fs.existsSync(file)) return null;
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
    return true;
  } catch {
    return false;
  }
}

/** Collect a structured health report. Pure (no printing) so it can be tested. */
export function collectDiagnostics(cwd: string): Diagnostic[] {
  const out: Diagnostic[] = [];

  // config files parse
  for (const [label, file] of [
    ["user config", userConfigPath()],
    ["project config", projectConfigPath(cwd)],
  ] as const) {
    const ok = jsonParses(file);
    if (ok === null) out.push({ name: label, status: "ok", detail: "not present (optional)" });
    else if (ok) out.push({ name: label, status: "ok", detail: file });
    else out.push({ name: label, status: "fail", detail: `invalid JSON: ${file}` });
  }

  const config = loadConfig(cwd);

  // provider keys
  const providers = [...new Set([...Object.keys(DEFAULT_KEY_ENV)])];
  const withKeys = providers.filter((p) => hasKey(p, config) && COMPATIBLE[p]?.keyEnv !== "");
  if (withKeys.length > 0) {
    out.push({ name: "provider keys", status: "ok", detail: `available: ${withKeys.join(", ")}` });
  } else {
    out.push({
      name: "provider keys",
      status: "fail",
      detail: "no provider key found — set e.g. ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY",
    });
  }

  // default model resolves
  try {
    const spec = defaultModelSpec(config);
    out.push({ name: "default model", status: "ok", detail: spec });
  } catch (err) {
    out.push({ name: "default model", status: "warn", detail: err instanceof Error ? err.message : String(err) });
  }

  // tools
  const git = commandExists("git");
  out.push({
    name: "git (checkpoints/undo)",
    status: git ? "ok" : "warn",
    detail: git ? "found" : "not found — /undo and cycode undo are disabled",
  });
  out.push({
    name: "ripgrep (fast grep)",
    status: commandExists("rg") ? "ok" : "warn",
    detail: commandExists("rg") ? "found" : "not found — falls back to a slower JS search",
  });

  const sandboxBackend = process.platform === "darwin" ? "sandbox-exec" : "bwrap";
  const hasSandbox = commandExists(sandboxBackend);
  out.push({
    name: `sandbox (${sandboxBackend})`,
    status: hasSandbox ? "ok" : "warn",
    detail: hasSandbox ? "available" : `not found — --sandbox will fail closed`,
  });

  for (const [tool, label] of [
    ["latexmk", "latex_build"],
    ["jupyter", "notebook execution"],
  ] as const) {
    out.push({
      name: `${tool} (${label})`,
      status: commandExists(tool) ? "ok" : "warn",
      detail: commandExists(tool) ? "found" : "not found (only needed for that feature)",
    });
  }

  // optional integrations
  out.push({
    name: "web_search (Tavily)",
    status: process.env.TAVILY_API_KEY ? "ok" : "warn",
    detail: process.env.TAVILY_API_KEY ? "enabled" : "TAVILY_API_KEY not set (tool disabled)",
  });

  out.push({ name: "CYCODE_HOME", status: "ok", detail: cycodeHome() });

  return out;
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  const mark = { ok: "✓", warn: "⚠", fail: "✗" } as const;
  const lines = diags.map((d) => `  ${mark[d.status]} ${d.name.padEnd(26)} ${d.detail}`);
  const fails = diags.filter((d) => d.status === "fail").length;
  const warns = diags.filter((d) => d.status === "warn").length;
  const summary = fails
    ? `${fails} problem(s) need attention.`
    : warns
      ? `Ready. ${warns} optional item(s) not configured.`
      : "All good.";
  return `CYCode doctor\n\n${lines.join("\n")}\n\n${summary}`;
}
