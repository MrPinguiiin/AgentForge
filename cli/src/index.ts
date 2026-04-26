#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("ai-coder")
  .description("Local AI Coding Orchestrator - Multi-agent pipeline system")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize AI Coder in the current project directory")
  .option("-n, --name <name>", "Project name")
  .option("-p, --path <path>", "Project path (defaults to current directory)")
  .action(initCommand);

program
  .command("start")
  .description("Start the AI Coder server and open the browser")
  .option("-p, --port <port>", "Server port", "3000")
  .option("--no-open", "Don't open browser automatically")
  .action(startCommand);

program
  .command("config")
  .description("View or update AI Coder configuration")
  .option("--show", "Show current configuration")
  .action(configCommand);

program.parse();
