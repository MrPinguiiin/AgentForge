/**
 * Result Collector
 *
 * Captures git diff, git status, test logs, and other artifacts
 * after OpenCode execution. Per docs section 17.
 */

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.js";
import type { ArtifactType } from "../db/schema.js";
import { BranchManager } from "./branch-manager.js";

export interface CollectedResults {
  gitStatus: string;
  gitDiffStat: string;
  gitDiff: string;
  artifacts: schema.TaskArtifact[];
}

export class ResultCollector {
  private db: BunSQLiteDatabase<typeof schema>;

  constructor(db: BunSQLiteDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Store an artifact in the database
   */
  async storeArtifact(
    taskId: string,
    runId: string,
    artifactType: ArtifactType,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<schema.TaskArtifact> {
    const [artifact] = await this.db.insert(schema.taskArtifacts).values({
      id: nanoid(),
      taskId,
      runId,
      artifactType,
      content,
      metadata: metadata ?? {},
      createdAt: new Date(),
    }).returning();

    return artifact;
  }

  /**
   * Collect all results after an execution run.
   * Per docs section 17:
   *   git status --short
   *   git diff --stat
   *   git diff
   */
  async collectExecutionResults(
    taskId: string,
    runId: string,
    cwd: string,
    baseBranch = "main",
    stdout?: string,
  ): Promise<CollectedResults> {
    const artifacts: schema.TaskArtifact[] = [];

    const isGitRepo = await BranchManager.isGitRepository(cwd);
    if (!isGitRepo) {
      const finalSummary = stdout ?? "Execution completed in a non-git project. Git diff artifacts are unavailable.";
      const artifact = await this.storeArtifact(taskId, runId, "final_summary", finalSummary, {
        git: false,
        reason: "not_a_git_repository",
      });
      artifacts.push(artifact);
      return { gitStatus: "", gitDiffStat: "", gitDiff: "", artifacts };
    }

    // Stage all changes first (including new untracked files) so they appear in diff
    await BranchManager.stageAll(cwd);

    // 1. Git status
    const gitStatus = await BranchManager.getStatus(cwd);
    if (gitStatus) {
      const artifact = await this.storeArtifact(taskId, runId, "git_status", gitStatus);
      artifacts.push(artifact);
    }

    // 2. Git diff stat (staged + committed vs base)
    const gitDiffStat = await BranchManager.getDiffStat(cwd, baseBranch);
    if (gitDiffStat) {
      const artifact = await this.storeArtifact(taskId, runId, "git_diff_stat", gitDiffStat);
      artifacts.push(artifact);
    }

    // 3. Full git diff (staged + committed vs base)
    const gitDiff = await BranchManager.getDiff(cwd, baseBranch);
    if (gitDiff) {
      const artifact = await this.storeArtifact(taskId, runId, "git_diff", gitDiff);
      artifacts.push(artifact);
    }

    // 4. Final summary from stdout
    if (stdout) {
      const artifact = await this.storeArtifact(taskId, runId, "final_summary", stdout);
      artifacts.push(artifact);
    }

    return { gitStatus, gitDiffStat, gitDiff, artifacts };
  }

  /**
   * Store planning JSON as artifact
   */
  async storePlanningResult(
    taskId: string,
    runId: string,
    planJson: string,
  ): Promise<schema.TaskArtifact> {
    return this.storeArtifact(taskId, runId, "planning_json", planJson);
  }

  /**
   * Store review verdict as artifact
   */
  async storeReviewVerdict(
    taskId: string,
    runId: string,
    verdict: string,
  ): Promise<schema.TaskArtifact> {
    return this.storeArtifact(taskId, runId, "review_verdict", verdict);
  }

  /**
   * Store QA report as artifact
   */
  async storeQAReport(
    taskId: string,
    runId: string,
    report: string,
  ): Promise<schema.TaskArtifact> {
    return this.storeArtifact(taskId, runId, "qa_report", report);
  }

  /**
   * Store test log as artifact
   */
  async storeTestLog(
    taskId: string,
    runId: string,
    log: string,
  ): Promise<schema.TaskArtifact> {
    return this.storeArtifact(taskId, runId, "test_log", log);
  }

  /**
   * Get all artifacts for a task
   */
  async getTaskArtifacts(taskId: string): Promise<schema.TaskArtifact[]> {
    return this.db
      .select()
      .from(schema.taskArtifacts)
      .where(eq(schema.taskArtifacts.taskId, taskId))
      .orderBy(schema.taskArtifacts.createdAt);
  }

  /**
   * Get artifacts for a specific run
   */
  async getRunArtifacts(runId: string): Promise<schema.TaskArtifact[]> {
    return this.db
      .select()
      .from(schema.taskArtifacts)
      .where(eq(schema.taskArtifacts.runId, runId))
      .orderBy(schema.taskArtifacts.createdAt);
  }

  /**
   * Get artifacts by type for a task
   */
  async getArtifactsByType(taskId: string, type: ArtifactType): Promise<schema.TaskArtifact[]> {
    return this.db
      .select()
      .from(schema.taskArtifacts)
      .where(eq(schema.taskArtifacts.taskId, taskId))
      .orderBy(schema.taskArtifacts.createdAt);
  }
}
