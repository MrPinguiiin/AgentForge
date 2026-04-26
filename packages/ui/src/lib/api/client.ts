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

export async function createProject(name: string, path: string): Promise<Project> {
  const data = await request<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, path }),
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
  priority?: number;
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

export async function updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'columnOrder'>>): Promise<Task> {
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

export async function runPipeline(taskId: string): Promise<unknown> {
  return request(`/agents/pipeline/${taskId}`, { method: 'POST' });
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
