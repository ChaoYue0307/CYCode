# Changelog

All notable changes to CYCode are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.8.0] - 2026-06-12

### Added
- **Trust layer: per-turn checkpoints with undo/diff.** CYCode snapshots the
  workspace at the start of every turn into a shadow git repo under
  `~/.cycode/checkpoints/` (never touches the project's own `.git`). New
  `cycode undo` / `cycode diff` CLI commands and `/undo`, `/diff`, `/checkpoints`
  REPL commands. Undo touches only changed paths — modified/deleted files
  restored, added files removed, everything else left alone. On by default
  (needs `git`); disable with `{ "checkpoints": { "enabled": false } }`.

## [0.7.0] - 2026-06-12

### Added
- **Major Chinese providers as built-ins** — endpoints baked in, set a key and go:
  DeepSeek, Alibaba Qwen (DashScope), Zhipu GLM, Moonshot Kimi, MiniMax, Tencent
  Hunyuan, ByteDance Doubao (Volcengine Ark), Baidu ERNIE (Qianfan), SiliconFlow,
  StepFun, Baichuan, 01.AI Yi. Each has a default env var and a `providers.<name>`
  config slot, like every other provider. Friendly aliases too (`glm`→zhipu,
  `kimi`→moonshot, `dashscope`→qwen, `ark`→doubao, `qianfan`→ernie, …).
- Defaults use mainland endpoints; override `baseURL` in config for international
  regions (DashScope Singapore, Moonshot/Zhipu international, etc.).
- The provider registry is now a data table (`COMPATIBLE`) so adding an
  OpenAI-compatible provider is a one-line entry.

## [0.6.0] - 2026-06-12

### Added
- **Uniform API-key configuration for every provider.** Anthropic, OpenAI, Google,
  and OpenRouter can now take their key from `providers.<name>.apiKey` (literal) or
  `apiKeyEnv` (env var name) in config — not just their default environment
  variable, and no longer Anthropic-only. Resolution order per provider:
  `apiKeyEnv` → `apiKey` → default env var. `defaultModelSpec` now also detects
  config-provided keys, and the "no model configured" error points at both paths.

## [0.5.0] - 2026-06-12

### Added
- **Eval harness** (`npm run eval`): declarative task fixtures in `evals/tasks/`,
  checker primitives (`bash`, `file_contains`/`file_not_contains`, `file_exists`,
  `answer_contains`), and a runner that drives the real `cycode exec` in isolated
  temp workspaces and reports a pass-rate. Pure check/loader logic is unit-tested;
  live runs are gated on a provider key (skips cleanly without one). A manual,
  secret-gated `Evals` CI workflow produces a JSON report artifact.

## [0.4.0] - 2026-06-12

### Added
- **wandb integration**: `exp_status` now lists local `wandb/run-*` directories
  with their numeric summary metrics (from `wandb-summary.json`) — offline,
  no API key required. `/watch-run` picks them up automatically.

## [0.3.0] - 2026-06-12

### Added
- **OS-level sandbox** for shell commands (`bash`, `exp_run`): writes confined to
  the project directory + tmp, enforced by the kernel. macOS via Seatbelt
  (`sandbox-exec`), Linux via bubblewrap; **fails closed** when the backend is
  unavailable. Enable with `"sandbox": { "bash": true }` in config or the
  `--sandbox` flag on any command. `allowNetwork: false` additionally cuts off
  outbound network. Combined with permission rules and hooks this completes the
  layered model for unattended loops: `cycode exec --mode bypass --sandbox`.

## [0.2.0] - 2026-06-11

### Added
- **Hooks**: `preToolUse` / `postToolUse` shell hooks in config — deterministic
  guardrails around tool execution. Exit code 2 blocks a call (pre) or feeds the
  hook's output back to the model (post); hooks receive the call via
  `CYCODE_TOOL_*` environment variables.
- **Runtime model switching**: `/model <spec>` now switches mid-session in the
  REPL and the GUI (no restart).
- **Parallel tool execution**: batches consisting only of read-only tool calls
  (multiple greps, parallel `explore` subagents) run concurrently.
- **Session token tracking**: cumulative input/output tokens shown in the TUI
  status line, the GUI header, and exec's stderr summary.
- **`web_search` tool** (Tavily), registered only when `TAVILY_API_KEY` is set.

### Changed
- New brand identity: hexagonal-C mark with a terminal cursor, applied across the
  logo, app icon, README figures, and the GUI (favicon + header).
- Banner, terminal, and architecture figures redesigned: tighter typography,
  window shadow and syntax-colored strings in the session mockup, rounded
  connector elbows and a stricter grid in the architecture diagram.
- `assets/logo.svg` (standalone mark) and `assets/icon.svg` (app icon, ready for
  the planned desktop app) added.
- Version is now a single constant (`src/version.ts`) shared by the CLI and the
  MCP client identity.

## [0.1.0] - 2026-06-11

Initial release.

### Added
- Agent core: streaming turn loop with manually-executed tool calls, permission gate,
  context compaction (~80% threshold), abort recovery, event bus.
- Core tools: `read`, `write`, `edit`, `glob`, `grep` (ripgrep + JS fallback), `bash`,
  `web_fetch`, `todo_write`, `explore` subagent.
- Research toolkit: `arxiv_search`, `paper_read`, `semantic_scholar`,
  `notebook_read`/`notebook_edit`, `exp_run`/`exp_status`/`exp_stop`, `latex_build`.
- Built-in skills: `/lit-review`, `/watch-run`, `/paper-draft`, `/repro-check`;
  user/project skill loading with Claude Code-compatible frontmatter.
- Multi-provider models via Vercel AI SDK: Anthropic, OpenAI, Google, Ollama,
  OpenRouter, and arbitrary OpenAI-compatible endpoints.
- Permission system: four modes, allow/deny rules with prefix wildcards, per-project
  persistence of "always allow".
- JSONL session rollouts with `-c` / `--resume` and compaction replay.
- MCP client (stdio + streamable HTTP).
- Three frontends: Ink terminal REPL, local web GUI (`cycode ui`), headless
  `cycode exec --json`.
- GUI: sessions sidebar with one-click resume (transcript replay), markdown
  rendering, live task panel, permission dialogs, auto-opens the browser
  (`--no-open` to disable).
- Standalone binaries for macOS (arm64/x64), Linux (x64/arm64), and Windows (x64),
  compiled with Bun and attached to GitHub Releases — no Node required.
- Post-edit diagnostics command with model feedback.
- 51 vitest tests including mock-model agent-loop integration.

[Unreleased]: https://github.com/ChaoYue0307/CYCode/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ChaoYue0307/CYCode/releases/tag/v0.1.0
