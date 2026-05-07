import { Hono } from "hono";
import { spawn, type ChildProcess } from "node:child_process";
import type { Orchestrator } from "@ai-coder/core";

interface TerminalSession {
  id: string;
  process: ChildProcess;
  projectRoot: string;
  output: string[];
  alive: boolean;
}

const sessions = new Map<string, TerminalSession>();

export function createTerminalRoutes(orchestrator: Orchestrator) {
  const app = new Hono();

  // POST /api/terminal/exec - Execute a command in the project directory
  app.post("/exec", async (c) => {
    const body = await c.req.json();
    const { command, cwd } = body as { command: string; cwd?: string };

    if (!command || typeof command !== "string") {
      return c.json({ error: "command is required" }, 400);
    }

    // Use project root or provided cwd
    const workDir = cwd || process.env.AI_CODER_PROJECT_DIR || process.cwd();

    try {
      const result = await executeCommand(command, workDir);
      return c.json(result);
    } catch (error) {
      return c.json({
        exitCode: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/terminal/cwd - Get current working directory (project root)
  app.get("/cwd", async (c) => {
    const projectId = c.req.query("projectId");

    // If projectId provided, look up the project's root path
    if (projectId) {
      try {
        const taskManager = orchestrator.getTaskManager();
        // Try to find project in DB
        const db = orchestrator.db;
        const { projects } = await import("@ai-coder/core");
        const { eq } = await import("drizzle-orm");
        const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
        if (project?.rootPath) {
          return c.json({ cwd: project.rootPath });
        }
      } catch {
        // Fall through to default
      }
    }

    const projectRoot = process.env.AI_CODER_PROJECT_DIR || process.cwd();
    return c.json({ cwd: projectRoot });
  });

  return app;
}

function executeCommand(
  command: string,
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/bash";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    let stdout = "";
    let stderr = "";

    const proc = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      stderr += "\n[Process timed out after 30s]";
    }, 30000);

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}
