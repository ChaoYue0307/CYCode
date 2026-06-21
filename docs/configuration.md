# Configuration

CYCode merges two JSON files; the project file wins on scalars, and permission lists
concatenate:

1. `~/.cycode/config.json` — user defaults (override the location with `$CYCODE_HOME`)
2. `<project>/.cycode/config.json` — per-project settings (commit this to share with collaborators)

```jsonc
{
  // default model as provider/model-id (CLI --model overrides)
  "model": "anthropic/claude-sonnet-4-6",

  // cheaper model for compaction summaries and subagents
  "smallModel": "anthropic/claude-haiku-4-5-20251001",

  "permissions": {
    "allow": ["bash(git *)", "bash(npm run *)", "latex_build"],
    "deny":  ["bash(rm -rf *)"]
  },

  // run after write/edit/notebook_edit; non-zero output is fed back to the model
  "diagnostics": { "command": "npm run typecheck", "timeoutMs": 60000 },

  // shell hooks around tool execution (see "Hooks" below)
  "hooks": {
    "preToolUse":  [{ "match": "bash(git push*)", "command": "./scripts/guard-push.sh" }],
    "postToolUse": [{ "match": "edit", "command": "./scripts/style-check.sh" }]
  },

  // MCP servers: stdio (command) or streamable HTTP (url)
  "mcpServers": {
    "github": { "command": "gh-mcp-server", "args": [], "env": {} },
    "docs":   { "url": "http://localhost:3845/mcp" }
  },

  // API keys + endpoints for any provider (see "API keys" below)
  "providers": {
    "anthropic":  { "apiKey": "sk-ant-..." },
    "openai":     { "apiKey": "sk-..." },
    "google":     { "apiKey": "..." },
    "openrouter": { "apiKey": "sk-or-..." },
    "ollama":     { "baseURL": "http://localhost:11434/v1" },
    "vllm":       { "baseURL": "http://localhost:8000/v1", "apiKeyEnv": "VLLM_API_KEY" }
  },

  // override the context window used for compaction decisions
  "contextWindow": 200000
}
```

## API keys

Every provider has both an environment-variable slot and a config slot — set a key
whichever way you prefer. For a given provider, the key is resolved in this order:

1. `providers.<name>.apiKeyEnv` — read from the named environment variable
2. `providers.<name>.apiKey` — the literal key in config
3. the provider's **default environment variable** (below)

| Provider | Model prefix | Default env var | Config slot |
|---|---|---|---|
| Anthropic | `anthropic/` | `ANTHROPIC_API_KEY` | `providers.anthropic.apiKey` |
| OpenAI | `openai/` | `OPENAI_API_KEY` | `providers.openai.apiKey` |
| Google | `google/` | `GOOGLE_GENERATIVE_AI_API_KEY` | `providers.google.apiKey` |
| OpenRouter | `openrouter/` | `OPENROUTER_API_KEY` | `providers.openrouter.apiKey` |
| Ollama (local) | `ollama/` | — (none needed) | `providers.ollama.baseURL` |
| Any OpenAI-compatible | `<name>/` | via `apiKeyEnv` | `providers.<name>` + `baseURL` |

### Chinese providers (built-in)

Endpoints are baked in — just set a key and use `<provider>/<model-id>`. Defaults are the
**mainland** endpoints; override `baseURL` for international regions (e.g. DashScope
Singapore `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, Moonshot
`https://api.moonshot.ai/v1`, Zhipu `https://api.z.ai/api/paas/v4`).

| Provider | Model prefix (+ aliases) | Default env var | Example model |
|---|---|---|---|
| DeepSeek | `deepseek/` | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| Alibaba Qwen | `qwen/` (`dashscope`, `tongyi`) | `DASHSCOPE_API_KEY` | `qwen/qwen-max` |
| Zhipu GLM | `zhipu/` (`glm`) | `ZHIPUAI_API_KEY` | `zhipu/glm-4.6` |
| Moonshot Kimi | `moonshot/` (`kimi`) | `MOONSHOT_API_KEY` | `moonshot/kimi-k2` |
| MiniMax | `minimax/` | `MINIMAX_API_KEY` | `minimax/minimax-m1` |
| Tencent Hunyuan | `hunyuan/` | `HUNYUAN_API_KEY` | `hunyuan/hunyuan-turbos` |
| ByteDance Doubao | `doubao/` (`ark`, `volcengine`) | `ARK_API_KEY` | `doubao/doubao-seed-2.0-pro` |
| Baidu ERNIE | `ernie/` (`qianfan`, `wenxin`) | `QIANFAN_API_KEY` | `ernie/ernie-5.0` |
| SiliconFlow | `siliconflow/` | `SILICONFLOW_API_KEY` | `siliconflow/deepseek-ai/DeepSeek-V3` |
| StepFun | `stepfun/` (`step`) | `STEPFUN_API_KEY` | `stepfun/step-2` |
| Baichuan | `baichuan/` | `BAICHUAN_API_KEY` | `baichuan/Baichuan4` |
| 01.AI Yi | `yi/` (`01ai`, `lingyiwanwu`) | `YI_API_KEY` | `yi/yi-large` |

Model ids change often — pass `--model <provider>/<id>` or set `model` in config with the
exact id from the provider's docs. Example: `cycode --model deepseek/deepseek-chat`, or in
config `{ "providers": { "deepseek": { "apiKey": "sk-..." } }, "model": "deepseek/deepseek-chat" }`.

> **Keep keys in the user config** (`~/.cycode/config.json`), not a project config you
> might commit. Environment variables remain the safest option for shared machines.

When no `model` is set, CYCode defaults to the first provider with a usable key
(Anthropic → OpenAI → Google → DeepSeek → Qwen → Zhipu → Moonshot → OpenRouter).

### Other keys

| Variable | Purpose |
|---|---|
| `SEMANTIC_SCHOLAR_API_KEY` | higher rate limits for `semantic_scholar` (optional) |
| `TAVILY_API_KEY` | enables the `web_search` tool (absent → tool not registered) |
| `CYCODE_HOME` | relocate config/sessions/papers (default `~/.cycode`) |

## Permission modes

| Mode | File edits | Commands & other tools | Read-only tools |
|---|---|---|---|
| `default` | ask | ask | run freely |
| `acceptEdits` | auto-approve | ask | run freely |
| `plan` | deny | deny | run freely |
| `bypass` | auto-approve | auto-approve | run freely |

Set with `--mode <mode>` or `/mode` in the REPL. **Deny rules always win** — over
read-only status and over `bypass`.

## Rule grammar

```
toolname              matches every call of that tool
toolname(exact arg)   matches one exact argument
toolname(prefix *)    prefix wildcard (the * must be last)
```

The argument is the tool's permission key — the command for `bash`, the file path for
`write`/`edit` (see [tools.md](tools.md)). Answering **a**lways in a permission prompt
appends the exact key to the project config's allow list.

## Hooks

Hooks are shell commands that run around tool execution — deterministic guardrails
the model can't talk its way past. `match` uses the same pattern grammar as
permission rules, against the same per-call keys.

- **`preToolUse`** runs before the tool. **Exit code 2 blocks the call**; the hook's
  output is returned to the model as the error. Any other non-zero exit is a
  warning notice and the call proceeds.
- **`postToolUse`** runs after a successful call. **Exit code 2 appends the hook's
  output to the tool result** as feedback the model must address. Other non-zero
  exits are warnings.

Hooks receive the call as environment variables: `CYCODE_TOOL_NAME`,
`CYCODE_TOOL_KEY` (e.g. `bash(git push)`), `CYCODE_TOOL_INPUT` (JSON), and — for
postToolUse — `CYCODE_TOOL_OUTPUT` (first 8 KB). Default timeout 30 s
(`timeoutMs` to change). User and project hook lists concatenate.

```jsonc
// block force-pushes no matter what the model decides
{ "match": "bash(git push*)",
  "command": "echo \\"$CYCODE_TOOL_INPUT\\" | grep -q -- --force && { echo 'no force pushes' >&2; exit 2; } || exit 0" }
```

## Sandbox

Opt-in OS-level confinement for shell commands (`bash` and `exp_run`):

```jsonc
{ "sandbox": { "bash": true, "allowNetwork": true } }
```

or per-invocation with `--sandbox` (works with `cycode`, `cycode ui`, and
`cycode exec`). When enabled, commands can **read anything but write only inside
the project directory and tmp** — enforced by the kernel, not by prompts:

- **macOS**: Seatbelt (`sandbox-exec`) with a workspace-write profile.
- **Linux**: bubblewrap (`bwrap`); install it or the sandbox **fails closed**
  (the command errors rather than running unconfined).
- `allowNetwork: false` additionally cuts off outbound network.

The layered model for unattended runs: permission rules decide *which* commands
run, hooks veto specific calls deterministically, and the sandbox bounds what any
command can touch even if the first two layers were misconfigured. For full
autonomy inside a write-fence: `cycode exec "..." --mode bypass --sandbox`.

## Checkpoints (undo)

CYCode snapshots the workspace at the start of every turn into a **shadow git repo**
under `~/.cycode/checkpoints/` — it never touches your project's own `.git` or history.
So you can let the agent edit freely and roll back any turn:

- **`/undo`** (REPL) or **`cycode undo`** (CLI) — revert the workspace to before the last
  turn. Only the paths that actually changed are touched: modified/deleted files are
  restored, files the agent added are removed; everything else is left alone.
- **`/diff`** or **`cycode diff`** — show what changed since the last checkpoint.
- **`/checkpoints`** — list recent snapshots.

On by default; disable with `{ "checkpoints": { "enabled": false } }`. Requires `git`
on PATH. Snapshots exclude `node_modules/`, `dist/`, `.git/`, `.cycode/`, virtualenvs,
checkpoints, and large model files on top of your project's `.gitignore`.

## Context files

CYCode loads into every session's system prompt:

1. `~/.cycode/AGENTS.md` — your global preferences
2. `<project>/AGENTS.md`, falling back to `<project>/CLAUDE.md` — project conventions

Keep them short (truncated at 20 KB): build commands, code style, what to never touch.

## Where things live

| Path | Contents |
|---|---|
| `~/.cycode/sessions/<project>/` | JSONL session rollouts |
| `~/.cycode/papers/` | cached paper PDFs (by URL hash) |
| `~/.cycode/skills/` | your user-level skills |
| `<project>/.cycode/skills/` | project skills |
| `<project>/.cycode/runs/` | experiment logs + index (gitignore this) |
