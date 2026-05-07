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
    frontend: agentModelConfigSchema.optional(),
    backend: agentModelConfigSchema.optional(),
    debugger: agentModelConfigSchema.optional(),
    qa: agentModelConfigSchema.optional(),
    docs: agentModelConfigSchema.optional(),
    explore: agentModelConfigSchema.optional(),
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

export const routerConfigSchema = z.object({
  maxParallelTasks: z.number().min(1).max(10).default(3),
  autoCreateBranch: z.boolean().default(true),
  branchPattern: z.string().default("agent/{area}-{slug}"),
  requireTestsPass: z.boolean().default(true),
  highRiskRequiresHuman: z.boolean().default(true),
  pollIntervalMs: z.number().min(0).default(0),
});

export const guardrailConfigSchema = z.object({
  protectedBranches: z.array(z.string()).default(["main", "master", "production", "develop"]),
  maxRetries: z.number().min(0).max(10).default(3),
  requireTestsPass: z.boolean().default(true),
  requireLintPass: z.boolean().default(false),
  maxFilesPerRun: z.number().min(1).max(100).default(20),
  maxLinesPerRun: z.number().min(100).max(10000).default(1000),
  readOnlyAgents: z.array(z.string()).default(["explore", "planner"]),
  maxParallelExecutions: z.number().min(1).max(10).default(3),
  agentTimeoutMs: z.number().min(10000).max(600000).default(300000),
  createBackupBranch: z.boolean().default(false),
});

export const appConfigSchema = z.object({
  server: serverConfigSchema,
  ai: aiConfigSchema,
  context: contextConfigSchema,
  git: gitConfigSchema,
  router: routerConfigSchema.optional(),
  guardrails: guardrailConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type RouterConfig = z.infer<typeof routerConfigSchema>;
export type GuardrailConfig = z.infer<typeof guardrailConfigSchema>;
