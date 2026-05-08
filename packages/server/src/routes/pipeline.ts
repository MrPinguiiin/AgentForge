/**
 * Pipeline API Routes
 *
 * TaskHive pipeline endpoints per docs section 15:
 * - POST /api/pipeline/:taskId/run-planning
 * - GET  /api/pipeline/:taskId/plan
 * - POST /api/pipeline/:taskId/approve-plan
 * - POST /api/pipeline/:taskId/retry-planning
 * - POST /api/pipeline/:taskId/cancel
 * - POST /api/pipeline/:taskId/run-review
 * - POST /api/pipeline/:taskId/run-qa
 * - POST /api/pipeline/:taskId/accept-review
 * - POST /api/pipeline/:taskId/decline-review
 * - GET  /api/pipeline/:taskId/runs
 * - GET  /api/pipeline/:taskId/artifacts
 * - GET  /api/pipeline/queue/stats
 */

import { Hono } from "hono";
import type { TaskHiveWorker } from "@ai-coder/core";

export function createPipelineRoutes(worker: TaskHiveWorker) {
  const app = new Hono();

  // ── Run Planning ──────────────────────
  // POST /api/pipeline/:taskId/run-planning
  app.post("/:taskId/run-planning", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const job = await worker.queuePlanning(taskId);
      return c.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Planning job queued",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Get Task Plan ──────────────────────
  // GET /api/pipeline/:taskId/plan
  app.get("/:taskId/plan", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const plan = await worker.getTaskPlan(taskId);
      if (!plan) {
        // Return 200 with null plan — NOT 404 — to avoid browser console errors
        return c.json({ taskId, plan: null });
      }

      return c.json({
        taskId,
        plan: {
          id: plan.id,
          summary: plan.summary,
          planJson: plan.planJson,
          recommendedAgent: plan.recommendedAgent,
          riskLevel: plan.riskLevel,
          needsHuman: plan.needsHuman,
          approved: plan.approved,
          approvedAt: plan.approvedAt,
          createdAt: plan.createdAt,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ── Approve Plan ──────────────────────
  // POST /api/pipeline/:taskId/approve-plan
  app.post("/:taskId/approve-plan", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const job = await worker.approvePlan(taskId);
      return c.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Execution job queued after plan approval",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Retry Planning ──────────────────────
  // POST /api/pipeline/:taskId/retry-planning
  app.post("/:taskId/retry-planning", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const job = await worker.retryPlanning(taskId);
      return c.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Planning retry queued",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Cancel Task ──────────────────────
  // POST /api/pipeline/:taskId/cancel
  app.post("/:taskId/cancel", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      await worker.cancelTask(taskId);
      return c.json({
        success: true,
        message: "Task cancelled",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Run Review ──────────────────────
  // POST /api/pipeline/:taskId/run-review
  app.post("/:taskId/run-review", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const job = await worker.queueReview(taskId);
      return c.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "Review job queued",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Run QA ──────────────────────
  // POST /api/pipeline/:taskId/run-qa
  app.post("/:taskId/run-qa", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const job = await worker.queueQA(taskId);
      return c.json({
        success: true,
        jobId: job.id,
        status: "queued",
        message: "QA job queued",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Accept Review ──────────────────────
  // POST /api/pipeline/:taskId/accept-review
  app.post("/:taskId/accept-review", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      await worker.acceptReviewAndQA(taskId);
      return c.json({
        success: true,
        message: "Review accepted, QA queued",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Decline Review ──────────────────────
  // POST /api/pipeline/:taskId/decline-review
  app.post("/:taskId/decline-review", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      await worker.declineReview(taskId);
      return c.json({
        success: true,
        message: "Review declined, task moved to needs_human",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Get Task Runs ──────────────────────
  // GET /api/pipeline/:taskId/runs
  app.get("/:taskId/runs", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const runs = await worker.getTaskRuns(taskId);
      return c.json({ runs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ── Get Task Artifacts ──────────────────────
  // GET /api/pipeline/:taskId/artifacts
  app.get("/:taskId/artifacts", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const artifacts = await worker.getTaskArtifacts(taskId);
      return c.json({ artifacts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ── Batch Start ──────────────────────
  // POST /api/pipeline/batch-start
  app.post("/batch-start", async (c) => {
    try {
      const body = await c.req.json<{
        taskIds: string[];
        settings: { reviewMode: "auto" | "human"; approvalMode: "auto" | "manual" };
      }>();

      if (!body.taskIds || !Array.isArray(body.taskIds) || body.taskIds.length === 0) {
        return c.json({ success: false, error: "taskIds must be a non-empty array" }, 400);
      }

      const result = await worker.queueBatchPlanning(body.taskIds, body.settings ?? { reviewMode: "auto", approvalMode: "auto" });
      return c.json({
        success: true,
        batchId: result.batchId,
        queued: result.queued,
        skipped: result.skipped,
        message: `${result.queued.length} tasks queued, ${result.skipped.length} skipped`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Approve Human ──────────────────────
  // POST /api/pipeline/:taskId/approve-human
  app.post("/:taskId/approve-human", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      await worker.approveHuman(taskId);
      return c.json({
        success: true,
        message: "Human review approved",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Reject Human ──────────────────────
  // POST /api/pipeline/:taskId/reject-human
  app.post("/:taskId/reject-human", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      const body = await c.req.json<{ feedback?: string }>().catch(() => ({} as { feedback?: string }));
      await worker.rejectHuman(taskId, body.feedback);
      return c.json({
        success: true,
        message: "Human review rejected",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Pipeline Defaults ──────────────────────
  // GET /api/pipeline/defaults
  app.get("/defaults", async (c) => {
    try {
      const defaults = await worker.getPipelineDefaults();
      return c.json({ defaults });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // PUT /api/pipeline/defaults
  app.put("/defaults", async (c) => {
    try {
      const body = await c.req.json<{ reviewMode?: string; approvalMode?: string }>();
      await worker.savePipelineDefaults(body);
      return c.json({ success: true, message: "Pipeline defaults saved" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Batch Execute ──────────────────────
  // POST /api/pipeline/batch/:batchId/execute
  app.post("/batch/:batchId/execute", async (c) => {
    const batchId = c.req.param("batchId");
    try {
      await worker.executeBatch(batchId);
      return c.json({ success: true, message: "Batch execution started" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Batch Status ──────────────────────
  // GET /api/pipeline/batch/:batchId/status
  app.get("/batch/:batchId/status", async (c) => {
    const batchId = c.req.param("batchId");
    try {
      const status = await worker.getBatchStatus(batchId);
      return c.json({ status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // ── Batch Reorder ──────────────────────
  // POST /api/pipeline/batch/:batchId/reorder
  app.post("/batch/:batchId/reorder", async (c) => {
    const batchId = c.req.param("batchId");
    try {
      const body = await c.req.json<{ taskIds: string[] }>();
      if (!body.taskIds || !Array.isArray(body.taskIds)) {
        return c.json({ success: false, error: "taskIds must be an array" }, 400);
      }
      await worker.reorderBatch(batchId, body.taskIds);
      return c.json({ success: true, message: "Batch reordered" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: message }, 400);
    }
  });

  // ── Queue Stats ──────────────────────
  // GET /api/pipeline/queue/stats
  app.get("/queue/stats", async (c) => {
    try {
      const stats = await worker.getQueueStats();
      return c.json({ stats });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
