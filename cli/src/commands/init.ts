import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { initializeDatabase, ProjectScanner } from "@ai-coder/core";

interface InitOptions {
  name?: string;
  path?: string;
}

export async function initCommand(options: InitOptions) {
  // Use AI_CODER_PROJECT_DIR if set by wrapper, otherwise use cwd
  const projectPath = path.resolve(options.path || process.env.AI_CODER_PROJECT_DIR || process.cwd());
  const projectName = options.name || path.basename(projectPath);

  console.log("");
  console.log(chalk.cyan.bold("  AI Coder - Project Initialization"));
  console.log("");

  // Check if already initialized
  const aiCoderDir = path.join(projectPath, ".ai-coder");
  if (fs.existsSync(aiCoderDir)) {
    console.log(chalk.yellow("  Project already initialized at:"), projectPath);
    console.log(
      chalk.gray("  Run"),
      chalk.white("ai-coder start"),
      chalk.gray("to begin.")
    );
    console.log("");
    return;
  }

  // Create .ai-coder directory
  const spinner = ora("Creating .ai-coder directory...").start();
  fs.mkdirSync(aiCoderDir, { recursive: true });
  spinner.succeed("Created .ai-coder directory");

  // Detect framework
  const scanner = new ProjectScanner(projectPath);
  const frameworkSpinner = ora("Detecting project framework...").start();
  const framework = await scanner.detectFramework();
  const language = await scanner.detectLanguage();
  frameworkSpinner.succeed(
    `Detected: ${chalk.green(framework?.name || "unknown")} (${language})`
  );

  // Initialize database
  const dbSpinner = ora("Initializing database...").start();
  const dbPath = path.join(aiCoderDir, "ai-coder.db");
  initializeDatabase(dbPath);
  dbSpinner.succeed("Database initialized");

  // Create default config
  const configSpinner = ora("Creating configuration...").start();
  const defaultConfig = {
    project: {
      name: projectName,
      path: projectPath,
      framework: framework?.name || "unknown",
      language: language,
    },
    server: {
      port: 3000,
      host: "localhost",
    },
    ai: {
      defaultProvider: "openai",
      providers: {
        openai: { apiKey: "" },
        anthropic: { apiKey: "" },
        openrouter: { apiKey: "" },
      },
      agents: {
        planner: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 4096,
        },
        coder: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          temperature: 0.2,
          maxTokens: 8192,
        },
        reviewer: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          temperature: 0.1,
          maxTokens: 4096,
        },
      },
    },
    context: {
      maxContextFiles: 20,
      maxFileSize: 50000,
      ignorePatterns: [
        "node_modules",
        ".git",
        "dist",
        "build",
        ".next",
        "*.lock",
        "*.min.js",
        "*.map",
      ],
    },
    git: {
      autoCommit: true,
      autoPush: false,
      commitPrefix: "ai-coder:",
    },
  };

  fs.writeFileSync(
    path.join(aiCoderDir, "config.json"),
    JSON.stringify(defaultConfig, null, 2)
  );
  configSpinner.succeed("Configuration created");

  // Add .ai-coder to .gitignore if it exists
  const gitignorePath = path.join(projectPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".ai-coder")) {
      fs.appendFileSync(gitignorePath, "\n# AI Coder\n.ai-coder/\n");
      console.log(chalk.gray("  Added .ai-coder/ to .gitignore"));
    }
  }

  console.log("");
  console.log(chalk.green.bold("  Project initialized successfully!"));
  console.log("");
  console.log(chalk.gray("  Next steps:"));
  console.log(
    chalk.white("  1."),
    chalk.gray("Set your API key:"),
    chalk.cyan("export AI_CODER_OPENAI_KEY=sk-...")
  );
  console.log(
    chalk.white("  2."),
    chalk.gray("Start the server:"),
    chalk.cyan("ai-coder start")
  );
  console.log("");
}
