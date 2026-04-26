import { Hono } from "hono";
import type { Orchestrator } from "@ai-coder/core";

export function createAgentRoutes(orchestrator: Orchestrator) {
  const app = new Hono();

  // Get a specific agent run by ID
  app.get("/runs/:id", async (c) => {
    return c.json({ error: "Use /api/tasks/:taskId/runs to access agent runs" }, 400);
  });

  // Get agent configuration
  app.get("/config", async (c) => {
    try {
      const providerRegistry = orchestrator.getProviderRegistry();
      return c.json({
        agents: {
          planner: providerRegistry.getAgentConfig("planner"),
          coder: providerRegistry.getAgentConfig("coder"),
          reviewer: providerRegistry.getAgentConfig("reviewer"),
        },
      });
    } catch {
      return c.json({ agents: {} });
    }
  });

  // Run full pipeline on a task
  app.post("/pipeline/:taskId", async (c) => {
    const taskId = c.req.param("taskId");

    try {
      orchestrator.runFullPipeline(taskId).catch((error: unknown) => {
        console.error(`Pipeline failed for task ${taskId}:`, error);
      });

      return c.json({ message: "Pipeline started", taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
