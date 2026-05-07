import type { AgentType, LabelCategory, Task, TaskLabel } from "../db/schema.js";

// --- Routing Rule ---

export interface RoutingRule {
  /** Label category to match (e.g., "type", "scope", "risk") */
  category: LabelCategory;
  /** Label value to match */
  value: string;
  /** Agent to assign when this rule matches */
  agent: AgentType;
  /** Priority of this rule (higher = evaluated first) */
  priority: number;
  /** If true, this rule requires human review after agent completes */
  requiresHumanReview?: boolean;
  /** If true, run planner-agent first before the target agent */
  requiresPlanning?: boolean;
}

// --- Router Configuration ---

export interface RouterConfig {
  /** Routing rules evaluated in priority order (highest first) */
  rules: RoutingRule[];
  /** Default agent when no rule matches */
  defaultAgent: AgentType;
  /** Maximum number of tasks to process in parallel */
  maxParallelTasks: number;
  /** Whether to auto-create branches for tasks */
  autoCreateBranch: boolean;
  /** Branch prefix pattern (e.g., "agent/{area}-{slug}") */
  branchPattern: string;
  /** Whether to require tests to pass before marking done */
  requireTestsPass: boolean;
  /** Whether high-risk tasks always need human review */
  highRiskRequiresHuman: boolean;
}

// --- Routing Decision ---

export interface RoutingDecision {
  taskId: string;
  assignedAgent: AgentType;
  matchedRule: RoutingRule | null;
  requiresHumanReview: boolean;
  requiresPlanning: boolean;
  branch: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// --- Task Card (enriched task for routing) ---

export interface TaskCard {
  task: Task;
  labels: TaskLabel[];
}

// --- Router Events ---

export interface RouterEvents {
  "router:decision": (decision: RoutingDecision) => void;
  "router:dispatch": (taskId: string, agent: AgentType) => void;
  "router:complete": (taskId: string, agent: AgentType, success: boolean) => void;
  "router:retry": (taskId: string, attempt: number, maxRetries: number) => void;
  "router:blocked": (taskId: string, reason: string) => void;
  "router:error": (taskId: string, error: Error) => void;
}

// --- Default Routing Rules ---

export const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  // Scope rules (highest priority - large tasks need planning first)
  { category: "scope", value: "large", agent: "planner", priority: 100, requiresPlanning: true },

  // Risk rules
  { category: "risk", value: "high", agent: "coder", priority: 90, requiresHumanReview: true },

  // Type rules
  { category: "type", value: "frontend", agent: "frontend", priority: 50 },
  { category: "type", value: "backend", agent: "backend", priority: 50 },
  { category: "type", value: "bug", agent: "debugger", priority: 60 },
  { category: "type", value: "test", agent: "qa", priority: 50 },
  { category: "type", value: "docs", agent: "docs", priority: 40 },
  { category: "type", value: "research", agent: "explore", priority: 40 },
  { category: "type", value: "refactor", agent: "coder", priority: 50 },
  { category: "type", value: "feature", agent: "coder", priority: 45 },
];

// --- Default Router Config ---

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  rules: DEFAULT_ROUTING_RULES,
  defaultAgent: "coder",
  maxParallelTasks: 3,
  autoCreateBranch: true,
  branchPattern: "agent/{area}-{slug}",
  requireTestsPass: true,
  highRiskRequiresHuman: true,
};
