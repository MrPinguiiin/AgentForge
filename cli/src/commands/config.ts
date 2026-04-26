import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";

interface ConfigOptions {
  show?: boolean;
}

export async function configCommand(_options: ConfigOptions) {
  const projectPath = process.cwd();
  const configPath = path.join(projectPath, ".ai-coder", "config.json");

  console.log("");

  if (!fs.existsSync(configPath)) {
    console.log(chalk.red("  No configuration found."));
    console.log(
      chalk.gray("  Run"),
      chalk.cyan("ai-coder init"),
      chalk.gray("first.")
    );
    console.log("");
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  console.log(chalk.cyan.bold("  AI Coder Configuration"));
  console.log(chalk.gray("  " + configPath));
  console.log("");

  // Project info
  console.log(chalk.white("  Project:"));
  console.log(chalk.gray("    Name:      "), config.project?.name || "N/A");
  console.log(
    chalk.gray("    Framework: "),
    config.project?.framework || "N/A"
  );
  console.log(
    chalk.gray("    Language:  "),
    config.project?.language || "N/A"
  );
  console.log("");

  // Server
  console.log(chalk.white("  Server:"));
  console.log(chalk.gray("    Port: "), config.server?.port || 3000);
  console.log("");

  // AI Agents
  console.log(chalk.white("  AI Agents:"));
  const agents = config.ai?.agents || {};
  for (const [name, agentConfig] of Object.entries(agents)) {
    const ac = agentConfig as Record<string, unknown>;
    console.log(
      chalk.gray(`    ${name}:`),
      chalk.green(String(ac.provider)),
      chalk.white("/"),
      chalk.cyan(String(ac.model)),
      chalk.gray(`(temp: ${ac.temperature}, max: ${ac.maxTokens})`)
    );
  }
  console.log("");

  // Environment variables
  console.log(chalk.white("  Environment Variables:"));
  const envVars = [
    "AI_CODER_OPENAI_KEY",
    "AI_CODER_ANTHROPIC_KEY",
    "AI_CODER_OPENROUTER_KEY",
    "AI_CODER_PORT",
  ];
  for (const v of envVars) {
    const value = process.env[v];
    console.log(
      chalk.gray(`    ${v}:`),
      value ? chalk.green("set") : chalk.yellow("not set")
    );
  }
  console.log("");
}
