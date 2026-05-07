import type { LanguageModel } from "ai";
import type { AgentType, Task, TaskFile, TaskLabel } from "../db/schema.js";

export interface AgentContext {
  task: Task;
  projectRoot: string;
  projectContext: string;
  relevantFiles?: Array<{ path: string; content: string }>;
  existingFiles?: string[];
  framework?: string;
  language?: string;
  taskFiles?: TaskFile[];
  labels?: TaskLabel[];
  branch?: string;
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
  labels?: Array<{ category: string; value: string }>;
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

// --- QA ---

export interface TestReport {
  testsAdded: number;
  coverageAreas: string[];
  regressionRisks: string[];
}

export interface QAResult {
  explanation: string;
  operations: FileOperationPlan[];
  testReport: TestReport;
}

// --- Explore / Research ---

export interface ResearchFinding {
  path: string;
  purpose: string;
  relevance: string;
}

export interface ExploreResult {
  explanation: string;
  operations: FileOperationPlan[]; // Always empty for explore agent
  research: {
    summary: string;
    relevantFiles: ResearchFinding[];
    architecture: string;
    recommendations: string[];
    risks: string[];
  };
}

// --- Agent Interface ---

export interface Agent<TResult> {
  name: string;
  execute(context: AgentContext): AsyncGenerator<StreamChunk, TResult, undefined>;
}

// --- Agent Registry (maps AgentType to result types) ---

export type AgentResultMap = {
  planner: PlannerResult;
  coder: CoderResult;
  reviewer: ReviewerResult;
  frontend: CoderResult;
  backend: CoderResult;
  debugger: CoderResult;
  qa: QAResult;
  docs: CoderResult;
  explore: ExploreResult;
};
