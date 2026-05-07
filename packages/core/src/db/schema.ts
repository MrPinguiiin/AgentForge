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

export type TaskFileStatus = "pending" | "modified" | "created" | "deleted" | "reviewed";

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

// --- Tables ---

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  description: text("description"),
  framework: text("framework"),
  language: text("language"),
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

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
