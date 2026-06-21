import fs from "node:fs";
import path from "node:path";
import { loadConfig, type CycodeConfig } from "./config.js";
import { defaultModelSpec } from "./provider/registry.js";

export interface InitResult {
  created: string[];
  skipped: string[];
  notes: string[];
}

function detectModel(cwd: string): { model?: string; note: string } {
  try {
    // detect from available keys, ignoring any existing `model` override
    const { model: _existing, ...config } = loadConfig(cwd);
    void _existing;
    return { model: defaultModelSpec(config), note: "" };
  } catch {
    return {
      model: undefined,
      note: "No provider key detected — set one (e.g. ANTHROPIC_API_KEY) or add it under \"providers\" in .cycode/config.json.",
    };
  }
}

const AGENTS_TEMPLATE = `# Project notes for CYCode

<!-- Short, durable context the agent should always know. Keep it tight. -->

## Stack & commands
- Build: <e.g. npm run build>
- Test: <e.g. npm test>
- Typecheck/lint: <…>

## Conventions
- <code style, naming, what to never touch>

## Gotchas
- <non-obvious things that trip people up>
`;

/** Scaffold .cycode/config.json and AGENTS.md. Non-interactive; never overwrites unless force. */
export function runInit(cwd: string, force = false): InitResult {
  const result: InitResult = { created: [], skipped: [], notes: [] };

  const configDir = path.join(cwd, ".cycode");
  const configPath = path.join(configDir, "config.json");
  const { model, note } = detectModel(cwd);
  if (note) result.notes.push(note);

  if (fs.existsSync(configPath) && !force) {
    result.skipped.push(".cycode/config.json (exists; use --force to overwrite)");
  } else {
    const config: CycodeConfig = {
      ...(model ? { model } : {}),
      permissions: {
        allow: ["bash(git status)", "bash(git diff*)", "bash(git log*)"],
        deny: ["bash(rm -rf *)"],
      },
      diagnostics: { command: "" },
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    result.created.push(".cycode/config.json");
    if (model) result.notes.push(`Default model set to ${model}.`);
    result.notes.push('Set diagnostics.command (e.g. "npm run typecheck") to feed errors back after edits.');
  }

  const agentsPath = path.join(cwd, "AGENTS.md");
  if (fs.existsSync(agentsPath) || fs.existsSync(path.join(cwd, "CLAUDE.md"))) {
    result.skipped.push("AGENTS.md (a context file already exists)");
  } else {
    fs.writeFileSync(agentsPath, AGENTS_TEMPLATE);
    result.created.push("AGENTS.md");
  }

  return result;
}

export function formatInit(result: InitResult): string {
  const lines: string[] = [];
  for (const c of result.created) lines.push(`  created  ${c}`);
  for (const s of result.skipped) lines.push(`  skipped  ${s}`);
  const notes = result.notes.length ? "\n\n" + result.notes.map((n) => `• ${n}`).join("\n") : "";
  return `CYCode init\n\n${lines.join("\n")}${notes}\n\nNext: run \`cycode doctor\` to verify, then \`cycode\`.`;
}
