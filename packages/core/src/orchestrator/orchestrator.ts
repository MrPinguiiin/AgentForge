import EventEmitter from "eventemitter3";
import type { OrchestratorEvents } from "./events.js";
import { type PipelineStage, isValidTransition } from "./pipeline.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { FileManager } from "../file-manager/file-manager.js";
import { GitManager } from "../git-manager/git-manager.js";
import { ContextResolver } from "../context/resolver.js";
import { ProjectScanner } from "../context/scanner.js";
import { ProviderRegistry } from "../ai/provider.js";
import { PlannerAgent } from "../agents/planner.js";
import { CoderAgent } from "../agents/coder.js";
import { ReviewerAgent } from "../agents/reviewer.js";
import type { AgentContext, PlannerResult, CoderResult, ReviewerResult, StreamChunk } from "../agents/types.js";
import type { Task } from "../db/schema.js";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as dbSchema from "../db/schema.js";

export interface OrchestratorConfig {
  projectRoot: string;
  db: BunSQLiteDatabase<typeof dbSchema>;
  taskManager: TaskManager;
  providerRegistry: ProviderRegistry;
  autoCommit?: boolean;
  autoPush?: boolean;
}

export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  private _db: BunSQLiteDatabase<typeof dbSchema>;
  private taskManager: TaskManager;
  private fileManager: FileManager;
  private gitManager: GitManager;
  private contextResolver: ContextResolver;
  private projectScanner: ProjectScanner;
  private providerRegistry: ProviderRegistry;
  private projectRoot: string;
  private autoCommit: boolean;
  private autoPush: boolean;

  private currentStage: PipelineStage = "idle";
  private currentTaskId: string | null = null;

  constructor(config: OrchestratorConfig) {
    super();
    this._db = config.db;
    this.projectRoot = config.projectRoot;
    this.taskManager = config.taskManager;
    this.providerRegistry = config.providerRegistry;
    this.autoCommit = config.autoCommit ?? true;
    this.autoPush = config.autoPush ?? false;

    this.fileManager = new FileManager(config.projectRoot);
    this.gitManager = new GitManager(config.projectRoot);
    this.contextResolver = new ContextResolver(config.projectRoot);
    this.projectScanner = new ProjectScanner(config.projectRoot);
  }

  get stage(): PipelineStage {
    return this.currentStage;
  }

  get activeTaskId(): string | null {
    return this.currentTaskId;
  }

  // --- Public Accessors (used by server routes) ---

  get db(): BunSQLiteDatabase<typeof dbSchema> {
    return this._db;
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  getFileManager(): FileManager {
    return this.fileManager;
  }

  getGitManager(projectPath?: string): GitManager {
    if (projectPath && projectPath !== this.projectRoot) {
      return new GitManager(projectPath);
    }
    return this.gitManager;
  }

  getContextResolver(): ContextResolver {
    return this.contextResolver;
  }

  getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  getProjectScanner(): ProjectScanner {
    return this.projectScanner;
  }

  async getProject(projectId: string): Promise<any> {
    // Delegate to task manager's db to find project
    return (this.taskManager as any).db
      ? null // Will be implemented via server route directly
      : null;
  }

  // --- Pipeline Stage Transitions ---

  private transitionTo(stage: PipelineStage): void {
    if (!isValidTransition(this.currentStage, stage)) {
      throw new Error(
        `Invalid pipeline transition: ${this.currentStage} -> ${stage}`
      );
    }
    this.currentStage = stage;
    if (this.currentTaskId) {
      this.emit("pipeline:stage", this.currentTaskId, stage);
    }
  }

  // --- Agent Context Builder ---

  private async buildAgentContext(task: Task): Promise<AgentContext> {
    const framework = await this.projectScanner.detectFramework();
    const language = await this.projectScanner.detectLanguage();
    const relevantFiles = await this.contextResolver.resolve(
      `${task.title} ${task.description ?? ""}`,
      { maxFiles: 15 }
    );

    const tree = await this.fileManager.scanProject();
    const projectContext = this.buildProjectContextString(tree, framework?.name);

    return {
      task,
      projectRoot: this.projectRoot,
      projectContext,
      relevantFiles: relevantFiles.map((f) => ({ path: f.path, content: f.content })),
      existingFiles: relevantFiles.map((f) => f.path),
      framework: framework?.name,
      language,
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
    if (depth > 3) return ""; // Limit depth
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

  // --- Pipeline Operations ---

  async planTask(taskId: string): Promise<PlannerResult> {
    this.currentTaskId = taskId;
    this.transitionTo("planning");
    this.emit("agent:start", taskId, "planner");

    const task = await this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const agentConfig = this.providerRegistry.getAgentConfig("planner");
    const model = this.providerRegistry.getAgentModel("planner");
    const agent = new PlannerAgent(model, {
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxOutputTokens,
    });

    const context = await this.buildAgentContext(task);
    const run = await this.taskManager.createAgentRun(taskId, "planner", agentConfig.model);

    let result: PlannerResult;
    try {
      const generator = agent.execute(context);
      let iterResult = await generator.next();

      while (!iterResult.done) {
        const chunk = iterResult.value as StreamChunk;
        this.emit("agent:stream", taskId, "planner", chunk);
        iterResult = await generator.next();
      }

      result = iterResult.value;

      // Create subtasks from plan
      for (let i = 0; i < result.subtasks.length; i++) {
        const subtask = result.subtasks[i];
        const created = await this.taskManager.createTask({
          projectId: task.projectId,
          parentId: taskId,
          title: subtask.title,
          description: subtask.description,
          priority: subtask.priority,
          status: "todo",
        });

        // Add files to subtask
        for (const filePath of subtask.files) {
          await this.taskManager.addTaskFile({ taskId: created.id, filePath });
        }

        this.emit("task:created", created);
      }

      await this.taskManager.completeAgentRun(run.id, result as unknown as Record<string, unknown>);
      await this.taskManager.updateTask(taskId, { status: "todo" });

      this.emit("agent:complete", taskId, "planner");
      this.emit("plan:created", taskId, result);
    } catch (error) {
      await this.taskManager.failAgentRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      );
      this.transitionTo("failed");
      this.emit("agent:error", taskId, "planner", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    return result;
  }

  async codeTask(taskId: string): Promise<CoderResult> {
    this.currentTaskId = taskId;
    this.transitionTo("coding");
    this.emit("agent:start", taskId, "coder");

    const task = await this.taskManager.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const agentConfig = this.providerRegistry.getAgentConfig("coder");
    const model = this.providerRegistry.getAgentModel("coder");
    const agent = new CoderAgent(model, {
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxOutputTokens,
    });

    const context = await this.buildAgentContext(task);
    const run = await this.taskManager.createAgentRun(taskId, "coder", agentConfig.model);

    let result: CoderResult;
    try {
      const generator = agent.execute(context);
      let iterResult = await generator.next();

      while (!iterResult.done) {
        const chunk = iterResult.value as StreamChunk;
        this.emit("agent:stream", taskId, "coder", chunk);
        iterResult = await generator.next();
      }

      result = iterResult.value;

      await this.taskManager.completeAgentRun(run.id, result as unknown as Record<string, unknown>);
      await this.taskManager.updateTask(taskId, { status: "in_progress" });

      this.emit("agent:complete", taskId, "coder");
      this.emit("code:generated", taskId, result);
    } catch (error) {
      await this.taskManager.failAgentRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      );
      this.transitionTo("failed");
      this.emit("agent:error", taskId, "coder", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    // Apply file operations
    this.transitionTo("applying");
    const appliedFiles: string[] = [];

    for (const op of result.operations) {
      const applyResult = await this.fileManager.applyOperation({
        type: op.type,
        filePath: op.filePath,
        content: op.content,
      });

      if (applyResult.success) {
        appliedFiles.push(op.filePath);
        await this.taskManager.addTaskFile({
          taskId,
          filePath: op.filePath,
          status: op.type === "create" ? "created" : op.type === "delete" ? "deleted" : "modified",
          modifiedContent: op.content,
          originalContent: applyResult.backup,
        });
      }
    }

    this.emit("code:applied", taskId, appliedFiles);

    // Auto-commit if enabled
    if (this.autoCommit && appliedFiles.length > 0) {
      this.transitionTo("committing");
      try {
        const commitResult = await this.gitManager.autoCommit(
          "feat",
          `${task.title} (AI-generated)`
        );
        this.emit("git:committed", taskId, commitResult.hash, commitResult.message);

        if (this.autoPush) {
          this.transitionTo("pushing");
          const branch = await this.gitManager.getCurrentBranch();
          await this.gitManager.push("origin", branch);
          this.emit("git:pushed", taskId, branch);
        }
      } catch {
        // Git errors are non-fatal
      }
    }

    return result;
  }

  async reviewTask(taskId: string): Promise<ReviewerResult> {
    this.currentTaskId = taskId;
    this.transitionTo("reviewing");
    this.emit("agent:start", taskId, "reviewer");

    const task = await this.taskManager.getTaskWithSubtasks(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const agentConfig = this.providerRegistry.getAgentConfig("reviewer");
    const model = this.providerRegistry.getAgentModel("reviewer");
    const agent = new ReviewerAgent(model, {
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxOutputTokens,
    });

    const context = await this.buildAgentContext(task);
    context.taskFiles = task.files;

    const run = await this.taskManager.createAgentRun(taskId, "reviewer", agentConfig.model);

    let result: ReviewerResult;
    try {
      const generator = agent.execute(context);
      let iterResult = await generator.next();

      while (!iterResult.done) {
        const chunk = iterResult.value as StreamChunk;
        this.emit("agent:stream", taskId, "reviewer", chunk);
        iterResult = await generator.next();
      }

      result = iterResult.value;

      await this.taskManager.completeAgentRun(run.id, result as unknown as Record<string, unknown>);

      if (result.approved) {
        await this.taskManager.updateTask(taskId, { status: "done" });
      } else {
        await this.taskManager.updateTask(taskId, { status: "in_review" });
      }

      this.emit("agent:complete", taskId, "reviewer");
      this.emit("review:completed", taskId, result);
    } catch (error) {
      await this.taskManager.failAgentRun(
        run.id,
        error instanceof Error ? error.message : String(error)
      );
      this.transitionTo("failed");
      this.emit("agent:error", taskId, "reviewer", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    return result;
  }

  async runFullPipeline(taskId: string): Promise<{
    plan: PlannerResult;
    code: CoderResult;
    review: ReviewerResult;
  }> {
    this.currentTaskId = taskId;
    this.emit("pipeline:start", taskId);

    try {
      const plan = await this.planTask(taskId);

      // Code each subtask
      const task = await this.taskManager.getTaskWithSubtasks(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      let code: CoderResult = { explanation: "", operations: [] };

      if (task.subtasks.length > 0) {
        // Code the first subtask (simplified - in production would iterate)
        for (const subtask of task.subtasks) {
          this.currentStage = "idle"; // Reset for next transition
          const subtaskCode = await this.codeTask(subtask.id);
          code.explanation += subtaskCode.explanation + "\n";
          code.operations.push(...subtaskCode.operations);
        }
      } else {
        this.currentStage = "planning"; // After planning, transition to coding
        code = await this.codeTask(taskId);
      }

      // Review
      this.currentStage = "applying"; // Reset for review transition
      const review = await this.reviewTask(taskId);

      this.currentStage = "completed" as PipelineStage;
      this.emit("pipeline:complete", taskId);

      return { plan, code, review };
    } catch (error) {
      this.emit(
        "pipeline:error",
        taskId,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}
