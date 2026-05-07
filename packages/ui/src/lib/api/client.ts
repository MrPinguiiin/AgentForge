import type { Project, Task, TaskFile, AgentRun, TaskStatus } from '../types/index.js';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Projects ──────────────────────

export async function listProjects(): Promise<Project[]> {
  const data = await request<{ projects: Project[] }>('/projects');
  return data.projects;
}

export async function createProject(name: string, rootPath: string): Promise<Project> {
  const data = await request<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, rootPath }),
  });
  return data.project;
}

export async function getProject(id: string): Promise<Project> {
  const data = await request<{ project: Project }>(`/projects/${id}`);
  return data.project;
}

export async function updateProject(id: string, name: string): Promise<Project> {
  const data = await request<{ project: Project }>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/projects/${id}`, { method: 'DELETE' });
}

export async function scanProject(id: string): Promise<{ tree: unknown; framework: unknown }> {
  return request(`/projects/${id}/scan`, { method: 'POST' });
}

// ── Tasks ──────────────────────

export async function listTasks(projectId: string, status?: TaskStatus): Promise<Task[]> {
  const params = new URLSearchParams({ projectId });
  if (status) params.set('status', status);
  const data = await request<{ tasks: Task[] }>(`/tasks?${params}`);
  return data.tasks;
}

export async function createTask(task: {
  projectId: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  priority?: number;
  labels?: Array<{ category: string; value: string }>;
}): Promise<Task> {
  const data = await request<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  });
  return data.task;
}

export async function getTask(id: string): Promise<{ task: Task; files: TaskFile[]; runs: AgentRun[] }> {
  return request(`/tasks/${id}`);
}

export async function updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'sortOrder'>>): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return data.task;
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/tasks/${id}`, { method: 'DELETE' });
}

export async function moveTask(id: string, status: TaskStatus, order?: number): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, order }),
  });
  return data.task;
}

export async function reorderTask(id: string, order: number): Promise<Task> {
  const data = await request<{ task: Task }>(`/tasks/${id}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ order }),
  });
  return data.task;
}

// ── Pipeline Actions ──────────────────────

export async function planTask(id: string): Promise<unknown> {
  return request(`/tasks/${id}/plan`, { method: 'POST' });
}

export async function codeTask(id: string): Promise<unknown> {
  return request(`/tasks/${id}/code`, { method: 'POST' });
}

export async function reviewTask(id: string): Promise<unknown> {
  return request(`/tasks/${id}/review`, { method: 'POST' });
}

export async function publishTask(id: string, options?: { commitMessage?: string; push?: boolean }): Promise<unknown> {
  return request(`/tasks/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function runPipeline(taskId: string, autoReview = false): Promise<unknown> {
  return request(`/agents/pipeline/${taskId}`, {
    method: 'POST',
    body: JSON.stringify({ autoReview }),
  });
}

export async function acceptTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/accept`, { method: 'POST' });
}

export async function declineTask(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/decline`, { method: 'POST' });
}

// ── Task Files ──────────────────────

export async function getTaskFiles(taskId: string): Promise<TaskFile[]> {
  const data = await request<{ files: TaskFile[] }>(`/tasks/${taskId}/files`);
  return data.files;
}

export async function applyFile(taskId: string, fileId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/files/${fileId}/apply`, { method: 'POST' });
}

export async function rejectFile(taskId: string, fileId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/files/${fileId}/reject`, { method: 'POST' });
}

export async function applyAllFiles(taskId: string): Promise<unknown> {
  return request(`/tasks/${taskId}/files/apply-all`, { method: 'POST' });
}

// ── Agent Runs ──────────────────────

export async function getAgentRuns(taskId: string): Promise<AgentRun[]> {
  const data = await request<{ runs: AgentRun[] }>(`/tasks/${taskId}/runs`);
  return data.runs;
}

// ── Git ──────────────────────

export async function getGitStatus(projectId: string): Promise<unknown> {
  const data = await request<{ status: unknown }>(`/git/status?projectId=${projectId}`);
  return data.status;
}

export async function getGitDiff(projectId: string): Promise<string> {
  const data = await request<{ diff: string }>(`/git/diff?projectId=${projectId}`);
  return data.diff;
}

export async function getGitLog(projectId: string, limit = 20): Promise<unknown> {
  const data = await request<{ log: unknown }>(`/git/log?projectId=${projectId}&limit=${limit}`);
  return data.log;
}

export async function gitCommit(projectId: string, message: string, files?: string[]): Promise<unknown> {
  return request('/git/commit', {
    method: 'POST',
    body: JSON.stringify({ projectId, message, files }),
  });
}

export async function gitPush(projectId: string, remote?: string, branch?: string): Promise<unknown> {
  return request('/git/push', {
    method: 'POST',
    body: JSON.stringify({ projectId, remote, branch }),
  });
}

// ── Config ──────────────────────

export async function getConfig(): Promise<unknown> {
  const data = await request<{ config: unknown }>('/config');
  return data.config;
}

export async function updateConfig(config: unknown): Promise<void> {
  await request('/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getModels(): Promise<unknown> {
  const data = await request<{ models: unknown }>('/config/models');
  return data.models;
}

export async function testProvider(provider: string): Promise<unknown> {
  return request('/config/test-provider', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  });
}

// ── Custom Providers ──────────────────────

export async function addCustomProvider(provider: {
  id: string;
  name: string;
  apiKey: string;
  baseURL: string;
}): Promise<void> {
  await request('/config/providers', {
    method: 'POST',
    body: JSON.stringify(provider),
  });
}

export async function deleteCustomProvider(id: string): Promise<void> {
  await request(`/config/providers/${id}`, { method: 'DELETE' });
}

export async function fetchProviderModels(
  providerId: string
): Promise<{ id: string; name: string; tier: string }[]> {
  const data = await request<{ models: { id: string; name: string; tier: string }[] }>(
    `/config/providers/${providerId}/models`
  );
  return data.models;
}

// ── Tools / Status Checks ──────────────────────

export interface OpenCodeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export async function checkOpenCodeStatus(): Promise<OpenCodeStatus> {
  try {
    return await request<OpenCodeStatus>('/tools/opencode-status');
  } catch {
    // If server is unreachable, assume not installed
    return { installed: false, version: null, path: null };
  }
}

// ── Terminal ──────────────────────

export interface TerminalExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function terminalExec(command: string, cwd?: string): Promise<TerminalExecResult> {
  return request<TerminalExecResult>('/terminal/exec', {
    method: 'POST',
    body: JSON.stringify({ command, cwd }),
  });
}

export async function terminalCwd(): Promise<{ cwd: string }> {
  return request<{ cwd: string }>('/terminal/cwd');
}

// ── Directory Browser ──────────────────────

export interface BrowseResult {
  current: string;
  parent: string;
  dirs: { name: string; path: string }[];
  isGitRepo: boolean;
}

export async function browseDirectory(dirPath?: string): Promise<BrowseResult> {
  const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return request<BrowseResult>(`/browse${params}`);
}

// ── Pipeline (TaskHive) ──────────────────────

export interface PipelineJobResult {
  success: boolean;
  jobId?: string;
  status?: string;
  message?: string;
  error?: string;
}

export interface PlanningResult {
  summary: string;
  needs_human: boolean;
  human_questions: string[];
  risk_level: 'low' | 'medium' | 'high';
  recommended_agent: string;
  recommended_subagents: string[];
  files_to_inspect: string[];
  likely_files_to_change: string[];
  implementation_steps: string[];
  test_plan: string[];
  acceptance_checklist: string[];
  routing_decision: {
    next_column: string;
    reason: string;
  };
}

export interface TaskPlan {
  id: string;
  summary: string | null;
  planJson: PlanningResult;
  recommendedAgent: string | null;
  riskLevel: string | null;
  needsHuman: boolean | null;
  approved: boolean | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  runType: 'planning' | 'execution' | 'review' | 'qa';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  agentName: string | null;
  command: string | null;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  error: string | null;
  tokensUsed: number | null;
  durationMs: number | null;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface TaskArtifact {
  id: string;
  taskId: string;
  runId: string;
  artifactType: 'git_status' | 'git_diff_stat' | 'git_diff' | 'test_log' | 'final_summary' | 'planning_json' | 'review_verdict' | 'qa_report';
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Run planning for a task in backlog */
export async function runPlanning(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/run-planning`, { method: 'POST' });
}

/** Get the latest plan for a task (plan is null if none exists yet) */
export async function getTaskPlan(taskId: string): Promise<{ taskId: string; plan: TaskPlan | null }> {
  return request<{ taskId: string; plan: TaskPlan | null }>(`/pipeline/${taskId}/plan`);
}

/** Approve a plan and start execution */
export async function approvePlan(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/approve-plan`, { method: 'POST' });
}

/** Retry planning for a task */
export async function retryPlanning(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/retry-planning`, { method: 'POST' });
}

/** Cancel a task and all its jobs */
export async function cancelTask(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/cancel`, { method: 'POST' });
}

/** Run AI review on a task */
export async function runReviewPipeline(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/run-review`, { method: 'POST' });
}

/** Run QA on a task */
export async function runQAPipeline(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/run-qa`, { method: 'POST' });
}

/** Accept review and move to QA */
export async function acceptReviewPipeline(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/accept-review`, { method: 'POST' });
}

/** Decline review */
export async function declineReviewPipeline(taskId: string): Promise<PipelineJobResult> {
  return request<PipelineJobResult>(`/pipeline/${taskId}/decline-review`, { method: 'POST' });
}

/** Get all runs for a task */
export async function getTaskRuns(taskId: string): Promise<{ runs: TaskRun[] }> {
  return request<{ runs: TaskRun[] }>(`/pipeline/${taskId}/runs`);
}

/** Get all artifacts for a task */
export async function getTaskArtifacts(taskId: string): Promise<{ artifacts: TaskArtifact[] }> {
  return request<{ artifacts: TaskArtifact[] }>(`/pipeline/${taskId}/artifacts`);
}

/** Get queue stats */
export async function getQueueStats(): Promise<{ stats: Record<string, number> }> {
  return request<{ stats: Record<string, number> }>('/pipeline/queue/stats');
}
