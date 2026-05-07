import { Hono } from "hono";
import { execSync } from "node:child_process";

export function createToolsRoutes() {
  const app = new Hono();

  // GET /api/tools/opencode-status - Check if OpenCode CLI is installed
  app.get("/opencode-status", async (c) => {
    try {
      // Try running 'opencode version' to detect installation
      const output = execSync("opencode version", {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      // Parse version from output (e.g., "opencode v1.2.3" or just "1.2.3")
      const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
      const version = versionMatch ? versionMatch[1] : output;

      // Try to get the binary path
      let binaryPath: string | undefined;
      try {
        binaryPath = execSync("which opencode", {
          encoding: "utf-8",
          timeout: 3000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      } catch {
        // 'which' might not be available on all systems
        try {
          binaryPath = execSync("command -v opencode", {
            encoding: "utf-8",
            timeout: 3000,
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
        } catch {
          // Ignore - path is optional
        }
      }

      return c.json({
        installed: true,
        version,
        path: binaryPath || undefined,
      });
    } catch {
      // opencode command not found or failed
      return c.json({
        installed: false,
        version: null,
        path: null,
      });
    }
  });

  return app;
}
