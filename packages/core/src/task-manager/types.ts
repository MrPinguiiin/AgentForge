import type { TaskStatus, AgentType, TaskFileStatus, Task, TaskFile } from "../db/schema.js";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  parentId?: string;
  status?: TaskStatus;
  priority?: number;
  agentType?: AgentType;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  agentType?: AgentType;
  metadata?: Record<string, unknown>;
}

export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
  files: TaskFile[];
}

export interface MoveTaskInput {
  taskId: string;
  newParentId: string | null;
}

export interface ReorderTaskInput {
  taskId: string;
  newSortOrder: number;
}

export interface AddTaskFileInput {
  taskId: string;
  filePath: string;
  status?: TaskFileStatus;
  originalContent?: string;
  modifiedContent?: string;
  diff?: string;
}

export interface UpdateTaskFileInput {
  status?: TaskFileStatus;
  diff?: string;
  originalContent?: string;
  modifiedContent?: string;
}
