import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Orchestrator, TaskStatus } from "@ai-coder/core";

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().optional(),
  status: z
    .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
    .optional(),
  priority: z.number().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z
    .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
    .optional(),
  priority: z.number().optional(),
});

const moveTaskSchema = z.object({
  newParentId: z.string().nullable(),
});

const reorderTaskSchema = z.object({
  newSortOrder: z.number(),
});

export function createTaskRoutes(orchestrator: Orchestrator) {
  const app = new Hono();
  const taskManager = orchestrator.getTaskManager();

  // List tasks
  app.get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const status = c.req.query("status") as TaskStatus | undefined;

    if (!projectId) {
      return c.json({ error: "projectId query parameter required" }, 400);
    }

    const tasks = await taskManager.listTasks(projectId, { status });
    return c.json({ tasks });
  });

  // Create task
  app.post("/", zValidator("json", createTaskSchema), async (c) => {
    const body = c.req.valid("json");
    const task = await taskManager.createTask(body);

    orchestrator.emit("task:created", task);

    return c.json({ task }, 201);
  });

  // Get task detail
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const task = await taskManager.getTaskWithSubtasks(id);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const files = await taskManager.getTaskFiles(id);
    const runs = await taskManager.getAgentRuns(id);

    return c.json({ task, files, runs });
  });

  // Update task
  app.put("/:id", zValidator("json", updateTaskSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const oldTask = await taskManager.getTask(id);
    const task = await taskManager.updateTask(id, body);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    orchestrator.emit("task:updated", task);

    // Emit status change event if status was updated
    if (body.status && oldTask && oldTask.status !== body.status) {
      orchestrator.emit("task:statusChanged", task, oldTask.status, body.status);
    }

    return c.json({ task });
  });

  // Delete task
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await taskManager.deleteTask(id);

    return c.json({ success: true });
  });

  // Move task (change parent)
  app.patch(
    "/:id/move",
    zValidator("json", moveTaskSchema),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");

      const task = await taskManager.moveTask({
        taskId: id,
        newParentId: body.newParentId,
      });

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      orchestrator.emit("task:updated", task);

      return c.json({ task });
    }
  );

  // Reorder task
  app.put(
    "/:id/reorder",
    zValidator("json", reorderTaskSchema),
    async (c) => {
      const id = c.req.param("id");
      const body = c.req.valid("json");

      const task = await taskManager.reorderTask({
        taskId: id,
        newSortOrder: body.newSortOrder,
      });

      return c.json({ task });
    }
  );

  // ── Pipeline Actions ──────────────────────

  // Plan task (Planner Agent)
  app.post("/:id/plan", async (c) => {
    const id = c.req.param("id");

    try {
      const result = await orchestrator.planTask(id);
      return c.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // Code task (Coder Agent)
  app.post("/:id/code", async (c) => {
    const id = c.req.param("id");

    try {
      const result = await orchestrator.codeTask(id);
      return c.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // Review task (Reviewer Agent)
  app.post("/:id/review", async (c) => {
    const id = c.req.param("id");

    try {
      const result = await orchestrator.reviewTask(id);
      return c.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // Publish task (commit + optional push via GitManager directly)
  app.post("/:id/publish", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    try {
      const task = await taskManager.getTask(id);
      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      const gitManager = orchestrator.getGitManager();
      const commitMessage =
        (body as Record<string, unknown>).commitMessage as string | undefined;
      const shouldPush =
        (body as Record<string, unknown>).push as boolean | undefined;

      // Commit all changes
      const commitResult = await gitManager.autoCommit(
        "feat",
        commitMessage ?? `${task.title} (AI-generated)`
      );

      // Update task status to done
      await taskManager.updateTask(id, { status: "done" });

      orchestrator.emit("git:committed", id, commitResult.hash, commitResult.message);

      // Push if requested
      let pushResult = null;
      if (shouldPush) {
        const branch = await gitManager.getCurrentBranch();
        pushResult = await gitManager.push("origin", branch);
        if (pushResult.success) {
          orchestrator.emit("git:pushed", id, branch);
        }
      }

      return c.json({
        result: {
          commit: commitResult,
          push: pushResult,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  // ── Task Files ──────────────────────

  // List task files
  app.get("/:id/files", async (c) => {
    const id = c.req.param("id");
    const files = await taskManager.getTaskFiles(id);
    return c.json({ files });
  });

  // Apply single file change
  app.post("/:id/files/:fileId/apply", async (c) => {
    const taskId = c.req.param("id");
    const fileId = c.req.param("fileId");

    const task = await taskManager.getTask(taskId);
    if (!task) return c.json({ error: "Task not found" }, 404);

    const files = await taskManager.getTaskFiles(taskId);
    const file = files.find((f: { id: string }) => f.id === fileId);
    if (!file) return c.json({ error: "File not found" }, 404);

    const fileManager = orchestrator.getFileManager();

    // Determine operation type from file status
    let opType: "create" | "modify" | "delete" = "modify";
    if (file.status === "created") opType = "create";
    else if (file.status === "deleted") opType = "delete";

    const result = await fileManager.applyOperation({
      type: opType,
      filePath: file.filePath,
      content: file.modifiedContent || undefined,
      diff: file.diff || undefined,
    });

    if (result.success) {
      await taskManager.updateTaskFileStatus(fileId, { status: "modified" });
    }

    return c.json({ result });
  });

  // Reject single file change
  app.post("/:id/files/:fileId/reject", async (c) => {
    const taskId = c.req.param("id");
    const fileId = c.req.param("fileId");

    await taskManager.updateTaskFileStatus(fileId, { status: "reviewed" });

    return c.json({ success: true });
  });

  // Apply all pending file changes
  app.post("/:id/files/apply-all", async (c) => {
    const taskId = c.req.param("id");

    const task = await taskManager.getTask(taskId);
    if (!task) return c.json({ error: "Task not found" }, 404);

    const files = await taskManager.getTaskFiles(taskId);
    const pending = files.filter(
      (f: { status: string }) => f.status === "pending"
    );

    const results = [];
    const fileManager = orchestrator.getFileManager();

    for (const file of pending) {
      let opType: "create" | "modify" | "delete" = "modify";
      if (file.status === "created") opType = "create";
      else if (file.status === "deleted") opType = "delete";

      const result = await fileManager.applyOperation({
        type: opType,
        filePath: file.filePath,
        content: file.modifiedContent || undefined,
        diff: file.diff || undefined,
      });

      if (result.success) {
        await taskManager.updateTaskFileStatus(file.id, { status: "modified" });
      }

      results.push(result);
    }

    return c.json({ results });
  });

  // ── Agent Runs ──────────────────────

  app.get("/:id/runs", async (c) => {
    const id = c.req.param("id");
    const runs = await taskManager.getAgentRuns(id);
    return c.json({ runs });
  });

  return app;
}
