import EventEmitter from "eventemitter3";
import { TaskRouter } from "../router/router.js";
import { Guardrails } from "../guardrails/guardrails.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { FileManager } from "../file-manager/file-manager.js";
import { GitManager } from "../git-manager/git-manager.js";
import { ContextResolver } from "../context/resolver.js";
import { ProjectScanner } from "../context/scanner.js";
import { ProviderRegistry } from "../ai/provider.js";
import { PlannerAgent } from "../agents/planner.js";
import { CoderAgent } from "../agents/coder.js";
import { ReviewerAgent } from "../agents/reviewer.js";
import { FrontendAgent } from "../agents/frontend.js";
import { BackendAgent } from "../agents/backend.js";
import { DebuggerAgent } from "../agents/debugger.js";
import { QAAgent } from "../agents/qa.js";
import { DocsAgent } from "../agents/docs.js";
import { ExploreAgent } from "../agents/explore.js";
import type {
  AgentContext,
  CoderResult,
  StreamChunk,
  Agent,
} from "../agents/types.js";
import type { AgentType, Task, TaskLabel } from "../db/schema.js";
import type { RouterConfig, RoutingDecision, TaskCard } from "../router/types.js";
import type { GuardrailConfig } from "../guardrails/types.js";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as dbSchema from "../db/schema.js";

// --- Kanban Orchestrator Events ---

export interface KanbanOrchestratorEvents {
  // Lifecycle
  "kanban:tick": (processed: number, remaining: number) => void;
  "kanban:idle": () => void;

  // Task routing
  "task:routed": (taskId: string, decision: RoutingDecision) => void;
  "task:blocked": (taskId: string, reason: string) => void;
  "task:started": (taskId: string, agent: AgentType) => void;
  "task:completed": (taskId: string, agent: AgentType) => void;
  "task:failed": (taskId: string, agent: AgentType, error: Error) => void;
  "task:retry": (taskId: string, attempt: number) => void;
  "task:needs_human": (taskId: string, reason: string) => void;

  // Agent streaming
  "agent:stream": (taskId: string, agent: AgentType, chunk: StreamChunk) => void;

  // Git
  "git:branch_created": (taskId: string, branch: string) => void;
  "git:committed": (taskId: string, branch: string, message: string) => void;

  // Guardrails
  "guardrail:blocked": (taskId: string, reason: string) => void;
  "guardrail:warning": (taskId: string, reason: string) => void;
}

// --- Configuration ---

export interface KanbanOrchestratorConfig {
  projectRoot: string;
  db: BunSQLiteDatabase<typeof dbSchema>;
  taskManager: TaskManager;
  providerRegistry: ProviderRegistry;
  routerConfig?: Partial<RouterConfig>;
  guardrailConfig?: Partial<GuardrailConfig>;
  autoCommit?: boolean;
  autoPush?: boolean;
  /** Polling interval in ms for auto-mode (0 = manual only) */
  pollIntervalMs?: number;
}

/**
 * KanbanOrchestrator - The main engine for Kanban-based task routing.
 *
 * Flow:
 * 1. Picks up tasks in "ready" status
 * 2. Routes them to appropriate agents based on labels
 * 3. Runs guardrail checks
 * 4. Executes the agent
 * 5. Applies changes, commits to branch
 * 6. Moves task to next column (review/qa/done/failed)
 */
export class KanbanOrchestrator extends EventEmitter<KanbanOrchestratorEvents> {
  private router: TaskRouter;
  private guardrails: Guardrails;
  private taskManager: TaskManager;
  private fileManager: FileManager;
  private gitManager: GitManager;
  private contextResolver: ContextResolver;
  private projectScanner: ProjectScanner;
  private providerRegistry: ProviderRegistry;
  private projectRoot: string;
  private autoCommit: boolean;
  private autoPush: boolean;
  private pollIntervalMs: number;

  private isRunning = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeTaskIds: Set<string> = new Set();

  constructor(config: KanbanOrchestratorConfig) {
    super();
    this.projectRoot = config.projectRoot;
    this.taskManager = config.taskManager;
    this.providerRegistry = config.providerRegistry;
    this.autoCommit = config.autoCommit ?? true;
    this.autoPush = config.autoPush ?? false;
    this.pollIntervalMs = config.pollIntervalMs ?? 0;

    this.router = new TaskRouter(config.routerConfig);
    this.guardrails = new Guardrails(config.guardrailConfig);
    this.fileManager = new FileManager(config.projectRoot);
    this.gitManager = new GitManager(config.projectRoot);
    this.contextResolver = new ContextResolver(config.projectRoot);
    this.projectScanner = new ProjectScanner(config.projectRoot);
  }

  // --- Public API ---

  getRouter(): TaskRouter {
    return this.router;
  }

  getGuardrails(): Guardrails {
    return this.guardrails;
  }

  /**
   * Start auto-polling mode. Periodically checks for ready tasks and processes them.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.pollIntervalMs > 0) {
      this.pollTimer = setInterval(() => this.tick(), this.pollIntervalMs);
      // Run immediately on start
      this.tick();
    }
  }

  /**
   * Stop auto-polling mode.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Manual tick: process all ready tasks once.
   */
  async tick(): Promise<number> {
    const readyTasks = await this.getReadyTasks();

    if (readyTasks.length === 0) {
      this.emit("kanban:idle");
      return 0;
    }

    // Build task cards with labels
    const cards: TaskCard[] = await Promise.all(
      readyTasks.map(async (task) => ({
        task,
        labels: await this.getTaskLabels(task.id),
      }))
    );

    // Route batch (respects maxParallelTasks)
    const decisions = this.router.routeBatch(cards);

    // Process each decision
    let processed = 0;
    for (const decision of decisions) {
      const card = cards.find((c) => c.task.id === decision.taskId)!;

      // Check if task should be blocked
      const blockCheck = this.router.shouldBlock(card);
      if (blockCheck.blocked) {
        await this.moveToNeedsHuman(card.task, blockCheck.reason);
        continue;
      }

      // Run guardrail pre-checks
      const preChecks = this.guardrails.preExecutionChecks(card.task, decision);
      if (!this.guardrails.allPassed(preChecks)) {
        const reasons = preChecks
          .filter((c) => !c.passed && c.severity === "block")
          .map((c) => c.message)
          .join("; ");
        await this.moveToFailed(card.task, reasons);
        this.emit("guardrail:blocked", card.task.id, reasons);
        continue;
      }

      // Dispatch to agent
      this.emit("task:routed", card.task.id, decision);
      await this.dispatchTask(card, decision);
      processed++;
    }

    this.emit("kanban:tick", processed, readyTasks.length - processed);
    return processed;
  }

  /**
   * Route and dispatch a single task by ID.
   */
  async dispatchSingle(taskId: string): Promise<RoutingDecision> {
    const task = await this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const labels = await this.getTaskLabels(taskId);
    const card: TaskCard = { task, labels };

    // Check block
    const blockCheck = this.router.shouldBlock(card);
    if (blockCheck.blocked) {
      await this.moveToNeedsHuman(task, blockCheck.reason);
      throw new Error(`Task blocked: ${blockCheck.reason}`);
    }

    const decision = this.router.route(card);

    // Pre-checks
    const preChecks = this.guardrails.preExecutionChecks(task, decision);
    if (!this.guardrails.allPassed(preChecks)) {
      const reasons = preChecks
        .filter((c) => !c.passed && c.severity === "block")
        .map((c) => c.message)
        .join("; ");
      await this.moveToFailed(task, reasons);
      throw new Error(`Guardrail blocked: ${reasons}`);
    }

    this.emit("task:routed", taskId, decision);
    await this.dispatchTask(card, decision);
    return decision;
  }

  /**
   * Get routing decision for a task without executing.
   */
  async previewRoute(taskId: string): Promise<RoutingDecision> {
    const task = await this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const labels = await this.getTaskLabels(taskId);
    return this.router.route({ task, labels });
  }

  // --- Internal ---

  private async dispatchTask(card: TaskCard, decision: RoutingDecision): Promise<void> {
    const { task } = card;
    const { assignedAgent, branch, requiresPlanning, requiresHumanReview } = decision;

    this.activeTaskIds.add(task.id);

    try {
      // Update task status and branch
      await this.taskManager.updateTask(task.id, {
        status: "in_progress",
        agentType: assignedAgent,
        branch,
      } as any);

      // Create branch
      if (this.router.getConfig().autoCreateBranch) {
        await this.createBranch(task.id, branch);
      }

      this.emit("task:started", task.id, assignedAgent);

      // If planning is required, run planner first
      if (requiresPlanning && assignedAgent !== "planner") {
        await this.runAgent(task, "planner", branch);
      }

      // Run the assigned agent
      const result = await this.runAgent(task, assignedAgent, branch);

      // Post-execution guardrail checks
      if (result && typeof result === "object" && "operations" in (result as object)) {
        const postChecks = this.guardrails.postExecutionChecks(
          task,
          assignedAgent,
          result as CoderResult
        );
        if (!this.guardrails.allPassed(postChecks)) {
          const reasons = postChecks
            .filter((c) => !c.passed && c.severity === "block")
            .map((c) => c.message)
            .join("; ");
          await this.moveToFailed(task, reasons);
          this.emit("guardrail:blocked", task.id, reasons);
          return;
        }

        // Apply file operations (for non-read-only agents)
        if ((result as CoderResult).operations.length > 0) {
          await this.applyOperations(task, result as CoderResult, branch);
        }
      }

      // Determine next status
      if (requiresHumanReview) {
        await this.taskManager.updateTask(task.id, { status: "in_review" } as any);
      } else if (assignedAgent === "qa") {
        await this.taskManager.updateTask(task.id, { status: "qa" } as any);
      } else {
        await this.taskManager.updateTask(task.id, { status: "in_review" } as any);
      }

      this.emit("task:completed", task.id, assignedAgent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit("task:failed", task.id, assignedAgent, err);

      // Retry logic
      const currentRetry = task.retryCount + 1;
      if (currentRetry < task.maxRetries) {
        await this.taskManager.updateTask(task.id, {
          status: "ready",
          retryCount: currentRetry,
        } as any);
        this.emit("task:retry", task.id, currentRetry);
      } else {
        await this.moveToFailed(task, err.message);
      }
    } finally {
      this.activeTaskIds.delete(task.id);
    }
  }

  private async runAgent(
    task: Task,
    agentType: AgentType,
    branch: string
  ): Promise<unknown> {
    const agentConfig = this.providerRegistry.getAgentConfig(agentType as any);
    const model = this.providerRegistry.getAgentModel(agentType as any);

    const agent = this.createAgent(agentType, model, {
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxOutputTokens,
    });

    const context = await this.buildAgentContext(task, branch);
    const run = await this.taskManager.createAgentRun(task.id, agentType as any, agentConfig.model);

    try {
      const generator = agent.execute(context);
      let iterResult = await generator.next();

      while (!iterResult.done) {
        const chunk = iterResult.value as StreamChunk;
        this.emit("agent:stream", task.id, agentType, chunk);
        iterResult = await generator.next();
      }

      const result = iterResult.value;
      await this.taskManager.completeAgentRun(run.id, result as Record<string, unknown>);
      return result;
    } catch (error) {
      await this.taskManager.failAgentRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  private createAgent(
    agentType: AgentType,
    model: any,
    options: { temperature?: number; maxOutputTokens?: number }
  ): Agent<any> {
    switch (agentType) {
      case "planner":
        return new PlannerAgent(model, options);
      case "coder":
        return new CoderAgent(model, options);
      case "reviewer":
        return new ReviewerAgent(model, options);
      case "frontend":
        return new FrontendAgent(model, options);
      case "backend":
        return new BackendAgent(model, options);
      case "debugger":
        return new DebuggerAgent(model, options);
      case "qa":
        return new QAAgent(model, options);
      case "docs":
        return new DocsAgent(model, options);
      case "explore":
        return new ExploreAgent(model, options);
      default:
        return new CoderAgent(model, options);
    }
  }

  private async buildAgentContext(task: Task, branch: string): Promise<AgentContext> {
    const framework = await this.projectScanner.detectFramework();
    const language = await this.projectScanner.detectLanguage();
    const relevantFiles = await this.contextResolver.resolve(
      `${task.title} ${task.description ?? ""}`,
      { maxFiles: 15 }
    );

    const tree = await this.fileManager.scanProject();
    const projectContext = this.buildProjectContextString(tree, framework?.name);
    const labels = await this.getTaskLabels(task.id);

    return {
      task,
      projectRoot: this.projectRoot,
      projectContext,
      relevantFiles: relevantFiles.map((f) => ({ path: f.path, content: f.content })),
      existingFiles: relevantFiles.map((f) => f.path),
      framework: framework?.name,
      language,
      labels,
      branch,
    };
  }

  private buildProjectContextString(
    tree: { name: string; path: string; type: string; children?: any[] },
    framework?: string
  ): string {
    let context = `Project: ${tree.name}\n`;
    if (framework) context += `Framework: ${framework}\n`;
    context += `\nFile Structure:\n`;
    context += this.formatTree(tree, 0);
    return context;
  }

  private formatTree(
    node: { name: string; type: string; children?: any[] },
    depth: number
  ): string {
    if (depth > 3) return "";
    const indent = "  ".repeat(depth);
    let result = `${indent}${node.name}${node.type === "directory" ? "/" : ""}\n`;
    if (node.children) {
      for (const child of node.children.slice(0, 30)) {
        result += this.formatTree(child, depth + 1);
      }
      if (node.children.length > 30) {
        result += `${indent}  ... and ${node.children.length - 30} more\n`;
      }
    }
    return result;
  }

  private async applyOperations(
    task: Task,
    result: CoderResult,
    branch: string
  ): Promise<void> {
    // Apply each file operation
    for (const op of result.operations) {
      await this.fileManager.applyOperation({
        type: op.type,
        filePath: op.filePath,
        content: op.content,
      });

      // Track in task files
      await this.taskManager.addTaskFile({
        taskId: task.id,
        filePath: op.filePath,
        status: op.type === "create" ? "created" : op.type === "delete" ? "deleted" : "modified",
        modifiedContent: op.content,
      });
    }

    // Auto-commit if enabled
    if (this.autoCommit) {
      const message = `agent(${task.agentType ?? "coder"}): ${task.title}`;
      const filePaths = result.operations.map((op) => op.filePath);
      await this.gitManager.add(filePaths);
      await this.gitManager.commit(message);
      this.emit("git:committed", task.id, branch, message);
    }
  }

  private async createBranch(taskId: string, branch: string): Promise<void> {
    try {
      await this.gitManager.createBranch(branch);
      await this.gitManager.checkout(branch);
      this.emit("git:branch_created", taskId, branch);
    } catch (error) {
      // Branch might already exist, try to checkout
      try {
        await this.gitManager.checkout(branch);
      } catch {
        throw error;
      }
    }
  }

  private async getReadyTasks(): Promise<Task[]> {
    return this.taskManager.getTasksByStatus("ready");
  }

  private async getTaskLabels(taskId: string): Promise<TaskLabel[]> {
    return this.taskManager.getTaskLabels(taskId);
  }

  private async moveToNeedsHuman(task: Task, reason: string): Promise<void> {
    await this.taskManager.updateTask(task.id, {
      status: "needs_human",
      metadata: { ...(task.metadata ?? {}), blockReason: reason },
    } as any);
    this.emit("task:needs_human", task.id, reason);
  }

  private async moveToFailed(task: Task, reason: string): Promise<void> {
    await this.taskManager.updateTask(task.id, {
      status: "failed",
      metadata: { ...(task.metadata ?? {}), failReason: reason },
    } as any);
    this.emit("task:failed", task.id, task.agentType ?? "coder", new Error(reason));
  }
}
