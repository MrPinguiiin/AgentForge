import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  initializeDatabase,
  TaskManager,
  ProviderRegistry,
  KanbanOrchestrator,
  TaskRouter,
} from "@ai-coder/core";
import type { TaskStatus, LabelCategory } from "@ai-coder/core";

function getDbPath(): string {
  const projectDir = process.env.AI_CODER_PROJECT_DIR || process.cwd();
  return path.join(projectDir, ".ai-coder", "ai-coder.db");
}

function getDb() {
  const dbPath = getDbPath();
  return initializeDatabase(dbPath);
}

/**
 * kanban board - Show the kanban board for a project
 */
export async function kanbanBoardCommand(options: { project?: string }) {
  const spinner = ora("Loading kanban board...").start();

  try {
    const db = getDb();
    const taskManager = new TaskManager(db);

    // Get all tasks grouped by status
    const projectId = options.project ?? "default";
    const board = await taskManager.getKanbanBoard(projectId);

    spinner.stop();

    const columns: TaskStatus[] = [
      "backlog", "ready", "in_progress", "needs_human",
      "in_review", "qa", "done", "failed",
    ];

    console.log(chalk.bold("\n📋 Kanban Board\n"));

    for (const col of columns) {
      const tasks = board[col] ?? [];
      const icon = getColumnIcon(col);
      const color = getColumnColor(col);

      console.log(color(`${icon} ${col.toUpperCase()} (${tasks.length})`));

      if (tasks.length === 0) {
        console.log(chalk.gray("   (empty)"));
      } else {
        for (const task of tasks.slice(0, 5)) {
          const labels = await taskManager.getTaskLabels(task.id);
          const labelStr = labels.map((l) => chalk.cyan(`${l.category}:${l.value}`)).join(" ");
          console.log(`   ${chalk.white(task.title)} ${labelStr}`);
          if (task.branch) {
            console.log(`     ${chalk.gray(`branch: ${task.branch}`)}`);
          }
        }
        if (tasks.length > 5) {
          console.log(chalk.gray(`   ... and ${tasks.length - 5} more`));
        }
      }
      console.log();
    }
  } catch (error) {
    spinner.fail("Failed to load kanban board");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * kanban route - Preview routing decisions for ready tasks
 */
export async function kanbanRouteCommand(options: { project?: string; taskId?: string }) {
  const spinner = ora("Analyzing routing...").start();

  try {
    const db = getDb();
    const taskManager = new TaskManager(db);
    const router = new TaskRouter();

    if (options.taskId) {
      // Route a single task
      const task = await taskManager.getTask(options.taskId);
      if (!task) {
        spinner.fail(`Task not found: ${options.taskId}`);
        process.exit(1);
      }

      const labels = await taskManager.getTaskLabels(options.taskId);
      const decision = router.route({ task, labels });

      spinner.stop();
      printRoutingDecision(decision, task.title);
    } else {
      // Route all ready tasks
      const readyTasks = await taskManager.getTasksByStatus("ready");

      if (readyTasks.length === 0) {
        spinner.info("No tasks in 'ready' status");
        return;
      }

      const cards = await Promise.all(
        readyTasks.map(async (task) => ({
          task,
          labels: await taskManager.getTaskLabels(task.id),
        }))
      );

      const decisions = router.routeBatch(cards);
      spinner.stop();

      console.log(chalk.bold(`\n🔀 Routing Decisions (${decisions.length} tasks)\n`));

      for (const decision of decisions) {
        const card = cards.find((c) => c.task.id === decision.taskId)!;
        printRoutingDecision(decision, card.task.title);
      }
    }
  } catch (error) {
    spinner.fail("Routing failed");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * kanban dispatch - Execute routing and dispatch agents
 */
export async function kanbanDispatchCommand(options: {
  project?: string;
  taskId?: string;
  dryRun?: boolean;
}) {
  if (options.dryRun) {
    console.log(chalk.yellow("🔍 Dry run mode - no changes will be made\n"));
    return kanbanRouteCommand(options);
  }

  const spinner = ora("Dispatching agents...").start();

  try {
    const db = getDb();
    const taskManager = new TaskManager(db);
    const providerRegistry = new ProviderRegistry();

    const projectRoot = process.cwd();

    const orchestrator = new KanbanOrchestrator({
      projectRoot,
      db,
      taskManager,
      providerRegistry,
    });

    // Listen to events
    orchestrator.on("task:routed", (taskId, decision) => {
      spinner.text = `Routed ${taskId} → ${decision.assignedAgent}`;
    });

    orchestrator.on("task:started", (taskId, agent) => {
      spinner.text = `Agent ${agent} working on task...`;
    });

    orchestrator.on("task:completed", (taskId, agent) => {
      spinner.succeed(`Task completed by ${agent}`);
      spinner.start();
    });

    orchestrator.on("task:failed", (taskId, agent, error) => {
      spinner.fail(`Task failed: ${error.message}`);
      spinner.start();
    });

    if (options.taskId) {
      const decision = await orchestrator.dispatchSingle(options.taskId);
      spinner.succeed(`Dispatched to ${decision.assignedAgent} on branch ${decision.branch}`);
    } else {
      const processed = await orchestrator.tick();
      spinner.succeed(`Processed ${processed} tasks`);
    }
  } catch (error) {
    spinner.fail("Dispatch failed");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * kanban add - Add a task card to the board
 */
export async function kanbanAddCommand(options: {
  project?: string;
  title: string;
  description?: string;
  criteria?: string;
  labels?: string[];
  priority?: string;
}) {
  const spinner = ora("Adding task...").start();

  try {
    const db = getDb();
    const taskManager = new TaskManager(db);

    const projectId = options.project ?? "default";

    // Parse labels from "category:value" format
    const parsedLabels: Array<{ category: LabelCategory; value: string }> = [];
    if (options.labels) {
      for (const label of options.labels) {
        const [category, value] = label.split(":");
        if (category && value) {
          parsedLabels.push({ category: category as LabelCategory, value });
        }
      }
    }

    const task = await taskManager.createTask({
      projectId,
      title: options.title,
      description: options.description,
      acceptanceCriteria: options.criteria,
      status: "backlog",
      priority: options.priority ? parseInt(options.priority) : 0,
    });

    // Add labels
    for (const label of parsedLabels) {
      await taskManager.addTaskLabel({
        taskId: task.id,
        category: label.category,
        value: label.value,
      });
    }

    spinner.succeed(`Task created: ${task.id}`);
    console.log(chalk.gray(`  Title: ${task.title}`));
    if (parsedLabels.length > 0) {
      console.log(chalk.gray(`  Labels: ${parsedLabels.map((l) => `${l.category}:${l.value}`).join(", ")}`));
    }
    console.log(chalk.gray(`  Status: backlog`));
    console.log(chalk.yellow(`\n  Use 'ai-coder kanban ready ${task.id}' to move to ready`));
  } catch (error) {
    spinner.fail("Failed to add task");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * kanban ready - Move a task to "ready for agent"
 */
export async function kanbanReadyCommand(taskId: string) {
  const spinner = ora("Moving task to ready...").start();

  try {
    const db = getDb();
    const taskManager = new TaskManager(db);

    const task = await taskManager.moveTaskToReady(taskId);
    if (!task) {
      spinner.fail(`Task not found: ${taskId}`);
      process.exit(1);
    }

    spinner.succeed(`Task "${task.title}" moved to ready`);

    // Preview routing
    const router = new TaskRouter();
    const labels = await taskManager.getTaskLabels(taskId);
    const decision = router.route({ task, labels });
    console.log(chalk.gray(`  Will be routed to: ${chalk.cyan(decision.assignedAgent)}`));
    console.log(chalk.gray(`  Branch: ${decision.branch}`));
  } catch (error) {
    spinner.fail("Failed to move task");
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// --- Helpers ---

function printRoutingDecision(decision: any, title: string) {
  const confidenceColor =
    decision.confidence === "high" ? chalk.green :
    decision.confidence === "medium" ? chalk.yellow :
    chalk.red;

  console.log(`  ${chalk.white(title)}`);
  console.log(`    Agent: ${chalk.cyan(decision.assignedAgent)}`);
  console.log(`    Branch: ${chalk.gray(decision.branch)}`);
  console.log(`    Confidence: ${confidenceColor(decision.confidence)}`);
  console.log(`    Reason: ${chalk.gray(decision.reason)}`);
  if (decision.requiresHumanReview) {
    console.log(`    ${chalk.yellow("⚠ Requires human review")}`);
  }
  if (decision.requiresPlanning) {
    console.log(`    ${chalk.blue("📋 Will run planner first")}`);
  }
  console.log();
}

function getColumnIcon(status: TaskStatus): string {
  const icons: Record<string, string> = {
    backlog: "📥",
    todo: "📝",
    ready: "🟢",
    planning: "📋",
    coding: "💻",
    in_progress: "⚡",
    needs_human: "🙋",
    in_review: "👀",
    qa: "🧪",
    done: "✅",
    cancelled: "❌",
    failed: "💥",
  };
  return icons[status] ?? "•";
}

function getColumnColor(status: TaskStatus) {
  const colors: Record<string, typeof chalk.white> = {
    backlog: chalk.gray,
    todo: chalk.white,
    ready: chalk.green,
    planning: chalk.blue,
    coding: chalk.cyan,
    in_progress: chalk.yellow,
    needs_human: chalk.magenta,
    in_review: chalk.blue,
    qa: chalk.cyan,
    done: chalk.green,
    cancelled: chalk.gray,
    failed: chalk.red,
  };
  return colors[status] ?? chalk.white;
}
