# Evals

A small benchmark that measures whether CYCode actually completes tasks — so changes
to the prompt, loop, tools, or model can be judged by a number instead of a vibe.

Each task runs the real agent (`cycode exec`) in an isolated temp workspace and is
scored by verifiable checks. A task passes only when **all** its checks pass.

## Running

```sh
npm run build            # the runner uses dist/ when present
export ANTHROPIC_API_KEY=...
npm run eval                                   # all tasks, default model
npm run eval -- --model openai/gpt-5.1         # pick a model
npm run eval -- --filter code                  # only tasks named/categorized "code"
npm run eval -- --keep --json-out results.json # keep workspaces, write a report
```

Without a provider key the runner skips and exits 0 (so CI without the secret is
green). With a key, exit code is 0 only if every task passed.

In CI, the **Evals** workflow is `workflow_dispatch` only — trigger it manually from
the Actions tab, choosing a model. It needs the `ANTHROPIC_API_KEY` repo secret and
uploads a JSON report as an artifact. It never runs on a normal push, so it never
spends budget unattended.

## Writing a task

Drop a JSON file in `evals/tasks/`:

```json
{
  "name": "fix-bug-divide",
  "category": "code",
  "prompt": "calc.py's divide() crashes on divide(1, 0). Make it return None for a zero divisor.",
  "mode": "acceptEdits",
  "setup": { "calc.py": "def divide(a, b):\n    return a / b\n" },
  "checks": [
    { "type": "bash", "command": "python3 -c \"import calc; assert calc.divide(1,0) is None\"" }
  ]
}
```

- **`setup`** writes files into the workspace before the run (keyed by relative path).
- **`mode`** is the permission mode (default `acceptEdits` so edits apply unattended).
- **`checks`** — all must pass:

| type | passes when |
|---|---|
| `file_exists` | `path` exists in the workspace |
| `file_contains` | `path` contains `text` (set `regex: true` for a pattern) |
| `file_not_contains` | `path` is absent or lacks `text` |
| `answer_contains` | the agent's final answer contains `text` (`regex`, `ignore_case` optional) |
| `bash` | `command` exits 0 (run in the workspace) |

## Design notes

- Tasks should have **objective** checks — prefer `bash`/file assertions over judging
  prose. `answer_contains` is for "report the file path" style tasks.
- Keep tasks small and fast; this is a regression signal, not SWE-bench.
- The pure check and loader logic is unit-tested in `test/evals.test.ts` (no key
  needed); the live runs are the integration path.
