import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { CycodeConfig, ProviderConfig } from "../config.js";

/** Default environment variable each built-in provider reads its key from. */
export const DEFAULT_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

/** A sensible default model id per built-in provider, used when no model is configured. */
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "anthropic/claude-sonnet-4-6",
  openai: "openai/gpt-5.1",
  google: "google/gemini-2.5-pro",
  openrouter: "openrouter/anthropic/claude-sonnet-4-6",
};

/**
 * Resolve an API key for a provider. Precedence:
 *   config providers.<name>.apiKeyEnv (env var) > providers.<name>.apiKey (literal)
 *   > the provider's default env var.
 * So every major provider — not just Anthropic — has a config slot and an env slot.
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
  if (provider === "ollama") return true;
  return resolveApiKey(provider, config.providers?.[provider]) !== undefined;
}

/**
 * Model specs are "provider/model-id", e.g.:
 *   anthropic/claude-sonnet-4-6
 *   openai/gpt-5.1
 *   google/gemini-2.5-pro
 *   ollama/llama3.3
 *   openrouter/anthropic/claude-sonnet-4-6
 * Any provider's key and baseURL can be set under config.providers.<name>.
 */
export function resolveModel(spec: string, config: CycodeConfig): LanguageModel {
  const slash = spec.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `Invalid model spec "${spec}" — expected "provider/model-id" (e.g. anthropic/claude-sonnet-4-6)`,
    );
  }
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  const custom = config.providers?.[provider];
  const apiKey = resolveApiKey(provider, custom);

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL: custom?.baseURL })(modelId);
    case "openai":
      return createOpenAI({ apiKey, baseURL: custom?.baseURL })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL: custom?.baseURL })(modelId);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        apiKey: apiKey ?? "ollama",
        baseURL: custom?.baseURL ?? "http://localhost:11434/v1",
      })(modelId);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        apiKey,
        baseURL: custom?.baseURL ?? "https://openrouter.ai/api/v1",
      })(modelId);
    default: {
      if (custom?.baseURL) {
        return createOpenAICompatible({
          name: provider,
          apiKey,
          baseURL: custom.baseURL,
        })(modelId);
      }
      throw new Error(
        `Unknown provider "${provider}". Built-ins: anthropic, openai, google, ollama, openrouter. ` +
          `Define others under "providers" in your config with a baseURL.`,
      );
    }
  }
}

/** Pick a default model from config, or the first provider that has a usable key. */
export function defaultModelSpec(config: CycodeConfig): string {
  if (config.model) return config.model;
  for (const provider of ["anthropic", "openai", "google", "openrouter"]) {
    if (hasKey(provider, config)) return DEFAULT_MODEL[provider]!;
  }
  throw new Error(
    "No model configured. Set ANTHROPIC_API_KEY / OPENAI_API_KEY / " +
      "GOOGLE_GENERATIVE_AI_API_KEY / OPENROUTER_API_KEY, add the key under " +
      '"providers" in ~/.cycode/config.json, or set "model" to a local one (e.g. "ollama/llama3.3").',
  );
}

/** Model used for compaction summaries and subagents. */
export function smallModelSpec(config: CycodeConfig, mainSpec: string): string {
  if (config.smallModel) return config.smallModel;
  if (mainSpec.startsWith("anthropic/")) return "anthropic/claude-haiku-4-5-20251001";
  return mainSpec;
}
