export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'ready'
  | 'planning_queued'
  | 'planned'
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

export type ReviewMode = 'auto' | 'human';
export type ApprovalMode = 'auto' | 'manual';
export type NeedsHumanReason = 'plan_review' | 'code_review' | 'high_risk';

export interface BatchRunSettings {
  reviewMode: ReviewMode;
  approvalMode: ApprovalMode;
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
  reviewMode?: ReviewMode | null;
  approvalMode?: ApprovalMode | null;
  needsHumanReason?: NeedsHumanReason | null;
  batchId?: string | null;
  executionOrder?: number;
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
  /** Additional statuses that map to this column */
  extraStatuses?: TaskStatus[];
}

export const COLUMN_CONFIG: ColumnConfig[] = [
  { id: 'backlog', title: 'Backlog', dotColor: 'bg-muted-foreground', textColor: 'text-muted-foreground', icon: 'inventory_2', extraStatuses: ['planning_queued', 'planned'] },
  { id: 'planning', title: 'Planning', dotColor: 'bg-primary', textColor: 'text-primary', icon: 'psychology', highlight: true },
  { id: 'in_progress', title: 'In Progress', dotColor: 'bg-primary', textColor: 'text-primary', icon: 'sync', highlight: true },
  { id: 'needs_human', title: 'Need Human', dotColor: 'bg-destructive', textColor: 'text-destructive', icon: 'front_hand' },
  { id: 'in_review', title: 'Review', dotColor: 'bg-chart-1', textColor: 'text-foreground', icon: 'rate_review' },
  { id: 'qa', title: 'QA', dotColor: 'bg-chart-2', textColor: 'text-foreground', icon: 'bug_report' },
  { id: 'done', title: 'Done', dotColor: 'bg-chart-1', textColor: 'text-chart-1', icon: 'check_circle' },
  { id: 'failed', title: 'Failed', dotColor: 'bg-destructive', textColor: 'text-destructive', icon: 'error' },
];
