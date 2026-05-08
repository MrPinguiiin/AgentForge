/**
 * TaskHive Worker
 *
 * Main worker that processes jobs from the queue.
 * Implements the full pipeline: Planning -> Execution -> Review -> QA
 * Per docs sections 16, 17, 18.
 */

import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.js";
import type { TaskStatus, PlanningResult, RunType, RunStatus } from "../db/schema.js";
import { JobQueue, type JobResult } from "./job-queue.js";
import { OpenCodeRunner, OpenCodeServer, parsePlanningJson } from "./opencode-runner.js";
import { BranchManager } from "./branch-manager.js";
import { ResultCollector } from "./result-collector.js";
import {
  buildPlanningPrompt,
  buildExecutionPrompt,
  buildReviewPrompt,
  buildQAPrompt,
  buildDependencyAnalysisPrompt,
} from "./prompt-templates.js";
import { ProjectScanner } from "./project-scanner.js";
import EventEmitter from "eventemitter3";
import { log } from "./logger.js";

export interface WorkerEvents {
  "planning:queued": (taskId: string) => void;
  "planning:started": (taskId: string, runId: string) => void;
  "planning:streaming": (taskId: string, chunk: string) => void;
  "planning:completed": (taskId: string, plan: PlanningResult) => void;
  "planning:failed": (taskId: string, error: string) => void;
  "execution:queued": (taskId: string) => void;
  "execution:started": (taskId: string, runId: string) => void;
  "execution:streaming": (taskId: string, chunk: string) => void;
  "execution:completed": (taskId: string) => void;
  "execution:failed": (taskId: string, error: string) => void;
  "review:started": (taskId: string) => void;
  "review:completed": (taskId: string, verdict: string) => void;
  "qa:started": (taskId: string) => void;
  "qa:completed": (taskId: string, result: string) => void;
  "task:moved": (taskId: string, from: string, to: string) => void;
}

export interface WorkerConfig {
  /** Planning timeout in ms (default: 5 min) */
  planningTimeout?: number;
  /** Execution timeout in ms (default: 10 min) */
  executionTimeout?: number;
  /** Review timeout in ms (default: 5 min) */
  reviewTimeout?: number;
  /** QA timeout in ms (default: 5 min) */
  qaTimeout?: number;
  /** Queue poll interval in ms (default: 2s) */
  pollInterval?: number;
  /** Max concurrent jobs (default: 1) */
  concurrency?: number;
  /** OpenCode server port (default: 4200) */
  openCodePort?: number;
  /** Path to opencode binary */
  openCodeBinary?: string;
  /** Working directory for OpenCode server */
  openCodeCwd?: string;
  /** Model to pass to opencode run */
  openCodeModel?: string;
}

const DEFAULT_CONFIG: Required<WorkerConfig> = {
  planningTimeout: 15 * 60 * 1000,
  executionTimeout: 10 * 60 * 1000,
  reviewTimeout: 5 * 60 * 1000,
  qaTimeout: 5 * 60 * 1000,
  pollInterval: 2000,
  concurrency: 1,
  openCodePort: 4200,
  openCodeBinary: "opencode",
  openCodeCwd: process.cwd(),
  openCodeModel: "9router/cx/gpt-5.5",
};

export class TaskHiveWorker extends EventEmitter<WorkerEvents> {
  private db: BunSQLiteDatabase<typeof schema>;
  private queue: JobQueue;
  private collector: ResultCollector;
  private config: Required<WorkerConfig>;
  private openCodeServer: OpenCodeServer;
  private activeRunners: Map<string, OpenCodeRunner> = new Map();

  constructor(db: BunSQLiteDatabase<typeof schema>, config?: WorkerConfig) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queue = new JobQueue(db, { concurrency: this.config.concurrency });
    this.collector = new ResultCollector(db);

    // Create OpenCode server pool manager (per-project servers)
    this.openCodeServer = new OpenCodeServer({
      basePort: this.config.openCodePort,
      binaryPath: this.config.openCodeBinary,
      model: this.config.openCodeModel,
    });

    // Register job processors
    this.queue.registerProcessor("planning", (job) => this.processPlanningJob(job));
    this.queue.registerProcessor("execution", (job) => this.processExecutionJob(job));
    this.queue.registerProcessor("review", (job) => this.processReviewJob(job));
    this.queue.registerProcessor("qa", (job) => this.processQAJob(job));

    // Forward queue events
    this.queue.on("job:failed", (job, error) => {
      const type = job.type as string;
      if (type === "planning") this.emit("planning:failed", job.taskId, error);
      if (type === "execution") this.emit("execution:failed", job.taskId, error);
    });
  }

  // ===== Public API =====

  /**
   * Start the worker.
   * Starts the OpenCode server first, then begins polling the job queue.
   */
  async start(): Promise<void> {
    await this.openCodeServer.start();

    this.queue.start(this.config.pollInterval);
    log.info("WORKER", "TaskHiveWorker started");
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.queue.stop();
    // Kill all active runners
    for (const [_taskId, runner] of this.activeRunners) {
      runner.kill();
    }
    this.activeRunners.clear();
    // Stop OpenCode server
    this.openCodeServer.stop();
    log.info("WORKER", "TaskHiveWorker stopped");
  }

  /**
   * Queue a planning job for a task.
   * Per docs Flow 2: Run Planning
   */
  async queuePlanning(taskId: string, settings?: { reviewMode?: "auto" | "human"; approvalMode?: "auto" | "manual"; batchId?: string }): Promise<schema.Job> {
    // Validate task is in backlog
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "backlog") {
      throw new Error(`Task must be in backlog to run planning. Current status: ${task.status}`);
    }

    // Store review/approval settings and batchId on the task
    const taskUpdates: Record<string, unknown> = {};
    if (settings?.reviewMode) taskUpdates.reviewMode = settings.reviewMode;
    if (settings?.approvalMode) taskUpdates.approvalMode = settings.approvalMode;
    if (settings?.batchId) taskUpdates.batchId = settings.batchId;
    if (Object.keys(taskUpdates).length > 0) {
      await this.db.update(schema.tasks).set(taskUpdates).where(eq(schema.tasks.id, taskId));
    }

    // Get project
    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    // Get labels
    const labels = await this.db.select().from(schema.taskLabels).where(eq(schema.taskLabels.taskId, taskId));
    const labelStrings = labels.map(l => `${l.category}:${l.value}`);

    // Create task run record
    const run = await this.createRun(taskId, "planning", "plan");

    // Update task status: batch tasks go to planning_queued (stay in backlog visually),
    // single tasks go directly to planning
    const planningStatus = settings?.batchId ? "planning_queued" : "planning";
    await this.updateTaskStatus(taskId, planningStatus as schema.TaskStatus);

    // Enqueue job
    const job = await this.queue.addJob("planning", taskId, {
      projectId: project.id,
      projectPath: project.rootPath,
      projectName: project.name,
      runId: run.id,
      labels: labelStrings,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
    });

    log.jobQueued("planning", taskId, job.id);
    log.info("PLANNING", `Task "${task.title}" | Labels: [${labelStrings.join(", ") || "none"}] | review=${settings?.reviewMode ?? "auto"} approval=${settings?.approvalMode ?? "auto"}`);
    this.emit("planning:queued", taskId);
    return job;
  }

  /**
   * Queue batch planning for multiple tasks.
   * All tasks share the same review/approval settings.
   * Tasks stay in backlog visually (planning_queued status) until ALL planning completes.
   */
  async queueBatchPlanning(
    taskIds: string[],
    settings: { reviewMode: "auto" | "human"; approvalMode: "auto" | "manual" },
  ): Promise<{ queued: string[]; skipped: { taskId: string; reason: string }[]; batchId: string }> {
    const batchId = nanoid();
    const queued: string[] = [];
    const skipped: { taskId: string; reason: string }[] = [];

    for (const taskId of taskIds) {
      try {
        await this.queuePlanning(taskId, { ...settings, batchId });
        queued.push(taskId);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        skipped.push({ taskId, reason });
        log.warn("BATCH", `Skipped task ${taskId}: ${reason}`);
      }
    }

    log.info("BATCH", `Batch ${batchId}: ${queued.length} queued, ${skipped.length} skipped`);
    return { queued, skipped, batchId };
  }

  /**
   * Approve a plan and queue execution.
   * Accepts tasks in 'ready' (backward compat) or 'needs_human' with reason 'plan_review'.
   */
  async approvePlan(taskId: string): Promise<schema.Job> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const validStatuses = ["ready", "needs_human"];
    if (!validStatuses.includes(task.status)) {
      throw new Error(`Task must be in 'ready' or 'needs_human' to approve plan. Current status: ${task.status}`);
    }
    // If needs_human, verify it's for plan review
    if (task.status === "needs_human" && task.needsHumanReason !== "plan_review") {
      throw new Error(`Task is in needs_human for '${task.needsHumanReason}', not 'plan_review'. Use approveCodeReview() instead.`);
    }

    // Get the latest plan
    const [plan] = await this.db
      .select()
      .from(schema.taskPlans)
      .where(eq(schema.taskPlans.taskId, taskId))
      .orderBy(schema.taskPlans.createdAt)
      .limit(1);

    if (!plan) throw new Error(`No plan found for task: ${taskId}`);

    // Mark plan as approved
    await this.db
      .update(schema.taskPlans)
      .set({ approved: true, approvedAt: new Date() })
      .where(eq(schema.taskPlans.id, plan.id));

    // Get project
    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    // Determine agent from plan
    const planData = plan.planJson as PlanningResult;
    const agentName = plan.recommendedAgent || planData.recommended_agent || "coder";

    // Create execution run
    const run = await this.createRun(taskId, "execution", agentName);

    // Update task
    await this.updateTaskStatus(taskId, "in_progress");
    await this.db.update(schema.tasks).set({
      agentType: agentName as schema.AgentType,
      startedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    // Enqueue execution job
    const job = await this.queue.addJob("execution", taskId, {
      projectId: project.id,
      projectPath: project.rootPath,
      projectName: project.name,
      defaultBranch: project.defaultBranch || "main",
      runId: run.id,
      planId: plan.id,
      agentName,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      plan: planData,
    });

    this.emit("execution:queued", taskId);
    return job;
  }

  /**
   * Queue a review job
   */
  async queueReview(taskId: string): Promise<schema.Job> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const run = await this.createRun(taskId, "review", "reviewer");

    const job = await this.queue.addJob("review", taskId, {
      projectId: project.id,
      projectPath: project.rootPath,
      defaultBranch: project.defaultBranch || "main",
      runId: run.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      branch: task.branch,
    });

    this.emit("review:started", taskId);
    return job;
  }

  /**
   * Queue a QA job
   */
  async queueQA(taskId: string): Promise<schema.Job> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const run = await this.createRun(taskId, "qa", "qa");

    await this.updateTaskStatus(taskId, "qa");

    const job = await this.queue.addJob("qa", taskId, {
      projectId: project.id,
      projectPath: project.rootPath,
      runId: run.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      branch: task.branch,
    });

    this.emit("qa:started", taskId);
    return job;
  }

  /**
   * Retry planning for a task
   */
  async retryPlanning(taskId: string): Promise<schema.Job> {
    // Reset task to backlog
    await this.updateTaskStatus(taskId, "backlog");
    await this.db.update(schema.tasks).set({
      retryCount: schema.tasks.retryCount,
    }).where(eq(schema.tasks.id, taskId));

    // Increment retry count
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (task) {
      await this.db.update(schema.tasks).set({
        retryCount: task.retryCount + 1,
      }).where(eq(schema.tasks.id, taskId));
    }

    return this.queuePlanning(taskId);
  }

  /**
   * Cancel a task and all its jobs
   */
  async cancelTask(taskId: string): Promise<void> {
    // Cancel all pending/active jobs
    await this.queue.cancelTaskJobs(taskId);

    // Kill active runner if any
    const runner = this.activeRunners.get(taskId);
    if (runner) {
      runner.kill();
      this.activeRunners.delete(taskId);
    }

    // Update task status
    await this.updateTaskStatus(taskId, "cancelled");
  }

  /**
   * Accept review - move task to QA
   */
  async acceptReviewAndQA(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, "qa");
    await this.queueQA(taskId);
  }

  /**
   * Decline review - move task back to needs_human
   */
  async declineReview(taskId: string): Promise<void> {
    await this.db.update(schema.tasks).set({ needsHumanReason: "code_review" }).where(eq(schema.tasks.id, taskId));
    await this.updateTaskStatus(taskId, "needs_human");
  }

  /**
   * Approve code review from needs_human (code_review) → move to QA
   */
  async approveCodeReview(taskId: string): Promise<void> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "needs_human" || task.needsHumanReason !== "code_review") {
      throw new Error(`Task must be in needs_human with reason 'code_review'. Current: ${task.status} / ${task.needsHumanReason}`);
    }
    await this.db.update(schema.tasks).set({ needsHumanReason: null }).where(eq(schema.tasks.id, taskId));
    await this.updateTaskStatus(taskId, "qa");
    await this.queueQA(taskId);
  }

  /**
   * Reject code review from needs_human (code_review) → re-execute
   */
  async rejectCodeReview(taskId: string, feedback?: string): Promise<schema.Job> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "needs_human" || task.needsHumanReason !== "code_review") {
      throw new Error(`Task must be in needs_human with reason 'code_review'. Current: ${task.status} / ${task.needsHumanReason}`);
    }

    // Store feedback in metadata if provided
    if (feedback) {
      const meta = (task.metadata as Record<string, unknown>) ?? {};
      meta.reviewFeedback = feedback;
      await this.db.update(schema.tasks).set({ metadata: meta }).where(eq(schema.tasks.id, taskId));
    }

    await this.db.update(schema.tasks).set({ needsHumanReason: null }).where(eq(schema.tasks.id, taskId));

    // Re-queue execution
    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const [plan] = await this.db
      .select()
      .from(schema.taskPlans)
      .where(eq(schema.taskPlans.taskId, taskId))
      .orderBy(schema.taskPlans.createdAt)
      .limit(1);

    const planData = plan?.planJson as PlanningResult | null;
    const agentName = plan?.recommendedAgent || planData?.recommended_agent || "coder";
    const run = await this.createRun(taskId, "execution", agentName);

    await this.updateTaskStatus(taskId, "in_progress");

    const job = await this.queue.addJob("execution", taskId, {
      projectId: project.id,
      projectPath: project.rootPath,
      projectName: project.name,
      defaultBranch: project.defaultBranch || "main",
      runId: run.id,
      planId: plan?.id,
      agentName,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      plan: planData,
      feedback,
    });

    this.emit("execution:queued", taskId);
    return job;
  }

  /**
   * Approve from needs_human — dispatches based on reason
   */
  async approveHuman(taskId: string): Promise<void> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "needs_human") {
      throw new Error(`Task must be in needs_human. Current: ${task.status}`);
    }

    if (task.needsHumanReason === "plan_review" || task.needsHumanReason === "high_risk") {
      await this.db.update(schema.tasks).set({ needsHumanReason: null }).where(eq(schema.tasks.id, taskId));
      // Move to ready so approvePlan can pick it up
      await this.updateTaskStatus(taskId, "ready");
      await this.approvePlan(taskId);
    } else if (task.needsHumanReason === "code_review") {
      await this.approveCodeReview(taskId);
    } else {
      throw new Error(`Unknown needs_human reason: ${task.needsHumanReason}`);
    }
  }

  /**
   * Reject from needs_human — dispatches based on reason
   */
  async rejectHuman(taskId: string, feedback?: string): Promise<void> {
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "needs_human") {
      throw new Error(`Task must be in needs_human. Current: ${task.status}`);
    }

    if (task.needsHumanReason === "plan_review" || task.needsHumanReason === "high_risk") {
      // Reject plan → back to backlog
      await this.db.update(schema.tasks).set({ needsHumanReason: null }).where(eq(schema.tasks.id, taskId));
      await this.updateTaskStatus(taskId, "backlog");
    } else if (task.needsHumanReason === "code_review") {
      await this.rejectCodeReview(taskId, feedback);
    } else {
      throw new Error(`Unknown needs_human reason: ${task.needsHumanReason}`);
    }
  }

  /**
   * Get the latest plan for a task
   */
  async getTaskPlan(taskId: string): Promise<schema.TaskPlan | null> {
    const [plan] = await this.db
      .select()
      .from(schema.taskPlans)
      .where(eq(schema.taskPlans.taskId, taskId))
      .orderBy(schema.taskPlans.createdAt)
      .limit(1);

    return plan ?? null;
  }

  /**
   * Get all runs for a task
   */
  async getTaskRuns(taskId: string): Promise<schema.TaskRun[]> {
    return this.db
      .select()
      .from(schema.taskRuns)
      .where(eq(schema.taskRuns.taskId, taskId))
      .orderBy(schema.taskRuns.createdAt);
  }

  /**
   * Get all artifacts for a task
   */
  async getTaskArtifacts(taskId: string): Promise<schema.TaskArtifact[]> {
    return this.collector.getTaskArtifacts(taskId);
  }

  /**
   * Get queue stats
   */
  async getQueueStats() {
    return this.queue.getStats();
  }

  /**
   * Get pipeline defaults from config table
   */
  async getPipelineDefaults(): Promise<{ reviewMode: string; approvalMode: string }> {
    try {
      const [row] = await this.db
        .select()
        .from(schema.config)
        .where(eq(schema.config.key, "pipeline_defaults"));

      if (row?.value) {
        const val = row.value as { reviewMode?: string; approvalMode?: string };
        return {
          reviewMode: val.reviewMode ?? "auto",
          approvalMode: val.approvalMode ?? "auto",
        };
      }
    } catch {
      // ignore
    }
    return { reviewMode: "auto", approvalMode: "auto" };
  }

  /**
   * Save pipeline defaults to config table
   */
  async savePipelineDefaults(defaults: { reviewMode?: string; approvalMode?: string }): Promise<void> {
    const existing = await this.getPipelineDefaults();
    const merged = { ...existing, ...defaults };

    await this.db
      .insert(schema.config)
      .values({
        key: "pipeline_defaults",
        value: merged,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.config.key,
        set: { value: merged, updatedAt: new Date() },
      });
  }

  // ===== Batch Orchestration =====

  /**
   * Finalize a batch after all planning is complete.
   * Runs AI dependency analysis, sorts tasks, moves to planning column.
   */
  async finalizeBatch(batchId: string): Promise<void> {
    log.info("BATCH", `Finalizing batch ${batchId}...`);

    // Get all planned tasks in this batch
    const batchTasks = await this.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.batchId, batchId), eq(schema.tasks.status, "planned")));

    if (batchTasks.length === 0) {
      log.warn("BATCH", `No planned tasks in batch ${batchId}`);
      return;
    }

    // Get plans for each task
    const tasksWithPlans: Array<{
      id: string;
      title: string;
      description: string | null;
      plan: PlanningResult;
    }> = [];

    for (const task of batchTasks) {
      const plan = await this.getTaskPlan(task.id);
      if (plan?.planJson) {
        tasksWithPlans.push({
          id: task.id,
          title: task.title,
          description: task.description,
          plan: plan.planJson as PlanningResult,
        });
      }
    }

    // Run AI dependency analysis (only if more than 1 task)
    let executionOrder: string[] = tasksWithPlans.map((t) => t.id);

    if (tasksWithPlans.length > 1) {
      try {
        executionOrder = await this.analyzeDependencies(tasksWithPlans, batchTasks[0].projectId);
        log.info("BATCH", `AI dependency order: ${executionOrder.map((id) => id.slice(0, 8)).join(" → ")}`);
      } catch (err) {
        log.warn("BATCH", `Dependency analysis failed, using default order: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Update execution order on each task and move to planning column
    for (let i = 0; i < executionOrder.length; i++) {
      const taskId = executionOrder[i];
      await this.db.update(schema.tasks).set({
        executionOrder: i + 1,
        sortOrder: i,
      }).where(eq(schema.tasks.id, taskId));
      await this.updateTaskStatus(taskId, "planning");
    }

    // Also move any tasks that weren't in the execution order (edge case)
    for (const task of batchTasks) {
      if (!executionOrder.includes(task.id)) {
        await this.db.update(schema.tasks).set({ executionOrder: executionOrder.length + 1 }).where(eq(schema.tasks.id, task.id));
        await this.updateTaskStatus(task.id, "planning");
      }
    }

    log.info("BATCH", `Batch ${batchId} finalized: ${executionOrder.length} tasks ready in planning column`);

    // If auto-approve mode, start sequential execution automatically
    const [sampleTask] = batchTasks;
    if (sampleTask?.approvalMode === "auto") {
      log.info("BATCH", `Auto-approve mode — starting sequential execution for batch ${batchId}`);
      await this.executeNextInBatch(batchId);
    }
  }

  /**
   * Analyze dependencies between tasks using AI.
   * Returns task IDs in optimal execution order.
   */
  private async analyzeDependencies(
    tasks: Array<{ id: string; title: string; description: string | null; plan: PlanningResult }>,
    projectId: string,
  ): Promise<string[]> {
    // Get project for context
    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    if (!project) throw new Error(`Project not found: ${projectId}`);

    // Scan project for context
    const projectContext = await ProjectScanner.scan(project.rootPath);

    // Build dependency analysis prompt
    const prompt = buildDependencyAnalysisPrompt(tasks, project.rootPath, projectContext.summary);

    // Run AI analysis
    const runner = new OpenCodeRunner(this.openCodeServer);
    const model = await this.resolveModelForAgent("planner");
    const result = await runner.run({
      cwd: project.rootPath,
      agent: "plan",
      prompt,
      model,
      timeout: 60000, // 1 minute should be enough for analysis
    });

    if (!result.stdout || result.stdout.trim().length === 0) {
      throw new Error("Dependency analysis returned empty response");
    }

    // Parse result
    const analysisResult = parsePlanningJson(result.stdout) as Record<string, unknown>;
    const executionOrder = analysisResult.execution_order as string[];

    if (!Array.isArray(executionOrder) || executionOrder.length === 0) {
      throw new Error("Invalid execution_order in dependency analysis result");
    }

    // Validate all task IDs are present
    const taskIds = new Set(tasks.map((t) => t.id));
    const validOrder = executionOrder.filter((id) => taskIds.has(id));

    // Add any missing tasks at the end
    for (const task of tasks) {
      if (!validOrder.includes(task.id)) {
        validOrder.push(task.id);
      }
    }

    return validOrder;
  }

  /**
   * Execute the next task in a batch sequentially.
   * Finds the next task in planning status with the lowest executionOrder.
   */
  async executeNextInBatch(batchId: string): Promise<void> {
    // Find next task to execute (planning status, lowest executionOrder)
    const [nextTask] = await this.db
      .select()
      .from(schema.tasks)
      .where(and(
        eq(schema.tasks.batchId, batchId),
        eq(schema.tasks.status, "planning"),
      ))
      .orderBy(schema.tasks.executionOrder)
      .limit(1);

    if (!nextTask) {
      log.info("BATCH", `Batch ${batchId}: no more tasks to execute — batch complete`);
      return;
    }

    log.info("BATCH", `Batch ${batchId}: executing next task "${nextTask.title}" (order=${nextTask.executionOrder})`);

    // Check risk rules — only block if plan explicitly says needs_human=true
    // (user chose auto mode, so we respect that for label-based risk)
    const plan = await this.getTaskPlan(nextTask.id);
    const planData = plan?.planJson as PlanningResult | null;

    if (planData?.needs_human) {
      log.info("BATCH", `Task ${nextTask.id} — AI flagged needs_human=true, stopping for human review`);
      await this.db.update(schema.tasks).set({ needsHumanReason: "plan_review" }).where(eq(schema.tasks.id, nextTask.id));
      await this.updateTaskStatus(nextTask.id, "needs_human");
      return; // Stop batch execution — human must intervene
    }

    // Auto-approve and execute
    if (plan) {
      await this.db.update(schema.taskPlans).set({ approved: true, approvedAt: new Date() }).where(eq(schema.taskPlans.id, plan.id));
    }
    await this.updateTaskStatus(nextTask.id, "ready");

    try {
      await this.approvePlan(nextTask.id);
    } catch (err) {
      log.error("BATCH", `Failed to approve task ${nextTask.id}: ${err instanceof Error ? err.message : String(err)}`);
      await this.updateTaskStatus(nextTask.id, "failed");
      // Continue with next task in batch
      await this.executeNextInBatch(batchId);
    }
  }

  /**
   * Start sequential execution of a batch from the planning column.
   * Called by user clicking "Execute All" or automatically in auto-approve mode.
   */
  async executeBatch(batchId: string): Promise<void> {
    log.info("BATCH", `Starting batch execution for ${batchId}`);
    await this.executeNextInBatch(batchId);
  }

  /**
   * Get batch status summary.
   */
  async getBatchStatus(batchId: string): Promise<{
    batchId: string;
    total: number;
    planning_queued: number;
    planned: number;
    planning: number;
    in_progress: number;
    done: number;
    failed: number;
    other: number;
  }> {
    const tasks = await this.db
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(eq(schema.tasks.batchId, batchId));

    const counts = {
      batchId,
      total: tasks.length,
      planning_queued: 0,
      planned: 0,
      planning: 0,
      in_progress: 0,
      done: 0,
      failed: 0,
      other: 0,
    };

    for (const t of tasks) {
      const s = t.status as string;
      if (s === "planning_queued") counts.planning_queued++;
      else if (s === "planned") counts.planned++;
      else if (s === "planning") counts.planning++;
      else if (s === "in_progress") counts.in_progress++;
      else if (s === "done") counts.done++;
      else if (s === "failed") counts.failed++;
      else counts.other++;
    }

    return counts;
  }

  /**
   * Reorder tasks within a batch.
   */
  async reorderBatch(batchId: string, taskIds: string[]): Promise<void> {
    for (let i = 0; i < taskIds.length; i++) {
      await this.db.update(schema.tasks).set({
        executionOrder: i + 1,
        sortOrder: i,
      }).where(and(
        eq(schema.tasks.id, taskIds[i]),
        eq(schema.tasks.batchId, batchId),
      ));
    }
    log.info("BATCH", `Reordered batch ${batchId}: ${taskIds.length} tasks`);
  }

  // ===== Job Processors =====

  /**
   * Process a planning job.
   * Per docs section 16: Planning Worker Pseudocode
   */
  private async processPlanningJob(job: schema.Job): Promise<JobResult> {
    const payload = job.payload as Record<string, unknown>;
    const taskId = job.taskId;
    const runId = payload.runId as string;
    const projectPath = payload.projectPath as string;
    const projectName = payload.projectName as string;
    const labels = (payload.labels as string[]) || [];

    // Update run status
    await this.updateRunStatus(runId, "running");
    this.emit("planning:started", taskId, runId);

    log.planningStart(taskId, projectPath);

    // Scan project for context
    log.info("PLANNING", "Scanning project for context...");
    const projectContext = await ProjectScanner.scan(projectPath);
    log.info("PLANNING", `Project scan: ${projectContext.fileCount} files, framework=${projectContext.framework}`);

    // Build sibling tasks context
    const siblingContext = await this.buildSiblingTasksContext(taskId, payload.projectId as string);
    if (siblingContext) {
      log.info("PLANNING", `Sibling context: ${siblingContext.split("\n").length} lines`);
    }

    // Build planning prompt with context
    const prompt = buildPlanningPrompt(
      {
        title: payload.title as string,
        description: payload.description as string | null,
        acceptanceCriteria: payload.acceptanceCriteria as string | null,
      },
      { name: projectName, rootPath: projectPath },
      labels,
      projectContext.summary,
      siblingContext,
    );

    log.planningPromptBuilt(taskId, prompt.length);

    // Run OpenCode planning agent
    const runner = new OpenCodeRunner(this.openCodeServer);
    this.activeRunners.set(taskId, runner);
    runner.on("stdout", (chunk) => this.emit("planning:streaming", taskId, chunk));
    log.planningOpenCodeSpawned(taskId, "plan");

    try {
      const planModel = await this.resolveModelForAgent("planner");
      const result = await runner.run({
        cwd: projectPath,
        agent: "plan",
        prompt,
        timeout: this.config.planningTimeout,
        model: planModel,
      });

      this.activeRunners.delete(taskId);
      log.planningOpenCodeOutput(taskId, result.stdout.length, result.stderr.length, result.exitCode, result.durationMs);

      // Update run with results
      await this.db.update(schema.taskRuns).set({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        finishedAt: new Date(),
        status: result.exitCode === 0 ? "completed" : "failed",
        command: `opencode run --agent plan "<planning prompt>"`,
      }).where(eq(schema.taskRuns.id, runId));

      if (result.exitCode !== 0 || result.timedOut) {
        const errorMsg = result.timedOut
          ? "Planning timed out"
          : `OpenCode exited with code ${result.exitCode}: ${result.stderr}`;
        log.jobFailed("planning", taskId, errorMsg);
        await this.updateRunStatus(runId, "failed", errorMsg);
        await this.updateTaskStatus(taskId, "failed");
        this.emit("planning:failed", taskId, errorMsg);
        return { success: false, error: errorMsg };
      }

      // Parse planning JSON from AI output
      let planData: PlanningResult;
      try {
        planData = parsePlanningJson(result.stdout) as unknown as PlanningResult;
      } catch (parseErr) {
        const errorMsg = `Failed to parse planning output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
        log.planningJsonFailed(taskId, errorMsg);
        if (result.stdout.length > 0) {
          log.info("PLANNING", `Raw stdout (first 500 chars): ${result.stdout.slice(0, 500)}`);
        }
        await this.updateRunStatus(runId, "failed", errorMsg);
        await this.updateTaskStatus(taskId, "failed");
        this.emit("planning:failed", taskId, errorMsg);
        return { success: false, error: errorMsg };
      }

      // Store plan
      await this.db.insert(schema.taskPlans).values({
        id: nanoid(),
        taskId,
        runId,
        summary: planData.summary,
        planJson: planData,
        recommendedAgent: planData.recommended_agent,
        riskLevel: planData.risk_level,
        needsHuman: planData.needs_human,
        createdAt: new Date(),
      });

      log.planningJsonParsed(taskId, planData.summary || "(no summary)", planData.risk_level || "unknown", planData.recommended_agent || "build");
      log.info("PLANNING", `Steps: ${planData.implementation_steps?.length ?? 0} | Files: ${planData.likely_files_to_change?.length ?? 0} | Tests: ${planData.test_plan?.length ?? 0}`);

      // Store planning JSON as artifact
      await this.collector.storePlanningResult(taskId, runId, JSON.stringify(planData, null, 2));

      // Read the task's approval/review settings
      const [freshTask] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
      const approvalMode = freshTask?.approvalMode ?? "auto";
      const taskBatchId = freshTask?.batchId;

      // Store recommended agent
      await this.db.update(schema.tasks).set({
        agentType: planData.recommended_agent as schema.AgentType,
      }).where(eq(schema.tasks.id, taskId));

      // ===== BATCH TASK: move to "planned", wait for all batch tasks to complete =====
      if (taskBatchId) {
        log.info("PLANNING", `Batch task — moving to 'planned', checking batch ${taskBatchId} completion`);
        await this.updateTaskStatus(taskId, "planned");
        this.emit("task:moved", taskId, "planning_queued", "planned");

        // Check if all tasks in this batch are now planned (or failed)
        const batchTasks = await this.db
          .select({ id: schema.tasks.id, status: schema.tasks.status })
          .from(schema.tasks)
          .where(eq(schema.tasks.batchId, taskBatchId));

        const allDone = batchTasks.every(
          (t) => t.status === "planned" || t.status === "failed" || t.status === "cancelled",
        );
        const plannedCount = batchTasks.filter((t) => t.status === "planned").length;

        log.info("PLANNING", `Batch ${taskBatchId}: ${plannedCount}/${batchTasks.length} planned, allDone=${allDone}`);

        if (allDone && plannedCount > 0) {
          // All planning complete → finalize batch (dependency analysis + move to planning column)
          await this.finalizeBatch(taskBatchId);
        }

        this.emit("planning:completed", taskId, planData);
        return { success: true, data: planData };
      }

      // ===== SINGLE TASK (no batch): existing behavior =====
      // Risk check: only block for needs_human=true from AI.
      // Label-based risk (risk:high) is informational when user chose auto mode.
      const aiNeedsHuman = planData.needs_human === true;

      if (aiNeedsHuman) {
        log.planningNeedsHuman(taskId, "Plan flagged needs_human=true");
        await this.db.update(schema.tasks).set({ needsHumanReason: "plan_review" }).where(eq(schema.tasks.id, taskId));
        await this.updateTaskStatus(taskId, "needs_human");
        this.emit("task:moved", taskId, "planning", "needs_human");
      } else if (approvalMode === "manual") {
        log.info("PLANNING", `Manual approval mode — moving to needs_human (plan_review)`);
        await this.db.update(schema.tasks).set({ needsHumanReason: "plan_review" }).where(eq(schema.tasks.id, taskId));
        await this.updateTaskStatus(taskId, "needs_human");
        this.emit("task:moved", taskId, "planning", "needs_human");
      } else {
        log.info("PLANNING", `Auto approval mode — auto-approving plan and queueing execution`);
        log.planningComplete(taskId, "in_progress");
        const [plan] = await this.db
          .select()
          .from(schema.taskPlans)
          .where(eq(schema.taskPlans.taskId, taskId))
          .orderBy(schema.taskPlans.createdAt)
          .limit(1);
        if (plan) {
          await this.db.update(schema.taskPlans).set({ approved: true, approvedAt: new Date() }).where(eq(schema.taskPlans.id, plan.id));
        }
        await this.updateTaskStatus(taskId, "ready");
        try {
          await this.approvePlan(taskId);
        } catch (approveErr) {
          log.error("PLANNING", `Auto-approve failed: ${approveErr instanceof Error ? approveErr.message : String(approveErr)}`);
          await this.updateTaskStatus(taskId, "failed");
        }
      }

      this.emit("planning:completed", taskId, planData);
      return { success: true, data: planData };

    } catch (err) {
      this.activeRunners.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("PLANNING", `Unexpected error: ${errorMsg}`);
      await this.updateRunStatus(runId, "failed", errorMsg);
      await this.updateTaskStatus(taskId, "failed");
      this.emit("planning:failed", taskId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Process an execution job.
   * Per docs section 16: Execution Worker
   */
  private async processExecutionJob(job: schema.Job): Promise<JobResult> {
    const payload = job.payload as Record<string, unknown>;
    const taskId = job.taskId;
    const runId = payload.runId as string;
    const projectPath = payload.projectPath as string;
    const defaultBranch = (payload.defaultBranch as string) || "main";
    const agentName = (payload.agentName as string) || "coder";
    const planData = payload.plan as PlanningResult;

    await this.updateRunStatus(runId, "running");
    this.emit("execution:started", taskId, runId);

    log.executionStart(taskId, agentName, `taskhive/${taskId.slice(0,8)}-...`);

    try {
      // 1. Create isolated branch for git projects.
      // BranchManager handles three cases:
      // - non-git folder: returns non-git-worktree and execution continues directly
      // - git repo without origin: creates local taskhive branch without fetch/pull
      // - git repo with origin: fetches/pulls before creating taskhive branch
      const branchInfo = await BranchManager.createBranch(
        projectPath,
        taskId,
        payload.title as string,
        defaultBranch,
      );

      if (branchInfo.isGitRepo) {
        log.executionBranchCreated(taskId, branchInfo.name, branchInfo.created);
        await this.db.update(schema.tasks).set({
          branch: branchInfo.name,
        }).where(eq(schema.tasks.id, taskId));
      } else {
        log.warn("EXECUTION", `Project is not a git repository; executing directly in ${projectPath}`);
      }

      // 2. Scan project for context (re-scan to capture any changes from other tasks)
      log.info("EXECUTION", "Scanning project for context...");
      const execProjectContext = await ProjectScanner.scan(projectPath);
      log.info("EXECUTION", `Project scan: ${execProjectContext.fileCount} files, framework=${execProjectContext.framework}`);

      // Build sibling tasks context
      const execSiblingContext = await this.buildSiblingTasksContext(taskId, payload.projectId as string);
      if (execSiblingContext) {
        log.info("EXECUTION", `Sibling context: ${execSiblingContext.split("\n").length} lines`);
      }

      // Build execution prompt with context
      const prompt = buildExecutionPrompt(
        {
          title: payload.title as string,
          description: payload.description as string | null,
          acceptanceCriteria: payload.acceptanceCriteria as string | null,
        },
        planData,
        branchInfo.name,
        agentName,
        projectPath,
        execProjectContext.summary,
        execSiblingContext,
      );

      // 3. Run OpenCode agent
      const runner = new OpenCodeRunner(this.openCodeServer);
      this.activeRunners.set(taskId, runner);

      runner.on("stdout", (chunk) => this.emit("execution:streaming", taskId, chunk));

      // Map agent name to OpenCode agent
      const openCodeAgent = this.mapAgentName(agentName);

      log.executionOpenCodeSpawned(taskId, openCodeAgent);

      const execModel = await this.resolveModelForAgent(agentName);
      const result = await runner.run({
        cwd: projectPath,
        agent: openCodeAgent,
        prompt,
        timeout: this.config.executionTimeout,
        model: execModel,
      });

      this.activeRunners.delete(taskId);

      log.executionOpenCodeOutput(taskId, result.exitCode, result.durationMs);

      // 4. Update run
      await this.db.update(schema.taskRuns).set({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        finishedAt: new Date(),
        status: result.exitCode === 0 ? "completed" : "failed",
        command: `opencode run --agent ${openCodeAgent} "<execution prompt>"`,
      }).where(eq(schema.taskRuns.id, runId));

      // 5. Collect results per docs section 17
      log.info("EXECUTION", "Collecting git diff, status, artifacts...");
      await this.collector.collectExecutionResults(
        taskId,
        runId,
        projectPath,
        defaultBranch,
        result.stdout,
      );

      if (result.exitCode !== 0 || result.timedOut) {
        const errorMsg = result.timedOut
          ? "Execution timed out"
          : `Agent exited with code ${result.exitCode}`;

        log.jobFailed("execution", taskId, errorMsg);
        await this.updateRunStatus(runId, "failed", errorMsg);
        await this.updateTaskStatus(taskId, "failed");
        this.emit("execution:failed", taskId, errorMsg);
        return { success: false, error: errorMsg };
      }

      // 6. Route based on review mode
      const [execTask] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
      const reviewMode = execTask?.reviewMode ?? "auto";

      if (reviewMode === "human") {
        // Human review → stop at needs_human with code_review reason
        log.info("EXECUTION", `Human review mode — moving to needs_human (code_review)`);
        await this.db.update(schema.tasks).set({ needsHumanReason: "code_review" }).where(eq(schema.tasks.id, taskId));
        await this.updateTaskStatus(taskId, "needs_human");
        this.emit("task:moved", taskId, "in_progress", "needs_human");
      } else {
        // Auto review → queue AI review
        await this.updateTaskStatus(taskId, "in_review");
        this.emit("task:moved", taskId, "in_progress", "in_review");
        // Auto-queue the review job
        try {
          await this.queueReview(taskId);
        } catch (reviewErr) {
          log.warn("EXECUTION", `Auto-queue review failed: ${reviewErr instanceof Error ? reviewErr.message : String(reviewErr)}`);
        }
      }
      this.emit("execution:completed", taskId);
      log.executionComplete(taskId);

      return { success: true };

    } catch (err) {
      this.activeRunners.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("EXECUTION", `Unexpected error: ${errorMsg}`);
      await this.updateRunStatus(runId, "failed", errorMsg);
      await this.updateTaskStatus(taskId, "failed");
      this.emit("execution:failed", taskId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Process a review job
   */
  private async processReviewJob(job: schema.Job): Promise<JobResult> {
    const payload = job.payload as Record<string, unknown>;
    const taskId = job.taskId;
    const runId = payload.runId as string;
    const projectPath = payload.projectPath as string;
    const defaultBranch = (payload.defaultBranch as string) || "main";

    await this.updateRunStatus(runId, "running");
    log.reviewStart(taskId);

    try {
      // Get git diff
      const gitDiff = await BranchManager.getDiff(projectPath, defaultBranch);
      log.info("REVIEW", `Git diff: ${gitDiff.split("\n").length} lines`);

      // Get plan if available
      const plan = await this.getTaskPlan(taskId);
      const planData = plan?.planJson as PlanningResult | null;

      // Scan project for context
      log.info("REVIEW", "Scanning project for context...");
      const reviewProjectContext = await ProjectScanner.scan(projectPath);

      // Build sibling tasks context
      const reviewSiblingContext = await this.buildSiblingTasksContext(taskId, payload.projectId as string || "");

      // Build review prompt with context
      const prompt = buildReviewPrompt(
        {
          title: payload.title as string,
          description: payload.description as string | null,
          acceptanceCriteria: payload.acceptanceCriteria as string | null,
        },
        gitDiff,
        planData,
        projectPath,
        reviewProjectContext.summary,
        reviewSiblingContext,
      );

      // Run review agent (uses "build" agent in OpenCode — no dedicated review agent exists)
      const runner = new OpenCodeRunner(this.openCodeServer);
      this.activeRunners.set(taskId, runner);

      const reviewModel = await this.resolveModelForAgent("reviewer");
      const result = await runner.run({
        cwd: projectPath,
        agent: "build",
        prompt,
        model: reviewModel,
        timeout: this.config.reviewTimeout,
      });

      this.activeRunners.delete(taskId);

      // Update run
      await this.db.update(schema.taskRuns).set({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        finishedAt: new Date(),
        status: result.exitCode === 0 ? "completed" : "failed",
      }).where(eq(schema.taskRuns.id, runId));

      // Store review verdict
      await this.collector.storeReviewVerdict(taskId, runId, result.stdout);

      log.reviewComplete(taskId, result.stdout.length);

      // Parse review verdict to decide next step
      let verdictApproved = true; // default to approved if can't parse
      try {
        if (result.stdout && result.stdout.trim().length > 0) {
          const reviewResult = parsePlanningJson(result.stdout) as Record<string, unknown>;
          verdictApproved = reviewResult.verdict === "approve";
          const criteriaMet = reviewResult.acceptance_criteria_met !== false;

          log.info("REVIEW", `Verdict: ${String(reviewResult.verdict)}, criteria_met: ${criteriaMet}`);

          if (!verdictApproved || !criteriaMet) {
            log.info("REVIEW", `Review REJECTED — verdict=${String(reviewResult.verdict)}, criteria_met=${criteriaMet}`);
            if (Array.isArray(reviewResult.issues) && reviewResult.issues.length > 0) {
              log.info("REVIEW", `Issues: ${JSON.stringify(reviewResult.issues)}`);
            }
          }
        } else {
          log.warn("REVIEW", "Review returned empty response");
        }
      } catch {
        log.warn("REVIEW", "Could not parse review verdict JSON — defaulting to approved");
      }

      // Route based on verdict
      if (verdictApproved) {
        // Review approved → queue QA
        try {
          await this.acceptReviewAndQA(taskId);
        } catch (qaErr) {
          log.warn("REVIEW", `Auto-queue QA failed: ${qaErr instanceof Error ? qaErr.message : String(qaErr)}`);
        }
      } else {
        // Review rejected → move to needs_human for code review
        log.info("REVIEW", "Review rejected — moving to needs_human (code_review) for human decision");
        await this.db.update(schema.tasks).set({ needsHumanReason: "code_review" }).where(eq(schema.tasks.id, taskId));
        await this.updateTaskStatus(taskId, "needs_human");
        this.emit("task:moved", taskId, "in_review", "needs_human");
      }

      this.emit("review:completed", taskId, result.stdout);
      return { success: true, data: { verdict: result.stdout } };

    } catch (err) {
      this.activeRunners.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("REVIEW", `Unexpected error: ${errorMsg}`);
      await this.updateRunStatus(runId, "failed", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Process a QA job
   */
  private async processQAJob(job: schema.Job): Promise<JobResult> {
    const payload = job.payload as Record<string, unknown>;
    const taskId = job.taskId;
    const runId = payload.runId as string;
    const projectPath = payload.projectPath as string;

    await this.updateRunStatus(runId, "running");
    log.qaStart(taskId);

    try {
      // Get plan if available
      const plan = await this.getTaskPlan(taskId);
      const planData = plan?.planJson as PlanningResult | null;

      // Scan project for context (see what files actually exist after execution)
      log.info("QA", "Scanning project for context...");
      const qaProjectContext = await ProjectScanner.scan(projectPath);
      log.info("QA", `Project scan: ${qaProjectContext.fileCount} files, framework=${qaProjectContext.framework}`);

      // Build sibling tasks context
      const qaSiblingContext = await this.buildSiblingTasksContext(taskId, payload.projectId as string || "");
      if (qaSiblingContext) {
        log.info("QA", `Sibling context: ${qaSiblingContext.split("\n").length} lines`);
      }

      // Build QA prompt with full context
      const prompt = buildQAPrompt(
        {
          title: payload.title as string,
          description: payload.description as string | null,
          acceptanceCriteria: payload.acceptanceCriteria as string | null,
        },
        planData,
        projectPath,
        qaProjectContext.summary,
        qaSiblingContext,
      );

      // Run QA agent (uses "build" agent in OpenCode — no dedicated QA agent exists)
      const runner = new OpenCodeRunner(this.openCodeServer);
      this.activeRunners.set(taskId, runner);

      const qaModel = await this.resolveModelForAgent("qa");
      const result = await runner.run({
        cwd: projectPath,
        agent: "build",
        prompt,
        model: qaModel,
        timeout: this.config.qaTimeout,
      });

      this.activeRunners.delete(taskId);

      // Update run
      await this.db.update(schema.taskRuns).set({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        finishedAt: new Date(),
        status: result.exitCode === 0 ? "completed" : "failed",
      }).where(eq(schema.taskRuns.id, runId));

      // Store QA report
      await this.collector.storeQAReport(taskId, runId, result.stdout);

      // CRITICAL: Empty response = FAIL (not pass)
      if (!result.stdout || result.stdout.trim().length === 0) {
        log.warn("QA", "QA agent returned empty response — marking as FAILED");
        log.qaComplete(taskId, false);
        await this.updateTaskStatus(taskId, "failed");
        this.emit("task:moved", taskId, "qa", "failed");
        this.emit("qa:completed", taskId, "");
        return { success: false, error: "QA agent returned empty response" };
      }

      // Parse QA result to determine pass/fail
      try {
        const qaResult = parsePlanningJson(result.stdout) as Record<string, unknown>;
        // Strict: only pass if recommendation is explicitly "pass" AND tests_passed is true
        const passed = qaResult.recommendation === "pass" && qaResult.tests_passed !== false;
        log.qaComplete(taskId, !!passed);

        if (passed) {
          await this.updateTaskStatus(taskId, "done");
          await this.db.update(schema.tasks).set({ completedAt: new Date() }).where(eq(schema.tasks.id, taskId));
          this.emit("task:moved", taskId, "qa", "done");
        } else {
          log.info("QA", `QA FAILED: recommendation=${String(qaResult.recommendation)}, tests_passed=${String(qaResult.tests_passed)}`);
          if (Array.isArray(qaResult.failing_tests) && qaResult.failing_tests.length > 0) {
            log.info("QA", `Failing tests: ${JSON.stringify(qaResult.failing_tests)}`);
          }
          if (qaResult.verification_summary) {
            log.info("QA", `Summary: ${String(qaResult.verification_summary)}`);
          }
          await this.updateTaskStatus(taskId, "failed");
          this.emit("task:moved", taskId, "qa", "failed");
        }
      } catch {
        // If we can't parse the JSON, store the raw output and mark as FAILED
        // (previously this was optimistic — now we're strict)
        log.warn("QA", "Could not parse QA result JSON — marking as FAILED (raw output stored as artifact)");
        log.qaComplete(taskId, false);
        await this.updateTaskStatus(taskId, "failed");
        this.emit("task:moved", taskId, "qa", "failed");
      }

      this.emit("qa:completed", taskId, result.stdout);
      return { success: true };

    } catch (err) {
      this.activeRunners.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error("QA", `Unexpected error: ${errorMsg}`);
      await this.updateRunStatus(runId, "failed", errorMsg);
      await this.updateTaskStatus(taskId, "failed");
      return { success: false, error: errorMsg };
    }
  }

  // ===== Helpers =====

  private async createRun(taskId: string, runType: RunType, agentName: string): Promise<schema.TaskRun> {
    const [run] = await this.db.insert(schema.taskRuns).values({
      id: nanoid(),
      taskId,
      runType,
      status: "queued",
      agentName,
      createdAt: new Date(),
    }).returning();
    return run;
  }

  private async updateRunStatus(runId: string, status: RunStatus, error?: string): Promise<void> {
    const updates: Partial<schema.TaskRun> = { status };
    if (status === "running") updates.startedAt = new Date();
    if (status === "completed" || status === "failed") updates.finishedAt = new Date();
    if (error) updates.error = error;

    await this.db.update(schema.taskRuns).set(updates).where(eq(schema.taskRuns.id, runId));
  }

  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    // Get old status and batchId for logging and batch chaining
    const [oldTask] = await this.db.select({
      status: schema.tasks.status,
      batchId: schema.tasks.batchId,
    }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    const oldStatus = oldTask?.status ?? "unknown";
    const taskBatchId = oldTask?.batchId;

    await this.db.update(schema.tasks).set({
      status,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    log.taskStatusChanged(taskId, oldStatus, status);
    this.emit("task:moved", taskId, oldStatus, status);

    // Batch chaining: when a batch task reaches done or failed, trigger next task
    if (taskBatchId && (status === "done" || status === "failed")) {
      // Use setTimeout to avoid blocking the current job processor
      setTimeout(async () => {
        try {
          await this.executeNextInBatch(taskBatchId);
        } catch (err) {
          log.warn("BATCH", `Failed to chain next task in batch ${taskBatchId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }, 500);
    }
  }

  /**
   * Build context about sibling tasks in the same project.
   * Helps agents understand what other tasks have done or are doing.
   */
  private async buildSiblingTasksContext(taskId: string, projectId: string): Promise<string> {
    try {
      // Get all tasks in the same project (excluding current task)
      const allTasks = await this.db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          description: schema.tasks.description,
          status: schema.tasks.status,
          agentType: schema.tasks.agentType,
          branch: schema.tasks.branch,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, projectId),
          ),
        );

      // Filter out current task and irrelevant statuses
      const siblings = allTasks.filter(
        (t) => t.id !== taskId && !["cancelled", "backlog"].includes(t.status),
      );

      if (siblings.length === 0) return "";

      const lines: string[] = ["RELATED TASKS IN THIS PROJECT:"];

      for (const sibling of siblings) {
        const statusIcon =
          sibling.status === "done"
            ? "✅ [DONE]"
            : sibling.status === "in_progress" || sibling.status === "coding"
              ? "⚡ [IN PROGRESS]"
              : sibling.status === "planning"
                ? "🧠 [PLANNING]"
                : sibling.status === "in_review" || sibling.status === "qa"
                  ? "🔍 [REVIEW/QA]"
                  : sibling.status === "needs_human"
                    ? "🖐️ [NEEDS HUMAN]"
                    : sibling.status === "failed"
                      ? "❌ [FAILED]"
                      : `[${sibling.status.toUpperCase()}]`;

        let line = `${statusIcon} "${sibling.title}"`;

        // For done/in_progress tasks, try to get file change info from artifacts
        if (["done", "in_progress", "in_review", "qa", "needs_human"].includes(sibling.status)) {
          try {
            const artifacts = await this.collector.getTaskArtifacts(sibling.id);

            // Get file list from git_diff_stat
            const diffStat = artifacts.find((a) => a.artifactType === "git_diff_stat");
            if (diffStat?.content) {
              // Parse "file | changes" lines from diff stat
              const fileLines = diffStat.content
                .split("\n")
                .filter((l) => l.includes("|"))
                .map((l) => l.split("|")[0].trim())
                .filter((f) => f.length > 0);

              if (fileLines.length > 0) {
                line += `\n   → Files: ${fileLines.join(", ")}`;
              }
            }

            // Get summary
            const summary = artifacts.find((a) => a.artifactType === "final_summary");
            if (summary?.content) {
              // Truncate summary to first 200 chars
              const shortSummary = summary.content.slice(0, 200).replace(/\n/g, " ").trim();
              if (shortSummary) {
                line += `\n   → Summary: ${shortSummary}${summary.content.length > 200 ? "..." : ""}`;
              }
            }
          } catch {
            // Ignore artifact fetch errors
          }
        }

        lines.push(line);
      }

      lines.push("");
      lines.push(
        "IMPORTANT: Coordinate with the tasks above. Do NOT duplicate work that is already done.",
      );
      lines.push(
        "If a completed task created files, your code should integrate with those files.",
      );

      return lines.join("\n");
    } catch (err) {
      log.warn(
        "WORKER",
        `Failed to build sibling context: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "";
    }
  }

  /**
   * Check if a task requires human approval based on risk rules.
   * Per docs section 19.
   */
  private requiresHumanApproval(plan: PlanningResult, labels: string[]): boolean {
    if (labels.includes("risk:high")) return true;
    if (plan.risk_level === "high") return true;

    const sensitivePatterns = ["payment", "auth", "migration", "secret", "credential", "password"];
    const filesToChange = plan.likely_files_to_change || [];
    for (const file of filesToChange) {
      for (const pattern of sensitivePatterns) {
        if (file.toLowerCase().includes(pattern)) return true;
      }
    }

    return false;
  }

  /**
   * Map TaskHive agent names to OpenCode agent names
   */
  private mapAgentName(agentName: string): string {
    const mapping: Record<string, string> = {
      planner: "plan",
      coder: "build",
      build: "build",
      frontend: "build",
      backend: "build",
      reviewer: "build",
      review: "build",
      qa: "build",
      docs: "build",
      explore: "explore",
      debugger: "build",
    };
    return mapping[agentName] || "build";
  }

  /**
   * Resolve the OpenCode model string for a given TaskHive agent name.
   * Reads from the config table in the DB (set via Settings UI).
   * Falls back to the default model from WorkerConfig.
   */
  private async resolveModelForAgent(agentName: string): Promise<string | undefined> {
    try {
      const [row] = await this.db
        .select()
        .from(schema.config)
        .where(eq(schema.config.key, "ai"));

      if (!row?.value) return this.config.openCodeModel;

      const aiConfig = row.value as {
        agents?: Record<string, { provider?: string; model?: string }>;
      };

      // Map TaskHive agent name to config key
      const configKey = agentName === "plan" ? "planner"
        : agentName === "build" ? "coder"
        : agentName === "review" ? "reviewer"
        : agentName;

      const agentConfig = aiConfig.agents?.[configKey];
      if (!agentConfig?.provider || !agentConfig?.model) {
        return this.config.openCodeModel;
      }

      // Map TaskHive provider names to OpenCode provider IDs
      // TaskHive config: { provider: "router", model: "cx/gpt-5.5" }
      // OpenCode format: "9router/cx/gpt-5.5"
      const providerMap: Record<string, string> = {
        router: "9router",
        openrouter: "openrouter",
        openai: "openai",
        anthropic: "anthropic",
      };

      const openCodeProvider = providerMap[agentConfig.provider] ?? agentConfig.provider;
      const model = `${openCodeProvider}/${agentConfig.model}`;
      log.info("RUNNER", `Resolved model for ${agentName}: ${model}`);
      return model;
    } catch {
      return this.config.openCodeModel;
    }
  }
}
