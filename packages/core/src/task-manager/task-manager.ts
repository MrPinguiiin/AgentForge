import { eq, and, asc, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";
import * as schema from "../db/schema.js";
import {
  tasks,
  taskFiles,
  taskLabels,
  agentRuns,
  type Task,
  type TaskFile,
  type TaskLabel,
  type AgentRun,
  type AgentType,
  type TaskStatus,
  type LabelCategory,
} from "../db/schema.js";
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithSubtasks,
  MoveTaskInput,
  ReorderTaskInput,
  AddTaskFileInput,
  UpdateTaskFileInput,
  AddTaskLabelInput,
} from "./types.js";

export class TaskManager {
  constructor(private db: BunSQLiteDatabase<typeof schema>) {}

  // --- Task CRUD ---

  async createTask(input: CreateTaskInput): Promise<Task> {
    const id = nanoid();
    const now = new Date();

    const [task] = await this.db
      .insert(tasks)
      .values({
        id,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        title: input.title,
        description: input.description ?? null,
        acceptanceCriteria: input.acceptanceCriteria ?? null,
        status: input.status ?? "backlog",
        priority: input.priority ?? 0,
        agentType: input.agentType ?? null,
        branch: input.branch ?? null,
        metadata: input.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return task;
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    return task;
  }

  async getTaskWithSubtasks(taskId: string): Promise<TaskWithSubtasks | undefined> {
    const task = await this.getTask(taskId);
    if (!task) return undefined;

    const subtasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.parentId, taskId))
      .orderBy(asc(tasks.sortOrder));

    const files = await this.getTaskFiles(taskId);

    return { ...task, subtasks, files };
  }

  async listTasks(
    projectId: string,
    options?: { status?: schema.TaskStatus; parentId?: string | null }
  ): Promise<Task[]> {
    let query = this.db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.sortOrder), desc(tasks.priority));

    // Additional filtering is done in-memory for simplicity with drizzle
    const allTasks = await query;

    return allTasks.filter((t) => {
      if (options?.status && t.status !== options.status) return false;
      if (options?.parentId !== undefined && t.parentId !== options.parentId) return false;
      return true;
    });
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<Task | undefined> {
    const [updated] = await this.db
      .update(tasks)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return updated;
  }

  async moveTask(input: MoveTaskInput): Promise<Task | undefined> {
    const [updated] = await this.db
      .update(tasks)
      .set({
        parentId: input.newParentId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId))
      .returning();

    return updated;
  }

  async reorderTask(input: ReorderTaskInput): Promise<Task | undefined> {
    const [updated] = await this.db
      .update(tasks)
      .set({
        sortOrder: input.newSortOrder,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, input.taskId))
      .returning();

    return updated;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.db
      .delete(tasks)
      .where(eq(tasks.id, taskId))
      .returning();

    return result.length > 0;
  }

  // --- Task Files ---

  async getTaskFiles(taskId: string): Promise<TaskFile[]> {
    return this.db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.taskId, taskId))
      .orderBy(asc(taskFiles.filePath));
  }

  async addTaskFile(input: AddTaskFileInput): Promise<TaskFile> {
    const id = nanoid();
    const now = new Date();

    const [file] = await this.db
      .insert(taskFiles)
      .values({
        id,
        taskId: input.taskId,
        filePath: input.filePath,
        status: input.status ?? "pending",
        originalContent: input.originalContent ?? null,
        modifiedContent: input.modifiedContent ?? null,
        diff: input.diff ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return file;
  }

  async updateTaskFileStatus(
    fileId: string,
    input: UpdateTaskFileInput
  ): Promise<TaskFile | undefined> {
    const [updated] = await this.db
      .update(taskFiles)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(taskFiles.id, fileId))
      .returning();

    return updated;
  }

  // --- Agent Runs ---

  async getAgentRuns(taskId: string): Promise<AgentRun[]> {
    return this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.taskId, taskId))
      .orderBy(desc(agentRuns.startedAt));
  }

  async createAgentRun(
    taskId: string,
    agentType: AgentType,
    model?: string,
    input?: Record<string, unknown>
  ): Promise<AgentRun> {
    const id = nanoid();
    const now = new Date();

    const [run] = await this.db
      .insert(agentRuns)
      .values({
        id,
        taskId,
        agentType,
        status: "running",
        model: model ?? null,
        input: input ?? null,
        startedAt: now,
      })
      .returning();

    return run;
  }

  async completeAgentRun(
    runId: string,
    output: Record<string, unknown>,
    tokensUsed?: number
  ): Promise<AgentRun | undefined> {
    const now = new Date();
    const run = await this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);

    const durationMs = run[0]
      ? now.getTime() - run[0].startedAt.getTime()
      : undefined;

    const [updated] = await this.db
      .update(agentRuns)
      .set({
        status: "completed",
        output,
        tokensUsed: tokensUsed ?? null,
        durationMs: durationMs ?? null,
        completedAt: now,
      })
      .where(eq(agentRuns.id, runId))
      .returning();

    return updated;
  }

  async failAgentRun(runId: string, error: string): Promise<AgentRun | undefined> {
    const now = new Date();
    const run = await this.db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runId))
      .limit(1);

    const durationMs = run[0]
      ? now.getTime() - run[0].startedAt.getTime()
      : undefined;

    const [updated] = await this.db
      .update(agentRuns)
      .set({
        status: "failed",
        error,
        durationMs: durationMs ?? null,
        completedAt: now,
      })
      .where(eq(agentRuns.id, runId))
      .returning();

    return updated;
  }

  // --- Task Labels ---

  async getTaskLabels(taskId: string): Promise<TaskLabel[]> {
    return this.db
      .select()
      .from(taskLabels)
      .where(eq(taskLabels.taskId, taskId));
  }

  async addTaskLabel(input: AddTaskLabelInput): Promise<TaskLabel> {
    const id = nanoid();
    const now = new Date();

    const [label] = await this.db
      .insert(taskLabels)
      .values({
        id,
        taskId: input.taskId,
        category: input.category,
        value: input.value,
        createdAt: now,
      })
      .returning();

    return label;
  }

  async removeTaskLabel(taskId: string, category: LabelCategory, value: string): Promise<boolean> {
    const result = await this.db
      .delete(taskLabels)
      .where(
        and(
          eq(taskLabels.taskId, taskId),
          eq(taskLabels.category, category),
          eq(taskLabels.value, value)
        )
      )
      .returning();

    return result.length > 0;
  }

  async setTaskLabels(taskId: string, labels: Array<{ category: LabelCategory; value: string }>): Promise<TaskLabel[]> {
    // Remove all existing labels
    await this.db
      .delete(taskLabels)
      .where(eq(taskLabels.taskId, taskId));

    // Add new labels
    const results: TaskLabel[] = [];
    for (const label of labels) {
      const created = await this.addTaskLabel({
        taskId,
        category: label.category,
        value: label.value,
      });
      results.push(created);
    }

    return results;
  }

  // --- Kanban Queries ---

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(desc(tasks.priority), asc(tasks.sortOrder));
  }

  async getTasksByStatusForProject(projectId: string, status: TaskStatus): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)))
      .orderBy(desc(tasks.priority), asc(tasks.sortOrder));
  }

  async moveTaskToReady(taskId: string): Promise<Task | undefined> {
    return this.updateTask(taskId, { status: "ready" });
  }

  async moveTaskToBacklog(taskId: string): Promise<Task | undefined> {
    return this.updateTask(taskId, { status: "backlog" });
  }

  async getKanbanBoard(projectId: string): Promise<Record<TaskStatus, Task[]>> {
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(desc(tasks.priority), asc(tasks.sortOrder));

    const board: Record<string, Task[]> = {
      backlog: [],
      todo: [],
      ready: [],
      planning: [],
      coding: [],
      in_progress: [],
      needs_human: [],
      in_review: [],
      qa: [],
      done: [],
      cancelled: [],
      failed: [],
    };

    for (const task of allTasks) {
      if (board[task.status]) {
        board[task.status].push(task);
      }
    }

    return board as Record<TaskStatus, Task[]>;
  }
}
