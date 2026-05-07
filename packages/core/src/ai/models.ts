import { z } from "zod";

// --- Zod Schemas ---

export const providerConfigSchema = z.object({
  type: z.enum(["openai", "anthropic", "openrouter", "custom"]),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  enabled: z.boolean().default(true),
  /** Display name for custom providers */
  name: z.string().optional(),
});

export const agentModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxOutputTokens: z.number().positive().default(4096),
});

export const aiConfigSchema = z.object({
  providers: z.record(z.string(), providerConfigSchema),
  agents: z.object({
    // Core pipeline
    planner: agentModelConfigSchema,
    coder: agentModelConfigSchema,
    reviewer: agentModelConfigSchema,
    // Specialist agents
    frontend: agentModelConfigSchema,
    backend: agentModelConfigSchema,
    debugger: agentModelConfigSchema,
    // Quality & research
    qa: agentModelConfigSchema,
    docs: agentModelConfigSchema,
    explore: agentModelConfigSchema,
  }),
  defaultProvider: z.string().default("openrouter"),
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
    // Core pipeline
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
    // Specialist agents
    frontend: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.3,
      maxOutputTokens: 16384,
    },
    backend: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.3,
      maxOutputTokens: 16384,
    },
    debugger: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.2,
      maxOutputTokens: 16384,
    },
    // Quality & research
    qa: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
    docs: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.5,
      maxOutputTokens: 8192,
    },
    explore: {
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  },
  defaultProvider: "openrouter",
};
