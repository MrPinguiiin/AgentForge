import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { Orchestrator } from "@ai-coder/core";
import { projects } from "@ai-coder/core";

const createProjectSchema = z.object({
  name: z.string().min(1),
  rootPath: z.string().min(1),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export function createProjectRoutes(orchestrator: Orchestrator) {
  const app = new Hono();
  const db = (orchestrator as any).db;

  // List all projects
  app.get("/", async (c) => {
    const result = await db.select().from(projects);
    return c.json({ projects: result });
  });

  // Create project
  app.post("/", zValidator("json", createProjectSchema), async (c) => {
    const body = c.req.valid("json");
    const now = new Date();

    // Detect framework using ProjectScanner
    const scanner = orchestrator.getProjectScanner();
    const framework = await scanner.detectFramework();
    const language = await scanner.detectLanguage();

    const project = {
      id: nanoid(),
      name: body.name,
      rootPath: body.rootPath,
      description: body.description ?? null,
      framework: framework?.name ?? null,
      language: language,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(projects).values(project);

    return c.json({ project }, 201);
  });

  // Get project by ID
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (result.length === 0) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({ project: result[0] });
  });

  // Update project
  app.put("/:id", zValidator("json", updateProjectSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    await db
      .update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(projects.id, id));

    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    return c.json({ project: result[0] });
  });

  // Delete project
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(projects).where(eq(projects.id, id));
    return c.json({ success: true });
  });

  // Scan project structure
  app.post("/:id/scan", async (c) => {
    const id = c.req.param("id");

    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (result.length === 0) {
      return c.json({ error: "Project not found" }, 404);
    }

    const project = result[0];

    const fileManager = orchestrator.getFileManager();
    const tree = await fileManager.scanProject();

    const scanner = orchestrator.getProjectScanner();
    const framework = await scanner.detectFramework();
    const language = await scanner.detectLanguage();

    // Update project with detected info
    await db
      .update(projects)
      .set({
        framework: framework?.name ?? null,
        language: language,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    return c.json({ tree, framework });
  });

  return app;
}
