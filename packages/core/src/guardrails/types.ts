import type { AgentType, TaskStatus } from "../db/schema.js";

// --- Guardrail Check Result ---

export interface GuardrailCheck {
  passed: boolean;
  rule: string;
  message: string;
  severity: "block" | "warn" | "info";
}

// --- Guardrail Configuration ---

export interface GuardrailConfig {
  /** Branches that agents are never allowed to push to */
  protectedBranches: string[];
  /** Maximum number of retries before marking as failed */
  maxRetries: number;
  /** Whether tests must pass before marking task as done */
  requireTestsPass: boolean;
  /** Whether to run linter before committing */
  requireLintPass: boolean;
  /** Maximum number of files an agent can modify in one run */
  maxFilesPerRun: number;
  /** Maximum lines of code an agent can change in one run */
  maxLinesPerRun: number;
  /** Agent types that are read-only (cannot modify files) */
  readOnlyAgents: AgentType[];
  /** Task statuses that require human approval to transition from */
  humanApprovalRequired: TaskStatus[];
  /** Maximum parallel agent executions */
  maxParallelExecutions: number;
  /** Timeout for agent execution in milliseconds */
  agentTimeoutMs: number;
  /** Whether to create a backup branch before agent modifications */
  createBackupBranch: boolean;
}

// --- Default Guardrail Config ---

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  protectedBranches: ["main", "master", "production", "develop"],
  maxRetries: 3,
  requireTestsPass: true,
  requireLintPass: false,
  maxFilesPerRun: 20,
  maxLinesPerRun: 1000,
  readOnlyAgents: ["explore", "planner"],
  humanApprovalRequired: ["needs_human"],
  maxParallelExecutions: 3,
  agentTimeoutMs: 300_000, // 5 minutes
  createBackupBranch: false,
};

// --- Guardrail Events ---

export interface GuardrailEvents {
  "guardrail:check": (taskId: string, check: GuardrailCheck) => void;
  "guardrail:blocked": (taskId: string, checks: GuardrailCheck[]) => void;
  "guardrail:warning": (taskId: string, checks: GuardrailCheck[]) => void;
}
