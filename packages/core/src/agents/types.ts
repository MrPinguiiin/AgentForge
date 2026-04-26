import type { LanguageModel } from "ai";
import type { Task, TaskFile } from "../db/schema.js";

export interface AgentContext {
  task: Task;
  projectRoot: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  existingFiles?: string[];
  framework?: string;
  language?: string;
  taskFiles?: TaskFile[];
}

export interface StreamChunk {
  type: "text" | "tool_call" | "error" | "done";
  content: string;
  metadata?: Record<string, unknown>;
}

// --- Planner ---

export interface SubtaskPlan {
  title: string;
  description: string;
  files: string[];
  priority: number;
  estimatedComplexity: "low" | "medium" | "high";
}

export interface PlannerResult {
  analysis: string;
  subtasks: SubtaskPlan[];
}

// --- Coder ---

export interface FileOperationPlan {
  type: "create" | "modify" | "delete";
  filePath: string;
  content?: string;
  description: string;
}

export interface CoderResult {
  explanation: string;
  operations: FileOperationPlan[];
}

// --- Reviewer ---

export interface ReviewIssue {
  severity: "critical" | "warning" | "suggestion" | "info";
  line?: number;
  message: string;
  suggestion?: string;
}

export interface FileReview {
  filePath: string;
  issues: ReviewIssue[];
}

export interface ReviewerResult {
  summary: string;
  approved: boolean;
  files: FileReview[];
}

// --- Agent Interface ---

export interface Agent<TResult> {
  name: string;
  execute(context: AgentContext): AsyncGenerator<StreamChunk, TResult, undefined>;
}
