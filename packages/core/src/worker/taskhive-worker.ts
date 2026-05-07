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
} from "./prompt-templates.js";
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
  async queuePlanning(taskId: string): Promise<schema.Job> {
    // Validate task is in backlog
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "backlog") {
      throw new Error(`Task must be in backlog to run planning. Current status: ${task.status}`);
    }

    // Get project
    const [project] = await this.db.select().from(schema.projects).where(eq(schema.projects.id, task.projectId));
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    // Get labels
    const labels = await this.db.select().from(schema.taskLabels).where(eq(schema.taskLabels.taskId, taskId));
    const labelStrings = labels.map(l => `${l.category}:${l.value}`);

    // Create task run record
    const run = await this.createRun(taskId, "planning", "plan");

    // Update task status to planning
    await this.updateTaskStatus(taskId, "planning");

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
    log.info("PLANNING", `Task "${task.title}" | Labels: [${labelStrings.join(", ") || "none"}]`);
    this.emit("planning:queued", taskId);
    return job;
  }

  /**
   * Approve a plan and queue execution.
   * Per docs Flow 3: Approve Plan
   */
  async approvePlan(taskId: string): Promise<schema.Job> {
    // Validate task is in ready
    const [task] = await this.db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "ready") {
      throw new Error(`Task must be in 'ready' to approve plan. Current status: ${task.status}`);
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
    await this.updateTaskStatus(taskId, "needs_human");
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

    // Build planning prompt
    const prompt = buildPlanningPrompt(
      {
        title: payload.title as string,
        description: payload.description as string | null,
        acceptanceCriteria: payload.acceptanceCriteria as string | null,
      },
      { name: projectName, rootPath: projectPath },
      labels,
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

      // Determine next column per docs section 13
      if (planData.needs_human) {
        log.planningNeedsHuman(taskId, "Plan flagged needs_human=true");
        await this.updateTaskStatus(taskId, "needs_human");
        this.emit("task:moved", taskId, "planning", "needs_human");
      } else {
        // Check risk rules per docs section 19
        if (this.requiresHumanApproval(planData, labels)) {
          log.planningNeedsHuman(taskId, `High risk detected (risk=${planData.risk_level}, labels=[${labels.join(",")}])`);
          await this.updateTaskStatus(taskId, "needs_human");
          this.emit("task:moved", taskId, "planning", "needs_human");
        } else {
          await this.updateTaskStatus(taskId, "ready");
          await this.db.update(schema.tasks).set({
            agentType: planData.recommended_agent as schema.AgentType,
          }).where(eq(schema.tasks.id, taskId));
          this.emit("task:moved", taskId, "planning", "ready");
          log.planningComplete(taskId, "ready");
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

      // 2. Build execution prompt
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

      // 6. Move to Review
      await this.updateTaskStatus(taskId, "in_review");
      this.emit("task:moved", taskId, "in_progress", "in_review");
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

      // Build review prompt
      const prompt = buildReviewPrompt(
        {
          title: payload.title as string,
          description: payload.description as string | null,
          acceptanceCriteria: payload.acceptanceCriteria as string | null,
        },
        gitDiff,
        planData,
        projectPath,
      );

      // Run review agent
      const runner = new OpenCodeRunner(this.openCodeServer);
      this.activeRunners.set(taskId, runner);

      const reviewModel = await this.resolveModelForAgent("reviewer");
      const result = await runner.run({
        cwd: projectPath,
        agent: "review",
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

      // Build QA prompt
      const prompt = buildQAPrompt(
        {
          title: payload.title as string,
          description: payload.description as string | null,
          acceptanceCriteria: payload.acceptanceCriteria as string | null,
        },
        planData,
        projectPath,
      );

      // Run QA agent
      const runner = new OpenCodeRunner(this.openCodeServer);
      this.activeRunners.set(taskId, runner);

      const qaModel = await this.resolveModelForAgent("qa");
      const result = await runner.run({
        cwd: projectPath,
        agent: "qa",
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

      // Parse QA result to determine pass/fail
      try {
        const qaResult = parsePlanningJson(result.stdout);
        const passed = qaResult.recommendation === "pass" || qaResult.tests_passed;
        log.qaComplete(taskId, !!passed);
        if (passed) {
          await this.updateTaskStatus(taskId, "done");
          await this.db.update(schema.tasks).set({ completedAt: new Date() }).where(eq(schema.tasks.id, taskId));
          this.emit("task:moved", taskId, "qa", "done");
        } else {
          await this.updateTaskStatus(taskId, "failed");
          this.emit("task:moved", taskId, "qa", "failed");
        }
      } catch {
        // If we can't parse, move to done (optimistic)
        log.warn("QA", "Could not parse QA result JSON, assuming passed");
        log.qaComplete(taskId, true);
        await this.updateTaskStatus(taskId, "done");
        await this.db.update(schema.tasks).set({ completedAt: new Date() }).where(eq(schema.tasks.id, taskId));
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
    // Get old status for logging
    const [oldTask] = await this.db.select({ status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.id, taskId));
    const oldStatus = oldTask?.status ?? "unknown";

    await this.db.update(schema.tasks).set({
      status,
      updatedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    log.taskStatusChanged(taskId, oldStatus, status);
    this.emit("task:moved", taskId, oldStatus, status);
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
