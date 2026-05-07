export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'ready'
  | 'planning'
  | 'coding'
  | 'in_progress'
  | 'needs_human'
  | 'in_review'
  | 'qa'
  | 'done'
  | 'cancelled'
  | 'failed';

export type AgentType =
  | 'planner'
  | 'coder'
  | 'reviewer'
  | 'frontend'
  | 'backend'
  | 'debugger'
  | 'qa'
  | 'docs'
  | 'explore';

export type LabelCategory = 'type' | 'risk' | 'scope' | 'area' | 'priority';

export interface Project {
  id: string;
  name: string;
  path: string;
  framework?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLabel {
  id: string;
  taskId: string;
  category: LabelCategory;
  value: string;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  status: TaskStatus;
  priority: number;
  sortOrder: number;
  agentType?: AgentType | null;
  branch?: string | null;
  retryCount?: number;
  subtasks?: Task[];
  labels?: TaskLabel[];
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
  agentType: AgentType;
  status: 'running' | 'completed' | 'failed';
  input?: string | null;
  output?: string | null;
  tokensUsed?: number | null;
  durationMs?: number | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface RoutingDecision {
  taskId: string;
  assignedAgent: AgentType;
  requiresHumanReview: boolean;
  requiresPlanning: boolean;
  branch: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
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
  icon: string;
  badgeVariant: 'default' | 'info' | 'warning' | 'success' | 'danger';
}

export const COLUMN_CONFIG: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', color: 'text-muted', icon: '📥', badgeVariant: 'default' },
  { id: 'ready', title: 'Ready for Agent', color: 'text-success', icon: '🟢', badgeVariant: 'success' },
  { id: 'in_progress', title: 'In Progress', color: 'text-warning', icon: '⚡', badgeVariant: 'warning' },
  { id: 'needs_human', title: 'Needs Human', color: 'text-danger', icon: '🙋', badgeVariant: 'danger' },
  { id: 'in_review', title: 'Review', color: 'text-info', icon: '👀', badgeVariant: 'info' },
  { id: 'qa', title: 'QA', color: 'text-info', icon: '🧪', badgeVariant: 'info' },
  { id: 'done', title: 'Done', color: 'text-success', icon: '✅', badgeVariant: 'success' },
  { id: 'failed', title: 'Failed', color: 'text-danger', icon: '💥', badgeVariant: 'danger' },
];
