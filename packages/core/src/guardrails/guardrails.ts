import EventEmitter from "eventemitter3";
import type { GuardrailCheck, GuardrailConfig, GuardrailEvents } from "./types.js";
import { DEFAULT_GUARDRAIL_CONFIG } from "./types.js";
import type { AgentType, Task } from "../db/schema.js";
import type { CoderResult } from "../agents/types.js";
import type { RoutingDecision } from "../router/types.js";

/**
 * Guardrails - Safety checks for agent operations.
 *
 * Validates that agent actions comply with safety rules before
 * allowing execution or commits.
 */
export class Guardrails extends EventEmitter<GuardrailEvents> {
  private config: GuardrailConfig;

  constructor(config?: Partial<GuardrailConfig>) {
    super();
    this.config = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  }

  /**
   * Pre-execution checks: validate before an agent runs.
   */
  preExecutionChecks(task: Task, decision: RoutingDecision): GuardrailCheck[] {
    const checks: GuardrailCheck[] = [];

    // Check: branch is not protected
    if (this.config.protectedBranches.includes(decision.branch)) {
      checks.push({
        passed: false,
        rule: "protected-branch",
        message: `Cannot work on protected branch: ${decision.branch}`,
        severity: "block",
      });
    }

    // Check: retry limit not exceeded
    if (task.retryCount >= this.config.maxRetries) {
      checks.push({
        passed: false,
        rule: "max-retries",
        message: `Task has exceeded maximum retries (${task.retryCount}/${this.config.maxRetries})`,
        severity: "block",
      });
    }

    // Check: task is in a valid state for execution
    if (task.status !== "ready" && task.status !== "failed") {
      checks.push({
        passed: false,
        rule: "invalid-status",
        message: `Task status "${task.status}" is not valid for agent execution. Must be "ready" or "failed".`,
        severity: "block",
      });
    }

    // Check: human approval not required
    if (this.config.humanApprovalRequired.includes(task.status)) {
      checks.push({
        passed: false,
        rule: "human-approval-required",
        message: `Task status "${task.status}" requires human approval before proceeding.`,
        severity: "block",
      });
    }

    // Emit events
    const blockers = checks.filter((c) => !c.passed && c.severity === "block");
    const warnings = checks.filter((c) => !c.passed && c.severity === "warn");

    if (blockers.length > 0) {
      this.emit("guardrail:blocked", task.id, blockers);
    }
    if (warnings.length > 0) {
      this.emit("guardrail:warning", task.id, warnings);
    }

    return checks;
  }

  /**
   * Post-execution checks: validate agent output before applying.
   */
  postExecutionChecks(
    task: Task,
    agentType: AgentType,
    result: CoderResult
  ): GuardrailCheck[] {
    const checks: GuardrailCheck[] = [];

    // Check: read-only agents should not produce file operations
    if (this.config.readOnlyAgents.includes(agentType) && result.operations.length > 0) {
      checks.push({
        passed: false,
        rule: "read-only-violation",
        message: `Agent "${agentType}" is read-only but produced ${result.operations.length} file operations.`,
        severity: "block",
      });
    }

    // Check: max files per run
    if (result.operations.length > this.config.maxFilesPerRun) {
      checks.push({
        passed: false,
        rule: "max-files-exceeded",
        message: `Agent produced ${result.operations.length} file operations, exceeding limit of ${this.config.maxFilesPerRun}.`,
        severity: "block",
      });
    }

    // Check: max lines per run
    const totalLines = result.operations.reduce((sum, op) => {
      return sum + (op.content?.split("\n").length ?? 0);
    }, 0);
    if (totalLines > this.config.maxLinesPerRun) {
      checks.push({
        passed: false,
        rule: "max-lines-exceeded",
        message: `Agent produced ${totalLines} lines of changes, exceeding limit of ${this.config.maxLinesPerRun}.`,
        severity: "warn",
      });
    }

    // Check: no operations targeting protected paths
    const dangerousPaths = [".env", ".git/", "node_modules/"];
    for (const op of result.operations) {
      if (dangerousPaths.some((p) => op.filePath.startsWith(p) || op.filePath.includes(`/${p}`))) {
        checks.push({
          passed: false,
          rule: "dangerous-path",
          message: `Agent attempted to modify dangerous path: ${op.filePath}`,
          severity: "block",
        });
      }
    }

    // Emit events
    const blockers = checks.filter((c) => !c.passed && c.severity === "block");
    const warnings = checks.filter((c) => !c.passed && c.severity === "warn");

    if (blockers.length > 0) {
      this.emit("guardrail:blocked", task.id, blockers);
    }
    if (warnings.length > 0) {
      this.emit("guardrail:warning", task.id, warnings);
    }

    return checks;
  }

  /**
   * Branch validation: ensure branch name is safe.
   */
  validateBranch(branch: string): GuardrailCheck {
    if (this.config.protectedBranches.includes(branch)) {
      return {
        passed: false,
        rule: "protected-branch",
        message: `Branch "${branch}" is protected and cannot be used by agents.`,
        severity: "block",
      };
    }

    return {
      passed: true,
      rule: "protected-branch",
      message: `Branch "${branch}" is safe to use.`,
      severity: "info",
    };
  }

  /**
   * Check if all blocking guardrails pass.
   */
  allPassed(checks: GuardrailCheck[]): boolean {
    return checks.every((c) => c.passed || c.severity !== "block");
  }

  /**
   * Get current configuration.
   */
  getConfig(): GuardrailConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<GuardrailConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
