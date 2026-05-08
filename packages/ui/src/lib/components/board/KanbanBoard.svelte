<script lang="ts">
  import type { Task, TaskStatus } from '../../types/index.js';
  import { COLUMN_CONFIG } from '../../types/index.js';
  import {
    allTasks,
    moveTaskToColumn,
    selectTaskById,
    selectedBacklogTasks,
    toggleBacklogSelection,
    selectAllBacklog,
    clearBacklogSelection,
    loadTasks,
    currentProject,
  } from '../../stores/tasks.js';
  import { get } from 'svelte/store';
  import KanbanColumn from './KanbanColumn.svelte';
  import BatchRunSettingsModal from './BatchRunSettingsModal.svelte';
  import * as api from '../../api/client.js';

  let {
    onCreateTask,
  }: {
    onCreateTask?: () => void;
  } = $props();

  let showBatchModal = $state(false);

  function handleTaskClick(task: Task) {
    selectTaskById(task.id);
  }

  async function handleDrop(status: TaskStatus, items: Task[]) {
    for (let i = 0; i < items.length; i++) {
      const task = items[i];
      if (task.status !== status) {
        await moveTaskToColumn(task.id, status, i);
      }
    }
  }

  function getTasksForColumn(tasks: Task[], col: typeof COLUMN_CONFIG[number]): Task[] {
    const statuses = new Set<string>([col.id, ...(col.extraStatuses ?? [])]);
    return tasks
      .filter(t => statuses.has(t.status) && !t.parentId)
      .sort((a, b) => {
        // In planning column, sort by executionOrder
        if (col.id === 'planning') return (a.executionOrder ?? 0) - (b.executionOrder ?? 0);
        return a.sortOrder - b.sortOrder;
      });
  }

  function handleTaskSelect(task: Task) {
    toggleBacklogSelection(task.id);
  }

  function handleSelectAll() {
    // Toggle: if all selected, clear; otherwise select all
    const backlogCol = COLUMN_CONFIG.find(c => c.id === 'backlog')!;
    const backlogTasks = getTasksForColumn($allTasks, backlogCol).filter(t => t.status === 'backlog');
    if ($selectedBacklogTasks.size === backlogTasks.length && backlogTasks.length > 0) {
      clearBacklogSelection();
    } else {
      selectAllBacklog();
    }
  }

  function handleStartSelected() {
    showBatchModal = true;
  }

  async function handleExecuteBatch() {
    // Find the batchId from planning tasks
    const planningCol = COLUMN_CONFIG.find(c => c.id === 'planning')!;
    const planningTasks = getTasksForColumn($allTasks, planningCol);
    if (planningTasks.length === 0) return;

    const batchId = planningTasks[0]?.batchId;
    if (!batchId) return;

    try {
      await api.executeBatch(batchId);
      // Refresh tasks
      const project = get(currentProject);
      if (project) await loadTasks(project.id);
    } catch (err) {
      console.error('Failed to execute batch:', err);
    }
  }
</script>

<div class="flex gap-6 h-full overflow-x-auto kanban-scroll pb-4 items-start">
  {#each COLUMN_CONFIG as col}
    <KanbanColumn
      status={col.id}
      title={col.title}
      icon={col.icon}
      tasks={getTasksForColumn($allTasks, col)}
      onTaskClick={handleTaskClick}
      onDrop={handleDrop}
      selectedTaskIds={$selectedBacklogTasks}
      onTaskSelect={handleTaskSelect}
      onSelectAll={handleSelectAll}
      onStartSelected={handleStartSelected}
      onExecuteBatch={handleExecuteBatch}
      onCreateTask={onCreateTask}
    />
  {/each}
</div>

<BatchRunSettingsModal
  bind:open={showBatchModal}
  taskCount={$selectedBacklogTasks.size}
/>
