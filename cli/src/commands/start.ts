import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";

interface StartOptions {
  port: string;
  open: boolean;
}

export async function startCommand(options: StartOptions) {
  const port = parseInt(options.port);
  const projectPath = process.cwd();
  const aiCoderDir = path.join(projectPath, ".ai-coder");

  console.log("");

  // Check if initialized
  if (!fs.existsSync(aiCoderDir)) {
    console.log(chalk.red("  Project not initialized."));
    console.log(
      chalk.gray("  Run"),
      chalk.cyan("ai-coder init"),
      chalk.gray("first.")
    );
    console.log("");
    process.exit(1);
  }

  // Load config
  const configPath = path.join(aiCoderDir, "config.json");
  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }

  const spinner = ora("Starting AI Coder server...").start();

  try {
    // Dynamic import to avoid loading heavy deps at CLI parse time
    const { startServer } = await import("@ai-coder/server");

    const dbPath = path.join(aiCoderDir, "ai-coder.db");

    // Try to find the UI build directory
    let staticDir: string | undefined;
    const possibleUIDirs = [
      path.join(projectPath, "node_modules/@ai-coder/ui/build"),
      path.resolve(__dirname, "../../packages/ui/build"),
      path.resolve(__dirname, "../../../packages/ui/build"),
    ];

    for (const dir of possibleUIDirs) {
      if (fs.existsSync(dir)) {
        staticDir = dir;
        break;
      }
    }

    const server = await startServer({
      port,
      host: "localhost",
      dbPath,
      staticDir,
      aiConfig: (config as Record<string, unknown>).ai as any,
    });

    // Use the actual port (may differ from requested if auto-detected)
    const actualPort = server.port;

    if (actualPort !== port) {
      spinner.succeed(
        `Server started on port ${actualPort} (port ${port} was in use)`
      );
    } else {
      spinner.succeed(`Server started on port ${actualPort}`);
    }

    // Open browser on the actual port
    if (options.open !== false) {
      try {
        const open = (await import("open")).default;
        await open(`http://localhost:${actualPort}`);
      } catch {
        // Silently fail if can't open browser
      }
    }
  } catch (error) {
    spinner.fail("Failed to start server");
    console.error(
      chalk.red(
        `  ${error instanceof Error ? error.message : String(error)}`
      )
    );
    process.exit(1);
  }
}
