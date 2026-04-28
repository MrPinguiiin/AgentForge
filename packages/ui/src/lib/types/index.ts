export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'published';

export interface Project {
  id: string;
  name: string;
  path: string;
  framework?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: number;
  columnOrder: number;
  subtasks?: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskFile {
  id: string;
  taskId: string;
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  diff?: string | null;
  newContent?: string | null;
  originalContent?: string | null;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
}

export interface AgentRun {
  id: string;
  taskId: string;
  agentType: 'planner' | 'coder' | 'reviewer';
  status: 'running' | 'completed' | 'failed';
  input?: string | null;
  output?: string | null;
  tokensUsed?: number | null;
  durationMs?: number | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface ColumnConfig {
  id: TaskStatus;
  title: string;
  color: string;
  badgeVariant: 'default' | 'info' | 'warning' | 'success';
}

export const COLUMN_CONFIG: ColumnConfig[] = [
  { id: 'todo', title: 'To Do', color: 'text-text-muted', badgeVariant: 'default' },
  { id: 'in_progress', title: 'In Progress', color: 'text-info', badgeVariant: 'info' },
  { id: 'in_review', title: 'In Review', color: 'text-warning', badgeVariant: 'warning' },
  { id: 'done', title: 'Done', color: 'text-success', badgeVariant: 'success' },
  { id: 'published', title: 'Published', color: 'text-success', badgeVariant: 'success' },
];
