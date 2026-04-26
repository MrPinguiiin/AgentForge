import { z } from "zod";

// --- Zod Schemas ---

export const providerConfigSchema = z.object({
  type: z.enum(["openai", "anthropic", "openrouter"]),
  apiKey: z.string().optional(),
  baseURL: z.string().url().optional(),
  enabled: z.boolean().default(true),
});

export const agentModelConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "openrouter"]),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxOutputTokens: z.number().positive().default(4096),
});

export const aiConfigSchema = z.object({
  providers: z.record(z.string(), providerConfigSchema),
  agents: z.object({
    planner: agentModelConfigSchema,
    coder: agentModelConfigSchema,
    reviewer: agentModelConfigSchema,
  }),
  defaultProvider: z.enum(["openai", "anthropic", "openrouter"]).default("openrouter"),
});

// --- Types ---

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type AgentModelConfig = z.infer<typeof agentModelConfigSchema>;
export type AIConfig = z.infer<typeof aiConfigSchema>;

// --- Defaults ---

export const DEFAULT_AI_CONFIG: AIConfig = {
  providers: {
    openrouter: {
      type: "openrouter",
      enabled: true,
    },
    openai: {
      type: "openai",
      enabled: false,
    },
    anthropic: {
      type: "anthropic",
      enabled: false,
    },
  },
  agents: {
    planner: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
    coder: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.3,
      maxOutputTokens: 16384,
    },
    reviewer: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.5,
      maxOutputTokens: 8192,
    },
  },
  defaultProvider: "openrouter",
};
