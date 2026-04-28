import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

  // ── Directory Browser ──────────────────────
  app.get("/api/browse", async (c) => {
    const dirPath = c.req.query("path") || os.homedir();
    const resolved = path.resolve(dirPath);

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return c.json({ error: "Not a directory" }, 400);
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          path: path.join(resolved, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const isGitRepo = fs.existsSync(path.join(resolved, ".git"));

      return c.json({
        current: resolved,
        parent: path.dirname(resolved),
        dirs,
        isGitRepo,
      });
    } catch {
      return c.json({ error: "Cannot read directory" }, 400);
    }
  });

  // ── Static Files (SvelteKit build) ──────────────────────
  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));

    // SPA fallback - serve index.html for all non-API routes
    app.get("*", serveStatic({ path: `${staticDir}/200.html` }));
  }

  return app;
}
