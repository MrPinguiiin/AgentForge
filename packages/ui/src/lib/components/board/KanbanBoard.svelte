<script lang="ts">
  import type { Task, TaskStatus } from '../../types/index.js';
  import { COLUMN_CONFIG } from '../../types/index.js';
  import { allTasks, moveTaskToColumn, selectTaskById } from '../../stores/tasks.js';
  import KanbanColumn from './KanbanColumn.svelte';

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
    />
  {/each}
</div>
