#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { configCommand } from "./commands/config.js";
import {
  kanbanBoardCommand,
  kanbanRouteCommand,
  kanbanDispatchCommand,
  kanbanAddCommand,
  kanbanReadyCommand,
} from "./commands/kanban.js";

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
  .option("-p, --port <port>", "Server port", "3001")
  .option("--no-open", "Don't open browser automatically")
  .action(startCommand);

program
  .command("config")
  .description("View or update AI Coder configuration")
  .option("--show", "Show current configuration")
  .action(configCommand);

// --- Kanban Commands ---

const kanban = program
  .command("kanban")
  .description("Kanban board and task routing operations");

kanban
  .command("board")
  .description("Show the kanban board")
  .option("--project <id>", "Project ID")
  .action(kanbanBoardCommand);

kanban
  .command("route")
  .description("Preview routing decisions for ready tasks")
  .option("--project <id>", "Project ID")
  .option("--task <id>", "Route a specific task")
  .action((opts) => kanbanRouteCommand({ project: opts.project, taskId: opts.task }));

kanban
  .command("dispatch")
  .description("Route and dispatch agents for ready tasks")
  .option("--project <id>", "Project ID")
  .option("--task <id>", "Dispatch a specific task")
  .option("--dry-run", "Preview without executing")
  .action((opts) => kanbanDispatchCommand({ project: opts.project, taskId: opts.task, dryRun: opts.dryRun }));

kanban
  .command("add")
  .description("Add a new task card to the board")
  .requiredOption("-t, --title <title>", "Task title")
  .option("-d, --description <desc>", "Task description")
  .option("-c, --criteria <criteria>", "Acceptance criteria")
  .option("-l, --labels <labels...>", "Labels in category:value format (e.g., type:frontend risk:high)")
  .option("-p, --priority <n>", "Priority (higher = more important)")
  .option("--project <id>", "Project ID")
  .action(kanbanAddCommand);

kanban
  .command("ready <taskId>")
  .description("Move a task to 'ready for agent' status")
  .action(kanbanReadyCommand);

program.parse();
