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
  rootPath: string;
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
  dotColor: string;
  textColor: string;
  icon: string;
  highlight?: boolean;
}

export const COLUMN_CONFIG: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', dotColor: 'bg-secondary', textColor: 'text-secondary', icon: 'inventory_2' },
  { id: 'ready', title: 'Ready For Agent', dotColor: 'bg-primary-fixed-dim', textColor: 'text-on-surface', icon: 'bolt' },
  { id: 'in_progress', title: 'In Progress', dotColor: 'bg-primary', textColor: 'text-primary', icon: 'sync', highlight: true },
  { id: 'needs_human', title: 'Needs Human', dotColor: 'bg-error', textColor: 'text-error', icon: 'warning' },
  { id: 'in_review', title: 'Review', dotColor: 'bg-[#f59e0b]', textColor: 'text-on-surface', icon: 'rate_review' },
  { id: 'qa', title: 'QA', dotColor: 'bg-tertiary', textColor: 'text-on-surface', icon: 'bug_report' },
  { id: 'done', title: 'Done', dotColor: 'bg-tertiary', textColor: 'text-tertiary', icon: 'check_circle' },
  { id: 'failed', title: 'Failed', dotColor: 'bg-error', textColor: 'text-error', icon: 'error' },
];
