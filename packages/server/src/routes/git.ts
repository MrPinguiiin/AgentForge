import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Orchestrator } from "@ai-coder/core";

const commitSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).optional(),
  projectPath: z.string().optional(),
});

const pushSchema = z.object({
  remote: z.string().optional(),
  branch: z.string().optional(),
  projectPath: z.string().optional(),
});

export function createGitRoutes(orchestrator: Orchestrator) {
  const app = new Hono();

  // Get git status
  app.get("/status", async (c) => {
    const projectPath = c.req.query("projectPath");

    const git = orchestrator.getGitManager(projectPath || undefined);
    const status = await git.getStatus();

    return c.json({ status });
  });

  // Get git diff
  app.get("/diff", async (c) => {
    const projectPath = c.req.query("projectPath");
    const staged = c.req.query("staged") === "true";

    const git = orchestrator.getGitManager(projectPath || undefined);
    const diff = await git.getDiff(staged);

    return c.json({ diff });
  });

  // Get git log
  app.get("/log", async (c) => {
    const projectPath = c.req.query("projectPath");
    const limit = parseInt(c.req.query("limit") || "20");

    const git = orchestrator.getGitManager(projectPath || undefined);
    const log = await git.getLog(limit);

    return c.json({ log });
  });

  // Commit
  app.post("/commit", zValidator("json", commitSchema), async (c) => {
    const body = c.req.valid("json");

    const git = orchestrator.getGitManager(body.projectPath || undefined);

    if (body.files && body.files.length > 0) {
      await git.add(body.files);
    } else {
      await git.addAll();
    }

    const result = await git.commit(body.message);

    return c.json({ result });
  });

  // Push
  app.post("/push", zValidator("json", pushSchema), async (c) => {
    const body = c.req.valid("json");

    const git = orchestrator.getGitManager(body.projectPath || undefined);
    const result = await git.push(body.remote, body.branch);

    return c.json({ result });
  });

  return app;
}
