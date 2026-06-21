import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALIASES,
  canonicalProvider,
  COMPATIBLE,
  DEFAULT_KEY_ENV,
  defaultModelSpec,
  hasKey,
  resolveApiKey,
  resolveModel,
} from "../src/provider/registry.js";
import type { CycodeConfig } from "../src/config.js";

const KEY_ENVS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "OPENROUTER_API_KEY",
];

describe("provider API key resolution", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [...KEY_ENVS, "MY_KEY_VAR"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("every major provider has a default key env var", () => {
    expect(DEFAULT_KEY_ENV).toMatchObject({
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    });
  });

  it("reads a literal apiKey from config for any provider", () => {
    for (const provider of ["anthropic", "openai", "google", "openrouter"]) {
      expect(resolveApiKey(provider, { apiKey: "literal-key" })).toBe("literal-key");
    }
  });

  it("falls back to the provider's default env var", () => {
    process.env.OPENAI_API_KEY = "from-env";
    expect(resolveApiKey("openai", undefined)).toBe("from-env");
    expect(resolveApiKey("anthropic", undefined)).toBeUndefined();
  });

  it("apiKeyEnv overrides both apiKey and the default env var", () => {
    process.env.MY_KEY_VAR = "from-custom-env";
    process.env.OPENAI_API_KEY = "from-default-env";
    expect(
      resolveApiKey("openai", { apiKey: "literal", apiKeyEnv: "MY_KEY_VAR" }),
    ).toBe("from-custom-env");
  });

  it("hasKey treats ollama as always available", () => {
    expect(hasKey("ollama", {})).toBe(true);
    expect(hasKey("anthropic", {})).toBe(false);
    expect(hasKey("anthropic", { providers: { anthropic: { apiKey: "k" } } })).toBe(true);
  });

  it("defaultModelSpec picks the first provider with a usable key, from env or config", () => {
    process.env.OPENAI_API_KEY = "x";
    expect(defaultModelSpec({})).toBe("openai/gpt-5.1");

    const cfg: CycodeConfig = { providers: { google: { apiKey: "g" } } };
    delete process.env.OPENAI_API_KEY;
    expect(defaultModelSpec(cfg)).toBe("google/gemini-2.5-pro");
  });

  it("defaultModelSpec errors clearly when nothing is configured", () => {
    expect(() => defaultModelSpec({})).toThrow(/No model configured/);
  });

  it("builds models for every provider using a config key (no throw)", () => {
    const cfg: CycodeConfig = {
      providers: {
        anthropic: { apiKey: "a" },
        openai: { apiKey: "b" },
        google: { apiKey: "c" },
        openrouter: { apiKey: "d" },
      },
    };
    expect(() => resolveModel("anthropic/claude-sonnet-4-6", cfg)).not.toThrow();
    expect(() => resolveModel("openai/gpt-5.1", cfg)).not.toThrow();
    expect(() => resolveModel("google/gemini-2.5-pro", cfg)).not.toThrow();
    expect(() => resolveModel("openrouter/anthropic/claude-sonnet-4-6", cfg)).not.toThrow();
    expect(() => resolveModel("ollama/llama3.3", {})).not.toThrow();
  });

  it("rejects an unknown provider without a baseURL", () => {
    expect(() => resolveModel("mystery/model", {})).toThrow(/Unknown provider/);
    expect(() =>
      resolveModel("mystery/model", { providers: { mystery: { baseURL: "http://x/v1" } } }),
    ).not.toThrow();
  });
});

describe("Chinese providers as built-ins", () => {
  const saved: Record<string, string | undefined> = {};
  const allKeyEnvs = Object.values(DEFAULT_KEY_ENV);

  beforeEach(() => {
    for (const k of allKeyEnvs) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const chinese = [
    "deepseek",
    "qwen",
    "zhipu",
    "moonshot",
    "minimax",
    "hunyuan",
    "doubao",
    "ernie",
    "siliconflow",
    "stepfun",
    "baichuan",
    "yi",
  ];

  it("registers every major Chinese provider with an endpoint and key env", () => {
    for (const p of chinese) {
      expect(COMPATIBLE[p]?.baseURL).toMatch(/^https:\/\//);
      expect(DEFAULT_KEY_ENV[p]).toBeTruthy();
    }
  });

  it("builds a model for each via a config key, with the built-in baseURL", () => {
    for (const p of chinese) {
      const cfg: CycodeConfig = { providers: { [p]: { apiKey: "k" } } };
      expect(() => resolveModel(`${p}/some-model`, cfg)).not.toThrow();
    }
  });

  it("resolves aliases to canonical providers", () => {
    expect(canonicalProvider("dashscope")).toBe("qwen");
    expect(canonicalProvider("glm")).toBe("zhipu");
    expect(canonicalProvider("kimi")).toBe("moonshot");
    expect(canonicalProvider("ark")).toBe("doubao");
    expect(canonicalProvider("qianfan")).toBe("ernie");
    // an alias spec builds the same provider
    expect(() =>
      resolveModel("kimi/kimi-k2", { providers: { moonshot: { apiKey: "k" } } }),
    ).not.toThrow();
  });

  it("reads keys from each provider's default env var", () => {
    process.env.DEEPSEEK_API_KEY = "ds";
    expect(resolveApiKey("deepseek", undefined)).toBe("ds");
    expect(hasKey("deepseek", {})).toBe(true);
    expect(hasKey("qwen", {})).toBe(false);
  });

  it("defaults to a Chinese provider when only its key is present", () => {
    process.env.DEEPSEEK_API_KEY = "ds";
    expect(defaultModelSpec({})).toBe("deepseek/deepseek-chat");
  });

  it("every alias points at a real provider", () => {
    for (const target of Object.values(ALIASES)) {
      expect(COMPATIBLE[target] ?? ["anthropic", "openai", "google"].includes(target)).toBeTruthy();
    }
  });
});
