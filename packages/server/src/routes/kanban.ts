import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  type Orchestrator,
  TaskRouter,
  KanbanOrchestrator,
  DEFAULT_ROUTER_CONFIG,
  type TaskStatus,
  type LabelCategory,
} from "@ai-coder/core";

export function createKanbanRoutes(orchestrator: Orchestrator) {
  const app = new Hono();
  const taskManager = orchestrator.getTaskManager();
  const router = new TaskRouter();

  // --- Board ---

  // GET /api/kanban/board/:projectId - Get full kanban board
  app.get("/board/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const board = await taskManager.getKanbanBoard(projectId);

    // Enrich with labels
    const enrichedBoard: Record<string, any[]> = {};
    for (const [status, tasks] of Object.entries(board)) {
      enrichedBoard[status] = await Promise.all(
        (tasks as any[]).map(async (task) => ({
          ...task,
          labels: await taskManager.getTaskLabels(task.id),
        }))
      );
    }

    return c.json({ board: enrichedBoard });
  });

  // --- Routing ---

  // POST /api/kanban/route/:taskId - Preview routing for a task
  app.post("/route/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const task = await taskManager.getTask(taskId);
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const labels = await taskManager.getTaskLabels(taskId);
    const decision = router.route({ task, labels });

    return c.json({ decision });
  });

  // POST /api/kanban/route-batch - Route all ready tasks
  app.post("/route-batch", async (c) => {
    const readyTasks = await taskManager.getTasksByStatus("ready");

    const cards = await Promise.all(
      readyTasks.map(async (task) => ({
        task,
        labels: await taskManager.getTaskLabels(task.id),
      }))
    );

    const decisions = router.routeBatch(cards);
    return c.json({ decisions, total: readyTasks.length });
  });

  // --- Task Status Transitions ---

  // POST /api/kanban/move/:taskId - Move task to a new status
  app.post(
    "/move/:taskId",
    zValidator(
      "json",
      z.object({
        status: z.enum([
          "backlog", "todo", "ready", "planning", "coding",
          "in_progress", "needs_human", "in_review", "qa",
          "done", "cancelled", "failed",
        ]),
      })
    ),
    async (c) => {
      const taskId = c.req.param("taskId");
      const { status } = c.req.valid("json");

      const updated = await taskManager.updateTask(taskId, { status: status as TaskStatus });
      if (!updated) {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.json({ task: updated });
    }
  );

  // POST /api/kanban/ready/:taskId - Move to ready
  app.post("/ready/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const updated = await taskManager.moveTaskToReady(taskId);
    if (!updated) {
      return c.json({ error: "Task not found" }, 404);
    }

    // Preview routing
    const labels = await taskManager.getTaskLabels(taskId);
    const decision = router.route({ task: updated, labels });

    return c.json({ task: updated, routingPreview: decision });
  });

  // --- Labels ---

  // GET /api/kanban/labels/:taskId - Get labels for a task
  app.get("/labels/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const labels = await taskManager.getTaskLabels(taskId);
    return c.json({ labels });
  });

  // POST /api/kanban/labels/:taskId - Add a label
  app.post(
    "/labels/:taskId",
    zValidator(
      "json",
      z.object({
        category: z.enum(["type", "risk", "scope", "area", "priority"]),
        value: z.string().min(1),
      })
    ),
    async (c) => {
      const taskId = c.req.param("taskId");
      const { category, value } = c.req.valid("json");

      const label = await taskManager.addTaskLabel({
        taskId,
        category: category as LabelCategory,
        value,
      });

      return c.json({ label }, 201);
    }
  );

  // DELETE /api/kanban/labels/:taskId - Remove a label
  app.delete(
    "/labels/:taskId",
    zValidator(
      "json",
      z.object({
        category: z.enum(["type", "risk", "scope", "area", "priority"]),
        value: z.string().min(1),
      })
    ),
    async (c) => {
      const taskId = c.req.param("taskId");
      const { category, value } = c.req.valid("json");

      const removed = await taskManager.removeTaskLabel(
        taskId,
        category as LabelCategory,
        value
      );

      if (!removed) {
        return c.json({ error: "Label not found" }, 404);
      }

      return c.json({ success: true });
    }
  );

  // PUT /api/kanban/labels/:taskId - Set all labels (replace)
  app.put(
    "/labels/:taskId",
    zValidator(
      "json",
      z.object({
        labels: z.array(
          z.object({
            category: z.enum(["type", "risk", "scope", "area", "priority"]),
            value: z.string().min(1),
          })
        ),
      })
    ),
    async (c) => {
      const taskId = c.req.param("taskId");
      const { labels } = c.req.valid("json");

      const result = await taskManager.setTaskLabels(
        taskId,
        labels.map((l) => ({ category: l.category as LabelCategory, value: l.value }))
      );

      return c.json({ labels: result });
    }
  );

  // --- Task Card (full card with labels, criteria, etc.) ---

  // POST /api/kanban/card - Create a full task card
  app.post(
    "/card",
    zValidator(
      "json",
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        acceptanceCriteria: z.string().optional(),
        priority: z.number().optional(),
        labels: z
          .array(
            z.object({
              category: z.enum(["type", "risk", "scope", "area", "priority"]),
              value: z.string().min(1),
            })
          )
          .optional(),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");

      const task = await taskManager.createTask({
        projectId: body.projectId,
        title: body.title,
        description: body.description,
        acceptanceCriteria: body.acceptanceCriteria,
        priority: body.priority,
        status: "backlog",
      });

      // Add labels
      const labels = [];
      if (body.labels) {
        for (const label of body.labels) {
          const created = await taskManager.addTaskLabel({
            taskId: task.id,
            category: label.category as LabelCategory,
            value: label.value,
          });
          labels.push(created);
        }
      }

      return c.json({ task, labels }, 201);
    }
  );

  // --- Router Config ---

  // GET /api/kanban/router/config - Get router configuration
  app.get("/router/config", (c) => {
    return c.json({ config: router.getConfig() });
  });

  // --- Stats ---

  // GET /api/kanban/stats/:projectId - Get kanban stats
  app.get("/stats/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const board = await taskManager.getKanbanBoard(projectId);

    const stats = {
      total: 0,
      byStatus: {} as Record<string, number>,
      inProgress: 0,
      completed: 0,
      failed: 0,
      needsHuman: 0,
    };

    for (const [status, tasks] of Object.entries(board)) {
      const count = (tasks as any[]).length;
      stats.total += count;
      stats.byStatus[status] = count;
    }

    stats.inProgress = (stats.byStatus["in_progress"] ?? 0) + (stats.byStatus["coding"] ?? 0);
    stats.completed = stats.byStatus["done"] ?? 0;
    stats.failed = stats.byStatus["failed"] ?? 0;
    stats.needsHuman = stats.byStatus["needs_human"] ?? 0;

    return c.json({ stats });
  });

  return app;
}
