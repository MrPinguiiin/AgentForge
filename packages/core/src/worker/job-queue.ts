/**
 * SQLite-backed Job Queue
 *
 * Mimics BullMQ interface but uses SQLite for persistence.
 * Can be swapped to BullMQ + Redis later without changing the worker code.
 */

import { eq, and, sql, asc, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema.js";
import type { JobType, JobStatus } from "../db/schema.js";
import EventEmitter from "eventemitter3";
import { log } from "./logger.js";

export interface JobData {
  taskId: string;
  projectId: string;
  [key: string]: unknown;
}

export interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface QueueEvents {
  "job:added": (job: schema.Job) => void;
  "job:active": (job: schema.Job) => void;
  "job:completed": (job: schema.Job) => void;
  "job:failed": (job: schema.Job, error: string) => void;
  "job:cancelled": (job: schema.Job) => void;
}

export type JobProcessor = (job: schema.Job) => Promise<JobResult>;

export class JobQueue extends EventEmitter<QueueEvents> {
  private db: BunSQLiteDatabase<typeof schema>;
  private processors: Map<JobType, JobProcessor> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private running = false;
  private concurrency = 1;
  private activeJobs = 0;

  constructor(db: BunSQLiteDatabase<typeof schema>, options?: { concurrency?: number }) {
    super();
    this.db = db;
    this.concurrency = options?.concurrency ?? 1;
  }

  /**
   * Register a processor for a job type
   */
  registerProcessor(type: JobType, processor: JobProcessor): void {
    this.processors.set(type, processor);
  }

  /**
   * Add a job to the queue
   */
  async addJob(type: JobType, taskId: string, payload: Record<string, unknown>, options?: {
    priority?: number;
    maxAttempts?: number;
    delay?: number;
  }): Promise<schema.Job> {
    const id = nanoid();
    const now = new Date();

    const [job] = await this.db.insert(schema.jobQueue).values({
      id,
      type,
      taskId,
      status: "pending",
      payload,
      priority: options?.priority ?? 0,
      maxAttempts: options?.maxAttempts ?? 3,
      scheduledAt: options?.delay ? new Date(Date.now() + options.delay) : undefined,
      createdAt: now,
    }).returning();

    this.emit("job:added", job);
    return job;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const [job] = await this.db
      .update(schema.jobQueue)
      .set({ status: "cancelled" as JobStatus, completedAt: new Date() })
      .where(and(
        eq(schema.jobQueue.id, jobId),
        sql`${schema.jobQueue.status} IN ('pending', 'active')`
      ))
      .returning();

    if (job) {
      this.emit("job:cancelled", job);
    }
  }

  /**
   * Cancel all jobs for a task
   */
  async cancelTaskJobs(taskId: string): Promise<void> {
    const jobs = await this.db
      .update(schema.jobQueue)
      .set({ status: "cancelled" as JobStatus, completedAt: new Date() })
      .where(and(
        eq(schema.jobQueue.taskId, taskId),
        sql`${schema.jobQueue.status} IN ('pending', 'active')`
      ))
      .returning();

    for (const job of jobs) {
      this.emit("job:cancelled", job);
    }
  }

  /**
   * Get the next pending job (FIFO with priority)
   */
  private async claimNextJob(): Promise<schema.Job | null> {
    const now = new Date();

    // Find next eligible job: pending, not scheduled in future, ordered by priority desc then created_at asc
    const [job] = await this.db
      .select()
      .from(schema.jobQueue)
      .where(and(
        eq(schema.jobQueue.status, "pending"),
        sql`(${schema.jobQueue.scheduledAt} IS NULL OR ${schema.jobQueue.scheduledAt} <= ${now.getTime() / 1000})`
      ))
      .orderBy(sql`${schema.jobQueue.priority} DESC, ${schema.jobQueue.createdAt} ASC`)
      .limit(1);

    if (!job) return null;

    // Atomically claim it
    const [claimed] = await this.db
      .update(schema.jobQueue)
      .set({
        status: "active" as JobStatus,
        lockedAt: now,
        startedAt: now,
        attempts: job.attempts + 1,
      })
      .where(and(
        eq(schema.jobQueue.id, job.id),
        eq(schema.jobQueue.status, "pending")
      ))
      .returning();

    return claimed ?? null;
  }

  /**
   * Process a single job
   */
  private async processJob(job: schema.Job): Promise<void> {
    const processor = this.processors.get(job.type);
    if (!processor) {
      console.error(`[JobQueue] No processor registered for job type: ${job.type}`);
      await this.db
        .update(schema.jobQueue)
        .set({
          status: "failed" as JobStatus,
          error: `No processor for type: ${job.type}`,
          completedAt: new Date(),
        })
        .where(eq(schema.jobQueue.id, job.id));
      return;
    }

    log.jobStarted(job.type, job.taskId);
    this.emit("job:active", job);

    try {
      const startTime = Date.now();
      const result = await processor(job);
      const duration = Date.now() - startTime;

      if (result.success) {
        log.jobCompleted(job.type, job.taskId, duration);
        const [completed] = await this.db
          .update(schema.jobQueue)
          .set({
            status: "completed" as JobStatus,
            result: result.data as Record<string, unknown> | undefined,
            completedAt: new Date(),
          })
          .where(eq(schema.jobQueue.id, job.id))
          .returning();

        if (completed) this.emit("job:completed", completed);
      } else {
        throw new Error(result.error || "Job failed");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      log.jobFailed(job.type, job.taskId, errorMsg);

      // Check if we should retry
      if (job.attempts < job.maxAttempts) {
        log.warn("QUEUE", `Retrying ${job.type} job (attempt ${job.attempts}/${job.maxAttempts}) task=${job.taskId.slice(0,8)}`);
        // Put back to pending for retry
        await this.db
          .update(schema.jobQueue)
          .set({
            status: "pending" as JobStatus,
            error: errorMsg,
            lockedAt: null,
            // Exponential backoff: 5s, 25s, 125s
            scheduledAt: new Date(Date.now() + Math.pow(5, job.attempts) * 1000),
          })
          .where(eq(schema.jobQueue.id, job.id));
      } else {
        // Max attempts reached, mark as failed
        const [failed] = await this.db
          .update(schema.jobQueue)
          .set({
            status: "failed" as JobStatus,
            error: errorMsg,
            completedAt: new Date(),
          })
          .where(eq(schema.jobQueue.id, job.id))
          .returning();

        if (failed) this.emit("job:failed", failed, errorMsg);
      }
    }
  }

  /**
   * Poll for and process jobs
   */
  private async poll(): Promise<void> {
    if (this.processing || !this.running) return;
    this.processing = true;

    try {
      while (this.running && this.activeJobs < this.concurrency) {
        const job = await this.claimNextJob();
        if (!job) break;

        this.activeJobs++;
        // Process async - don't await so we can pick up more jobs
        this.processJob(job).finally(() => {
          this.activeJobs--;
        });
      }
    } catch (err) {
      console.error("[JobQueue] Poll error:", err);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Start the queue worker
   */
  start(intervalMs = 2000): void {
    if (this.running) return;
    this.running = true;

    console.log(`[JobQueue] Started with concurrency=${this.concurrency}, poll=${intervalMs}ms`);

    // Initial poll
    this.poll();

    // Periodic polling
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
  }

  /**
   * Stop the queue worker
   */
  stop(): void {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log("[JobQueue] Stopped");
  }

  /**
   * Get queue stats
   */
  async getStats(): Promise<Record<JobStatus, number>> {
    const rows = await this.db
      .select({
        status: schema.jobQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.jobQueue)
      .groupBy(schema.jobQueue.status);

    const stats: Record<string, number> = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const row of rows) {
      stats[row.status] = row.count;
    }

    return stats as Record<JobStatus, number>;
  }

  /**
   * Get jobs for a specific task
   */
  async getTaskJobs(taskId: string): Promise<schema.Job[]> {
    return this.db
      .select()
      .from(schema.jobQueue)
      .where(eq(schema.jobQueue.taskId, taskId))
      .orderBy(sql`${schema.jobQueue.createdAt} DESC`);
  }
}
