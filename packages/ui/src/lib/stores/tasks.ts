import { writable, derived, get } from 'svelte/store';
import type { Project, Task, TaskFile, AgentRun, TaskStatus } from '../types/index.js';
import * as api from '../api/client.js';

// ── Persistence ──────────────────────

const PROJECT_STORAGE_KEY = 'ai-coder:currentProjectId';

function persistProjectId(id: string): void {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, id);
  } catch {
    // localStorage might not be available
  }
}

export function getPersistedProjectId(): string | null {
  try {
    return localStorage.getItem(PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

// ── Core Stores ──────────────────────

export const currentProject = writable<Project | null>(null);
export const projects = writable<Project[]>([]);
export const allTasks = writable<Task[]>([]);
export const selectedTask = writable<Task | null>(null);
export const selectedTaskFiles = writable<TaskFile[]>([]);
export const selectedTaskRuns = writable<AgentRun[]>([]);
export const isLoading = writable(false);

// ── Derived Stores (per column) ──────────────────────

function filterByStatus(status: TaskStatus) {
  return derived(allTasks, ($tasks) =>
    $tasks.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder)
  );
}

export const backlogTasks = filterByStatus('backlog');
export const todoTasks = filterByStatus('todo');
export const readyTasks = filterByStatus('ready');
export const planningTasks = filterByStatus('planning');
export const codingTasks = filterByStatus('coding');
export const inProgressTasks = filterByStatus('in_progress');
export const needsHumanTasks = filterByStatus('needs_human');
export const inReviewTasks = filterByStatus('in_review');
export const qaTasks = filterByStatus('qa');
export const doneTasks = filterByStatus('done');
export const cancelledTasks = filterByStatus('cancelled');
export const failedTasks = filterByStatus('failed');

export const columnTasks: Record<TaskStatus, ReturnType<typeof filterByStatus>> = {
  backlog: backlogTasks,
  todo: todoTasks,
  ready: readyTasks,
  planning: planningTasks,
  coding: codingTasks,
  in_progress: inProgressTasks,
  needs_human: needsHumanTasks,
  in_review: inReviewTasks,
  qa: qaTasks,
  done: doneTasks,
  cancelled: cancelledTasks,
  failed: failedTasks,
};

// ── Actions ──────────────────────

export async function loadProjects(): Promise<void> {
  isLoading.set(true);
  try {
    const result = await api.listProjects();
    projects.set(result);
  } finally {
    isLoading.set(false);
  }
}

export async function selectProject(project: Project): Promise<void> {
  currentProject.set(project);
  persistProjectId(project.id);
  await loadTasks(project.id);
}

export async function loadTasks(projectId: string): Promise<void> {
  isLoading.set(true);
  try {
    const result = await api.listTasks(projectId);
    allTasks.set(result);
  } finally {
    isLoading.set(false);
  }
}

export async function addTask(title: string, description?: string): Promise<Task | null> {
  const project = get(currentProject);
  if (!project) return null;

  const task = await api.createTask({
    projectId: project.id,
    title,
    description,
  });

  allTasks.update((tasks) => [...tasks, task]);
  return task;
}

export async function selectTaskById(id: string): Promise<void> {
  isLoading.set(true);
  try {
    const { task, files, runs } = await api.getTask(id);
    selectedTask.set(task);
    selectedTaskFiles.set(files);
    selectedTaskRuns.set(runs);
  } finally {
    isLoading.set(false);
  }
}

export function clearSelectedTask(): void {
  selectedTask.set(null);
  selectedTaskFiles.set([]);
  selectedTaskRuns.set([]);
}

export async function moveTaskToColumn(taskId: string, newStatus: TaskStatus, order?: number): Promise<void> {
  const task = await api.moveTask(taskId, newStatus, order);
  allTasks.update((tasks) =>
    tasks.map((t) => (t.id === taskId ? { ...t, status: task.status, sortOrder: task.sortOrder } : t))
  );
}

export async function removeTask(id: string): Promise<void> {
  await api.deleteTask(id);
  allTasks.update((tasks) => tasks.filter((t) => t.id !== id));
  const sel = get(selectedTask);
  if (sel?.id === id) clearSelectedTask();
}

export async function refreshSelectedTask(): Promise<void> {
  const sel = get(selectedTask);
  if (sel) await selectTaskById(sel.id);
}

// ── Pipeline Actions ──────────────────────

export async function runPlan(taskId: string): Promise<void> {
  await api.planTask(taskId);
}

export async function runCode(taskId: string): Promise<void> {
  await api.codeTask(taskId);
}

export async function runReview(taskId: string): Promise<void> {
  await api.reviewTask(taskId);
}

export async function runPublish(taskId: string): Promise<void> {
  await api.publishTask(taskId);
}

export async function runFullPipeline(taskId: string, autoReview = false): Promise<void> {
  await api.runPipeline(taskId, autoReview);
}

export async function acceptReview(taskId: string): Promise<void> {
  await api.acceptTask(taskId);
}

export async function declineReview(taskId: string): Promise<void> {
  await api.declineTask(taskId);
}
