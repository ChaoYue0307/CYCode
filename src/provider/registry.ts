import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { CycodeConfig, ProviderConfig } from "../config.js";

/** Providers with a native AI SDK package (key read from the default env var or config). */
const NATIVE = new Set(["anthropic", "openai", "google"]);

interface CompatibleProvider {
  baseURL: string;
  /** Default environment variable for the key ("" = no key required, e.g. local Ollama). */
  keyEnv: string;
}

/**
 * OpenAI-compatible built-in providers — their endpoint and default key env are baked
 * in, so users only set a key (or `--model <provider>/<model-id>`). Chinese providers
 * default to their mainland endpoints; override `baseURL` in config for other regions
 * (e.g. DashScope Singapore, Moonshot/Zhipu international).
 */
export const COMPATIBLE: Record<string, CompatibleProvider> = {
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
  ollama: { baseURL: "http://localhost:11434/v1", keyEnv: "" },
  // Chinese providers
  deepseek: { baseURL: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY" },
  qwen: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyEnv: "DASHSCOPE_API_KEY" },
  zhipu: { baseURL: "https://open.bigmodel.cn/api/paas/v4", keyEnv: "ZHIPUAI_API_KEY" },
  moonshot: { baseURL: "https://api.moonshot.cn/v1", keyEnv: "MOONSHOT_API_KEY" },
  minimax: { baseURL: "https://api.minimaxi.com/v1", keyEnv: "MINIMAX_API_KEY" },
  hunyuan: { baseURL: "https://api.hunyuan.cloud.tencent.com/v1", keyEnv: "HUNYUAN_API_KEY" },
  doubao: { baseURL: "https://ark.cn-beijing.volces.com/api/v3", keyEnv: "ARK_API_KEY" },
  ernie: { baseURL: "https://qianfan.baidubce.com/v2", keyEnv: "QIANFAN_API_KEY" },
  siliconflow: { baseURL: "https://api.siliconflow.cn/v1", keyEnv: "SILICONFLOW_API_KEY" },
  stepfun: { baseURL: "https://api.stepfun.com/v1", keyEnv: "STEPFUN_API_KEY" },
  baichuan: { baseURL: "https://api.baichuan-ai.com/v1", keyEnv: "BAICHUAN_API_KEY" },
  yi: { baseURL: "https://api.lingyiwanwu.com/v1", keyEnv: "YI_API_KEY" },
};

/** Friendly aliases → canonical provider name. */
export const ALIASES: Record<string, string> = {
  dashscope: "qwen",
  tongyi: "qwen",
  glm: "zhipu",
  zhipuai: "zhipu",
  kimi: "moonshot",
  ark: "doubao",
  volcengine: "doubao",
  qianfan: "ernie",
  wenxin: "ernie",
  step: "stepfun",
  "01ai": "yi",
  lingyiwanwu: "yi",
};

export function canonicalProvider(name: string): string {
  return ALIASES[name] ?? name;
}

/** Default environment variable each built-in provider reads its key from. */
export const DEFAULT_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  ...Object.fromEntries(
    Object.entries(COMPATIBLE)
      .filter(([, p]) => p.keyEnv)
      .map(([name, p]) => [name, p.keyEnv]),
  ),
};

/** Providers that get a sensible default model when none is configured, in priority order. */
const DEFAULT_MODELS: [provider: string, modelId: string][] = [
  ["anthropic", "claude-sonnet-4-6"],
  ["openai", "gpt-5.1"],
  ["google", "gemini-2.5-pro"],
  ["deepseek", "deepseek-chat"],
  ["qwen", "qwen-max"],
  ["zhipu", "glm-4.6"],
  ["moonshot", "kimi-k2"],
  ["openrouter", "anthropic/claude-sonnet-4-6"],
];

/**
 * Resolve an API key for a provider. Precedence:
 *   config providers.<name>.apiKeyEnv (env var) > providers.<name>.apiKey (literal)
 *   > the provider's default env var.
 */
export function resolveApiKey(
  provider: string,
  custom: ProviderConfig | undefined,
): string | undefined {
  if (custom?.apiKeyEnv && process.env[custom.apiKeyEnv]) {
    return process.env[custom.apiKeyEnv];
  }
  if (custom?.apiKey) return custom.apiKey;
  const defaultEnv = DEFAULT_KEY_ENV[provider];
  if (defaultEnv && process.env[defaultEnv]) return process.env[defaultEnv];
  return undefined;
}

/** Whether a usable key (or no key needed, e.g. ollama) is available for a provider. */
export function hasKey(provider: string, config: CycodeConfig): boolean {
  const name = canonicalProvider(provider);
  if (COMPATIBLE[name]?.keyEnv === "") return true;
  return resolveApiKey(name, config.providers?.[name]) !== undefined;
}

/**
 * Model specs are "provider/model-id", e.g. anthropic/claude-sonnet-4-6,
 * openai/gpt-5.1, deepseek/deepseek-chat, qwen/qwen-max, zhipu/glm-4.6,
 * moonshot/kimi-k2, ollama/llama3.3. Any provider's key and baseURL can be
 * overridden under config.providers.<name>.
 */
export function resolveModel(spec: string, config: CycodeConfig): LanguageModel {
  const slash = spec.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `Invalid model spec "${spec}" — expected "provider/model-id" (e.g. anthropic/claude-sonnet-4-6)`,
    );
  }
  const provider = canonicalProvider(spec.slice(0, slash));
  const modelId = spec.slice(slash + 1);
  const custom = config.providers?.[provider] ?? config.providers?.[spec.slice(0, slash)];
  const apiKey = resolveApiKey(provider, custom);

  if (NATIVE.has(provider)) {
    switch (provider) {
      case "anthropic":
        return createAnthropic({ apiKey, baseURL: custom?.baseURL })(modelId);
      case "openai":
        return createOpenAI({ apiKey, baseURL: custom?.baseURL })(modelId);
      case "google":
        return createGoogleGenerativeAI({ apiKey, baseURL: custom?.baseURL })(modelId);
    }
  }

  const builtin = COMPATIBLE[provider];
  if (builtin) {
    return createOpenAICompatible({
      name: provider,
      apiKey: apiKey ?? (builtin.keyEnv === "" ? "none" : undefined),
      baseURL: custom?.baseURL ?? builtin.baseURL,
    })(modelId);
  }

  if (custom?.baseURL) {
    return createOpenAICompatible({ name: provider, apiKey, baseURL: custom.baseURL })(modelId);
  }

  throw new Error(
    `Unknown provider "${provider}". Built-ins: ${["anthropic", "openai", "google", ...Object.keys(COMPATIBLE)].join(", ")}. ` +
      `Define others under "providers" in your config with a baseURL.`,
  );
}

/** Pick a default model from config, or the first provider that has a usable key. */
export function defaultModelSpec(config: CycodeConfig): string {
  if (config.model) return config.model;
  for (const [provider, modelId] of DEFAULT_MODELS) {
    if (hasKey(provider, config)) return `${provider}/${modelId}`;
  }
  // a key-bearing provider without a built-in default model still works via --model
  for (const provider of Object.keys(COMPATIBLE)) {
    if (hasKey(provider, config) && COMPATIBLE[provider]!.keyEnv !== "") {
      throw new Error(
        `A key for "${provider}" is set but it has no default model. ` +
          `Pass --model ${provider}/<model-id> or set "model" in your config.`,
      );
    }
  }
  throw new Error(
    "No model configured. Set a provider API key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
      "DEEPSEEK_API_KEY, DASHSCOPE_API_KEY, …), add the key under \"providers\" in " +
      '~/.cycode/config.json, or set "model" to a local one (e.g. "ollama/llama3.3").',
  );
}

/** Model used for compaction summaries and subagents. */
export function smallModelSpec(config: CycodeConfig, mainSpec: string): string {
  if (config.smallModel) return config.smallModel;
  if (mainSpec.startsWith("anthropic/")) return "anthropic/claude-haiku-4-5-20251001";
  return mainSpec;
}
