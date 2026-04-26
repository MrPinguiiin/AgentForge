// Database
export * from "./db/schema.js";
export { getDatabase, initializeDatabase, closeDatabase } from "./db/client.js";

// Task Manager
export { TaskManager } from "./task-manager/task-manager.js";
export type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithSubtasks,
  MoveTaskInput,
  ReorderTaskInput,
  AddTaskFileInput,
  UpdateTaskFileInput,
} from "./task-manager/types.js";

// File Manager
export { FileManager } from "./file-manager/file-manager.js";
export { DiffEngine } from "./file-manager/diff-engine.js";
export type {
  FileOperation,
  FileOperationType,
  FileContent,
  ProjectFileTree,
  DiffResult,
  DiffHunk,
  ApplyResult,
} from "./file-manager/types.js";

// Git Manager
export { GitManager } from "./git-manager/git-manager.js";
export type {
  GitStatus,
  GitCommitResult,
  GitLogEntry,
  GitPushResult,
} from "./git-manager/types.js";

// AI
export { ProviderRegistry } from "./ai/provider.js";
export {
  providerConfigSchema,
  agentModelConfigSchema,
  aiConfigSchema,
  DEFAULT_AI_CONFIG,
} from "./ai/models.js";
export type { ProviderConfig, AgentModelConfig, AIConfig } from "./ai/models.js";

// Prompts
export { PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "./ai/prompts/planner.js";
export { CODER_SYSTEM_PROMPT, buildCoderPrompt } from "./ai/prompts/coder.js";
export { REVIEWER_SYSTEM_PROMPT, buildReviewerPrompt } from "./ai/prompts/reviewer.js";

// Agents
export { BaseAgent } from "./agents/base-agent.js";
export { PlannerAgent } from "./agents/planner.js";
export { CoderAgent } from "./agents/coder.js";
export { ReviewerAgent } from "./agents/reviewer.js";
export type {
  AgentContext,
  StreamChunk,
  PlannerResult,
  SubtaskPlan,
  CoderResult,
  FileOperationPlan,
  ReviewerResult,
  FileReview,
  Agent,
} from "./agents/types.js";

// Context
export { ProjectScanner } from "./context/scanner.js";
export { ContextResolver } from "./context/resolver.js";
export type { ContextConfig, FrameworkInfo, RelevanceScore } from "./context/types.js";
export { DEFAULT_CONTEXT_CONFIG } from "./context/types.js";

// Orchestrator
export { Orchestrator } from "./orchestrator/orchestrator.js";
export type { OrchestratorConfig } from "./orchestrator/orchestrator.js";
export type { OrchestratorEvents } from "./orchestrator/events.js";
export {
  isValidTransition,
  getAvailableTransitions,
  getNextStage,
  PIPELINE_STAGES,
} from "./orchestrator/pipeline.js";
export type { PipelineStage } from "./orchestrator/pipeline.js";
