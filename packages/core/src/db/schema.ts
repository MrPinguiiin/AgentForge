import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";

// --- Enums as string unions ---

export type TaskStatus =
  | "backlog"
  | "todo"
  | "ready"
  | "planning_queued"
  | "planned"
  | "planning"
  | "coding"
  | "in_progress"
  | "needs_human"
  | "in_review"
  | "qa"
  | "done"
  | "cancelled"
  | "failed";

export type AgentType =
  | "planner"
  | "coder"
  | "reviewer"
  | "frontend"
  | "backend"
  | "debugger"
  | "qa"
  | "docs"
  | "explore";

export type TaskFileStatus = "pending" | "modified" | "created" | "deleted" | "reviewed" | "applied" | "rejected";

export type RunType = "planning" | "execution" | "review" | "qa";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ArtifactType = "git_status" | "git_diff_stat" | "git_diff" | "test_log" | "final_summary" | "planning_json" | "review_verdict" | "qa_report";

// --- Label Types ---

export type LabelCategory = "type" | "risk" | "scope" | "area" | "priority";

export type LabelValue =
  // type labels
  | "frontend"
  | "backend"
  | "bug"
  | "test"
  | "docs"
  | "research"
  | "refactor"
  | "feature"
  // risk labels
  | "high"
  | "medium"
  | "low"
  // scope labels
  | "large"
  | "small"
  // area labels (extensible via metadata)
  | string;

// --- Planning JSON types ---

export interface PlanningResult {
  summary: string;
  needs_human: boolean;
  human_questions: string[];
  risk_level: "low" | "medium" | "high";
  recommended_agent: string;
  recommended_subagents: string[];
  files_to_inspect: string[];
  likely_files_to_change: string[];
  implementation_steps: string[];
  test_plan: string[];
  acceptance_checklist: string[];
  routing_decision: {
    next_column: string;
    reason: string;
  };
}

// --- Tables ---

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  description: text("description"),
  framework: text("framework"),
  language: text("language"),
  defaultBranch: text("default_branch").default("main"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  description: text("description"),
  acceptanceCriteria: text("acceptance_criteria"),
  status: text("status").$type<TaskStatus>().notNull().default("backlog"),
  priority: integer("priority").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  agentType: text("agent_type").$type<AgentType>(),
  branch: text("branch"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  reviewMode: text("review_mode").$type<"auto" | "human">().default("auto"),
  approvalMode: text("approval_mode").$type<"auto" | "manual">().default("auto"),
  needsHumanReason: text("needs_human_reason").$type<"plan_review" | "code_review" | "high_risk">(),
  batchId: text("batch_id"),
  executionOrder: integer("execution_order").notNull().default(0),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  routedAt: integer("routed_at", { mode: "timestamp" }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const taskLabels = sqliteTable("task_labels", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  category: text("category").$type<LabelCategory>().notNull(),
  value: text("value").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const taskFiles = sqliteTable("task_files", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  action: text("action").$type<"create" | "modify" | "delete">().default("modify"),
  status: text("status").$type<TaskFileStatus>().notNull().default("pending"),
  diff: text("diff"),
  originalContent: text("original_content"),
  modifiedContent: text("modified_content"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- NEW: Task Plans (from docs section 14) ---

export const taskPlans = sqliteTable("task_plans", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => taskRuns.id, { onDelete: "cascade" }),
  summary: text("summary"),
  planJson: text("plan_json", { mode: "json" }).$type<PlanningResult>().notNull(),
  recommendedAgent: text("recommended_agent"),
  riskLevel: text("risk_level").$type<"low" | "medium" | "high">(),
  needsHuman: integer("needs_human", { mode: "boolean" }).default(false),
  approved: integer("approved", { mode: "boolean" }).default(false),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- REFACTORED: Task Runs (aligned with docs section 14) ---

export const taskRuns = sqliteTable("task_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  runType: text("run_type").$type<RunType>().notNull(),
  status: text("status").$type<RunStatus>().notNull().default("queued"),
  agentName: text("agent_name"),
  command: text("command"),
  exitCode: integer("exit_code"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  error: text("error"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  model: text("model"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- NEW: Task Artifacts (from docs section 14) ---

export const taskArtifacts = sqliteTable("task_artifacts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => taskRuns.id, { onDelete: "cascade" }),
  artifactType: text("artifact_type").$type<ArtifactType>().notNull(),
  content: text("content"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- LEGACY: Agent Runs (kept for backward compat, will be migrated) ---

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  agentType: text("agent_type").$type<AgentType>().notNull(),
  status: text("status").$type<"running" | "completed" | "failed">().notNull().default("running"),
  input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
  output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  model: text("model"),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// --- Job Queue (SQLite-backed) ---

export type JobStatus = "pending" | "active" | "completed" | "failed" | "cancelled";
export type JobType = "planning" | "execution" | "review" | "qa";

export const jobQueue = sqliteTable("job_queue", {
  id: text("id").primaryKey(),
  type: text("type").$type<JobType>().notNull(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status").$type<JobStatus>().notNull().default("pending"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  priority: integer("priority").notNull().default(0),
  lockedAt: integer("locked_at", { mode: "timestamp" }),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// --- Type exports ---

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskLabel = typeof taskLabels.$inferSelect;
export type NewTaskLabel = typeof taskLabels.$inferInsert;

export type TaskFile = typeof taskFiles.$inferSelect;
export type NewTaskFile = typeof taskFiles.$inferInsert;

export type TaskPlan = typeof taskPlans.$inferSelect;
export type NewTaskPlan = typeof taskPlans.$inferInsert;

export type TaskRun = typeof taskRuns.$inferSelect;
export type NewTaskRun = typeof taskRuns.$inferInsert;

export type TaskArtifact = typeof taskArtifacts.$inferSelect;
export type NewTaskArtifact = typeof taskArtifacts.$inferInsert;

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

export type Job = typeof jobQueue.$inferSelect;
export type NewJob = typeof jobQueue.$inferInsert;

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
