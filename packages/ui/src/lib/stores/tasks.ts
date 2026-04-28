import { writable, derived, get } from 'svelte/store';
import type { Project, Task, TaskFile, AgentRun, TaskStatus } from '../types/index.js';
import * as api from '../api/client.js';

// ── Core Stores ──────────────────────

export const currentProject = writable<Project | null>(null);
export const projects = writable<Project[]>([]);
export const allTasks = writable<Task[]>([]);
export const selectedTask = writable<Task | null>(null);
export const selectedTaskFiles = writable<TaskFile[]>([]);
export const selectedTaskRuns = writable<AgentRun[]>([]);
export const isLoading = writable(false);

// ── Derived Stores (per column) ──────────────────────

export const todoTasks = derived(allTasks, ($tasks) =>
  $tasks.filter((t) => t.status === 'todo').sort((a, b) => a.columnOrder - b.columnOrder)
);

export const inProgressTasks = derived(allTasks, ($tasks) =>
  $tasks.filter((t) => t.status === 'in_progress').sort((a, b) => a.columnOrder - b.columnOrder)
);

export const inReviewTasks = derived(allTasks, ($tasks) =>
  $tasks.filter((t) => t.status === 'in_review').sort((a, b) => a.columnOrder - b.columnOrder)
);

export const doneTasks = derived(allTasks, ($tasks) =>
  $tasks.filter((t) => t.status === 'done').sort((a, b) => a.columnOrder - b.columnOrder)
);

export const publishedTasks = derived(allTasks, ($tasks) =>
  $tasks.filter((t) => t.status === 'published').sort((a, b) => a.columnOrder - b.columnOrder)
);

export const columnTasks: Record<TaskStatus, typeof todoTasks> = {
  todo: todoTasks,
  in_progress: inProgressTasks,
  in_review: inReviewTasks,
  done: doneTasks,
  published: publishedTasks,
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
    tasks.map((t) => (t.id === taskId ? { ...t, status: task.status, columnOrder: task.columnOrder } : t))
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

export async function runFullPipeline(taskId: string): Promise<void> {
  await api.runPipeline(taskId);
}
