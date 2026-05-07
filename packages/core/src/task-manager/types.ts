import type { TaskStatus, AgentType, TaskFileStatus, LabelCategory, Task, TaskFile, TaskLabel } from "../db/schema.js";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  parentId?: string;
  status?: TaskStatus;
  priority?: number;
  agentType?: AgentType;
  branch?: string;
  metadata?: Record<string, unknown>;
  labels?: Array<{ category: LabelCategory; value: string }>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  status?: TaskStatus;
  priority?: number;
  agentType?: AgentType;
  branch?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export interface AddTaskLabelInput {
  taskId: string;
  category: LabelCategory;
  value: string;
}

export interface TaskWithLabels extends Task {
  labels: TaskLabel[];
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
