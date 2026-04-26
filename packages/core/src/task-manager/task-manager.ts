import { eq, and, asc, desc } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { nanoid } from "nanoid";
import * as schema from "../db/schema.js";
import {
  tasks,
  taskFiles,
  agentRuns,
  type Task,
  type TaskFile,
  type AgentRun,
  type AgentType,
} from "../db/schema.js";
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskWithSubtasks,
  MoveTaskInput,
  ReorderTaskInput,
  AddTaskFileInput,
  UpdateTaskFileInput,
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
        status: input.status ?? "backlog",
        priority: input.priority ?? 0,
        agentType: input.agentType ?? null,
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
}
