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
  } from '../../stores/tasks.js';
  import KanbanColumn from './KanbanColumn.svelte';
  import BatchRunSettingsModal from './BatchRunSettingsModal.svelte';

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

  function getTasksForStatus(tasks: Task[], status: TaskStatus): Task[] {
    return tasks
      .filter(t => t.status === status && !t.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function handleTaskSelect(task: Task) {
    toggleBacklogSelection(task.id);
  }

  function handleSelectAll() {
    // Toggle: if all selected, clear; otherwise select all
    const backlogTasks = getTasksForStatus($allTasks, 'backlog');
    if ($selectedBacklogTasks.size === backlogTasks.length && backlogTasks.length > 0) {
      clearBacklogSelection();
    } else {
      selectAllBacklog();
    }
  }

  function handleStartSelected() {
    showBatchModal = true;
  }
</script>

<div class="flex gap-6 h-full overflow-x-auto kanban-scroll pb-4 items-start">
  {#each COLUMN_CONFIG as col}
    <KanbanColumn
      status={col.id}
      title={col.title}
      icon={col.icon}
      tasks={getTasksForStatus($allTasks, col.id)}
      onTaskClick={handleTaskClick}
      onDrop={handleDrop}
      selectedTaskIds={$selectedBacklogTasks}
      onTaskSelect={handleTaskSelect}
      onSelectAll={handleSelectAll}
      onStartSelected={handleStartSelected}
    />
  {/each}
</div>

<BatchRunSettingsModal
  bind:open={showBatchModal}
  taskCount={$selectedBacklogTasks.size}
/>
