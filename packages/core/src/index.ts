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
  AddTaskLabelInput,
  TaskWithLabels,
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
export { FRONTEND_SYSTEM_PROMPT, buildFrontendPrompt } from "./ai/prompts/frontend.js";
export { BACKEND_SYSTEM_PROMPT, buildBackendPrompt } from "./ai/prompts/backend.js";
export { DEBUGGER_SYSTEM_PROMPT, buildDebuggerPrompt } from "./ai/prompts/debugger.js";
export { QA_SYSTEM_PROMPT, buildQAPrompt } from "./ai/prompts/qa.js";
export { DOCS_SYSTEM_PROMPT, buildDocsPrompt } from "./ai/prompts/docs.js";
export { EXPLORE_SYSTEM_PROMPT, buildExplorePrompt } from "./ai/prompts/explore.js";

// Agents
export { BaseAgent } from "./agents/base-agent.js";
export { PlannerAgent } from "./agents/planner.js";
export { CoderAgent } from "./agents/coder.js";
export { ReviewerAgent } from "./agents/reviewer.js";
export { FrontendAgent } from "./agents/frontend.js";
export { BackendAgent } from "./agents/backend.js";
export { DebuggerAgent } from "./agents/debugger.js";
export { QAAgent } from "./agents/qa.js";
export { DocsAgent } from "./agents/docs.js";
export { ExploreAgent } from "./agents/explore.js";
export type {
  AgentContext,
  StreamChunk,
  PlannerResult,
  SubtaskPlan,
  CoderResult,
  FileOperationPlan,
  ReviewerResult,
  FileReview,
  QAResult,
  TestReport,
  ExploreResult,
  ResearchFinding,
  Agent,
  AgentResultMap,
} from "./agents/types.js";

// Context
export { ProjectScanner } from "./worker/project-scanner.js";
export { ContextResolver } from "./context/resolver.js";
export type { ContextConfig, FrameworkInfo, RelevanceScore } from "./context/types.js";
export { DEFAULT_CONTEXT_CONFIG } from "./context/types.js";

// Router
export { TaskRouter } from "./router/router.js";
export type {
  RoutingRule,
  RouterConfig,
  RoutingDecision,
  TaskCard,
  RouterEvents,
} from "./router/types.js";
export { DEFAULT_ROUTING_RULES, DEFAULT_ROUTER_CONFIG } from "./router/types.js";

// Guardrails
export { Guardrails } from "./guardrails/guardrails.js";
export type {
  GuardrailCheck,
  GuardrailConfig,
  GuardrailEvents,
} from "./guardrails/types.js";
export { DEFAULT_GUARDRAIL_CONFIG } from "./guardrails/types.js";

// Orchestrator (legacy)
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

// Kanban Orchestrator
export { KanbanOrchestrator } from "./orchestrator/kanban-orchestrator.js";
export type {
  KanbanOrchestratorConfig,
  KanbanOrchestratorEvents,
} from "./orchestrator/kanban-orchestrator.js";

// Worker Infrastructure
export { JobQueue } from "./worker/job-queue.js";
export type { JobData, JobResult, QueueEvents, JobProcessor } from "./worker/job-queue.js";
export { OpenCodeRunner, OpenCodeServer, OpenCodeServerPool, parsePlanningJson } from "./worker/opencode-runner.js";
export type { OpenCodeRunOptions, OpenCodeRunResult, RunnerEvents, OpenCodeServerConfig } from "./worker/opencode-runner.js";
export { BranchManager } from "./worker/branch-manager.js";
export type { BranchInfo } from "./worker/branch-manager.js";
export { ResultCollector } from "./worker/result-collector.js";
export type { CollectedResults } from "./worker/result-collector.js";
export { TaskHiveWorker } from "./worker/taskhive-worker.js";
export type { WorkerEvents, WorkerConfig } from "./worker/taskhive-worker.js";
export {
  buildPlanningPrompt as buildTaskHivePlanningPrompt,
  buildExecutionPrompt as buildTaskHiveExecutionPrompt,
  buildReviewPrompt as buildTaskHiveReviewPrompt,
  buildQAPrompt as buildTaskHiveQAPrompt,
} from "./worker/prompt-templates.js";
export { log as workerLog } from "./worker/logger.js";
