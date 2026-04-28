import { z } from "zod";

export const serverConfigSchema = z.object({
  port: z.number().min(1).max(65535).default(3001),
  host: z.string().default("localhost"),
});

export const providerConfigSchema = z.object({
  apiKey: z.string().default(""),
  baseUrl: z.string().optional(),
});

export const agentModelConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "openrouter"]),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().min(100).max(128000).default(4096),
});

export const aiConfigSchema = z.object({
  defaultProvider: z
    .enum(["openai", "anthropic", "openrouter"])
    .default("openai"),
  providers: z.object({
    openai: providerConfigSchema.optional(),
    anthropic: providerConfigSchema.optional(),
    openrouter: providerConfigSchema.optional(),
  }),
  agents: z.object({
    planner: agentModelConfigSchema,
    coder: agentModelConfigSchema,
    reviewer: agentModelConfigSchema,
  }),
});

export const contextConfigSchema = z.object({
  maxContextFiles: z.number().default(20),
  maxFileSize: z.number().default(50000),
  ignorePatterns: z.array(z.string()).default([]),
});

export const gitConfigSchema = z.object({
  autoCommit: z.boolean().default(true),
  autoPush: z.boolean().default(false),
  commitPrefix: z.string().default("ai-coder:"),
});

export const appConfigSchema = z.object({
  server: serverConfigSchema,
  ai: aiConfigSchema,
  context: contextConfigSchema,
  git: gitConfigSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
