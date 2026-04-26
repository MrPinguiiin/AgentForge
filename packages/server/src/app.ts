import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Orchestrator } from "@ai-coder/core";
import { createProjectRoutes } from "./routes/projects.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createGitRoutes } from "./routes/git.js";
import { createConfigRoutes } from "./routes/config.js";
import { createAgentRoutes } from "./routes/agents.js";
import { errorHandler } from "./middleware/error.js";
import { requestLogger } from "./middleware/logger.js";

export function createApp(orchestrator: Orchestrator, staticDir?: string) {
  const app = new Hono();

  // ── Middleware ──────────────────────
  app.use("*", cors());
  app.use("*", errorHandler);
  app.use("/api/*", requestLogger);

  // ── API Routes ──────────────────────
  app.route("/api/projects", createProjectRoutes(orchestrator));
  app.route("/api/tasks", createTaskRoutes(orchestrator));
  app.route("/api/git", createGitRoutes(orchestrator));
  app.route("/api/config", createConfigRoutes(orchestrator));
  app.route("/api/agents", createAgentRoutes(orchestrator));

  // ── Health Check ──────────────────────
  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    });
  });

  // ── Static Files (SvelteKit build) ──────────────────────
  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));

    // SPA fallback - serve index.html for all non-API routes
    app.get("*", serveStatic({ path: `${staticDir}/200.html` }));
  }

  return app;
}
