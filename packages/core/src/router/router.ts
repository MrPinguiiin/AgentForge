import EventEmitter from "eventemitter3";
import type {
  RouterConfig,
  RouterEvents,
  RoutingDecision,
  RoutingRule,
  TaskCard,
} from "./types.js";
import { DEFAULT_ROUTER_CONFIG } from "./types.js";
import type { AgentType, LabelCategory, Task, TaskLabel } from "../db/schema.js";

/**
 * TaskRouter - Routes tasks to appropriate agents based on labels.
 *
 * The router reads task labels and applies routing rules to determine
 * which agent should handle each task. Rules are evaluated in priority
 * order (highest first), and the first matching rule wins.
 */
export class TaskRouter extends EventEmitter<RouterEvents> {
  private config: RouterConfig;

  constructor(config?: Partial<RouterConfig>) {
    super();
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    // Sort rules by priority descending
    this.config.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Route a single task card to an agent.
   * Returns a RoutingDecision with the assigned agent and metadata.
   */
  route(card: TaskCard): RoutingDecision {
    const { task, labels } = card;

    // Find the first matching rule
    let matchedRule: RoutingRule | null = null;
    let confidence: "high" | "medium" | "low" = "low";
    let reason = "";

    for (const rule of this.config.rules) {
      const matchingLabel = labels.find(
        (l) => l.category === rule.category && l.value === rule.value
      );

      if (matchingLabel) {
        matchedRule = rule;
        confidence = "high";
        reason = `Matched rule: ${rule.category}:${rule.value} → ${rule.agent}`;
        break;
      }
    }

    // Determine agent
    let assignedAgent: AgentType;
    if (matchedRule) {
      assignedAgent = matchedRule.agent;
    } else {
      assignedAgent = this.config.defaultAgent;
      confidence = "low";
      reason = `No matching rule found, using default agent: ${this.config.defaultAgent}`;
    }

    // Check if human review is required
    let requiresHumanReview = matchedRule?.requiresHumanReview ?? false;
    if (this.config.highRiskRequiresHuman) {
      const hasHighRisk = labels.some(
        (l) => l.category === "risk" && l.value === "high"
      );
      if (hasHighRisk) {
        requiresHumanReview = true;
      }
    }

    // Check if planning is required
    const requiresPlanning = matchedRule?.requiresPlanning ?? false;

    // Generate branch name
    const branch = this.generateBranchName(task, labels);

    const decision: RoutingDecision = {
      taskId: task.id,
      assignedAgent,
      matchedRule,
      requiresHumanReview,
      requiresPlanning,
      branch,
      confidence,
      reason,
    };

    this.emit("router:decision", decision);
    return decision;
  }

  /**
   * Route multiple task cards (batch routing).
   * Respects maxParallelTasks limit.
   */
  routeBatch(cards: TaskCard[]): RoutingDecision[] {
    const decisions: RoutingDecision[] = [];
    const limit = Math.min(cards.length, this.config.maxParallelTasks);

    for (let i = 0; i < limit; i++) {
      decisions.push(this.route(cards[i]));
    }

    return decisions;
  }

  /**
   * Generate a git branch name from task metadata.
   */
  private generateBranchName(task: Task, labels: TaskLabel[]): string {
    const areaLabel = labels.find((l) => l.category === "area");
    const area = areaLabel?.value ?? "general";

    // Create slug from title
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    return this.config.branchPattern
      .replace("{area}", area)
      .replace("{slug}", slug)
      .replace("{id}", task.id.slice(0, 8));
  }

  /**
   * Check if a task should be blocked (moved to needs_human).
   */
  shouldBlock(card: TaskCard): { blocked: boolean; reason: string } {
    const { labels } = card;

    // Block if no labels at all (ambiguous)
    if (labels.length === 0) {
      return {
        blocked: true,
        reason: "Task has no labels - cannot determine routing. Needs human input.",
      };
    }

    // Block if conflicting type labels
    const typeLabels = labels.filter((l) => l.category === "type");
    if (typeLabels.length > 2) {
      return {
        blocked: true,
        reason: `Task has ${typeLabels.length} type labels - ambiguous routing. Needs human clarification.`,
      };
    }

    return { blocked: false, reason: "" };
  }

  /**
   * Get the current router configuration.
   */
  getConfig(): RouterConfig {
    return { ...this.config };
  }

  /**
   * Update router configuration.
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.rules) {
      this.config.rules.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Add a routing rule dynamically.
   */
  addRule(rule: RoutingRule): void {
    this.config.rules.push(rule);
    this.config.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a routing rule by category + value.
   */
  removeRule(category: LabelCategory, value: string): boolean {
    const idx = this.config.rules.findIndex(
      (r) => r.category === category && r.value === value
    );
    if (idx >= 0) {
      this.config.rules.splice(idx, 1);
      return true;
    }
    return false;
  }
}
