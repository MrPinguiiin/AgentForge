<script lang="ts">
  import type { Task } from '../../types/index.js';
  import Badge from '../common/Badge.svelte';

  let {
    task,
    onclick,
  }: {
    task: Task;
    onclick?: (task: Task) => void;
  } = $props();

  const priorityLabels: Record<number, { label: string; variant: 'danger' | 'warning' | 'default' }> = {
    0: { label: 'Low', variant: 'default' },
    1: { label: 'Medium', variant: 'warning' },
    2: { label: 'High', variant: 'danger' },
  };

  let priority = $derived(priorityLabels[task.priority] ?? priorityLabels[0]);
</script>

<button
  class="w-full text-left p-3 bg-surface rounded-lg border border-border hover:border-border-light transition-colors cursor-grab active:cursor-grabbing group"
  onclick={() => onclick?.(task)}
>
  <div class="flex items-start justify-between gap-2 mb-1.5">
    <h4 class="text-sm font-medium text-text group-hover:text-primary-light transition-colors line-clamp-2">
      {task.title}
    </h4>
    {#if task.priority > 0}
      <Badge variant={priority.variant}>{priority.label}</Badge>
    {/if}
  </div>

  {#if task.description}
    <p class="text-xs text-text-muted line-clamp-2 mb-2">
      {task.description}
    </p>
  {/if}

  <div class="flex items-center gap-2 text-[10px] text-text-muted">
    <span>{task.id.slice(0, 8)}</span>
    {#if task.subtasks && task.subtasks.length > 0}
      <span class="flex items-center gap-0.5">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        {task.subtasks.length}
      </span>
    {/if}
  </div>
</button>
