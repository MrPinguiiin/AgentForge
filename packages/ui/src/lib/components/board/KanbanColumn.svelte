<script lang="ts">
  import { dndzone } from 'svelte-dnd-action';
  import type { Task, TaskStatus } from '../../types/index.js';
  import TaskCard from './TaskCard.svelte';

  let {
    status,
    title,
    icon,
    tasks,
    onTaskClick,
    onDrop,
  }: {
    status: TaskStatus;
    title: string;
    icon: string;
    tasks: Task[];
    onTaskClick?: (task: Task) => void;
    onDrop?: (status: TaskStatus, items: Task[]) => void;
  } = $props();

  // Find column config for styling
  import { COLUMN_CONFIG } from '../../types/index.js';
  const colConfig = COLUMN_CONFIG.find(c => c.id === status);
  const isHighlight = colConfig?.highlight ?? false;

  let items = $state<Task[]>([]);

  $effect(() => {
    items = [...tasks];
  });

  function handleConsider(e: CustomEvent<{ items: Task[] }>) {
    items = e.detail.items;
  }

  function handleFinalize(e: CustomEvent<{ items: Task[] }>) {
    items = e.detail.items;
    onDrop?.(status, items);
  }
</script>

<div class="flex flex-col w-[320px] shrink-0 max-h-full {isHighlight ? 'bg-surface-container-low/50 rounded-xl p-2 border border-outline-variant/50' : ''}">
  <!-- Column Header -->
  <div class="flex items-center justify-between mb-4 px-1 sticky top-0 z-10 py-1 {isHighlight ? 'px-2' : ''}">
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full {colConfig?.dotColor ?? 'bg-secondary'} {isHighlight ? 'shadow-[0_0_8px_rgba(167,139,250,0.6)]' : ''}"></span>
      <h3 class="text-sm font-semibold tracking-wide uppercase {isHighlight ? 'font-bold ' : ''}{colConfig?.textColor ?? 'text-secondary'}">{title}</h3>
      <span class="text-xs {isHighlight ? 'text-primary bg-primary/10 border border-primary/20' : 'text-secondary bg-surface-container'} px-1.5 py-0.5 rounded">
        {tasks.length}
      </span>
    </div>
    <button class="text-secondary hover:text-on-surface transition-colors">
      <span class="material-symbols-outlined text-[18px]">more_horiz</span>
    </button>
  </div>

  <!-- Drop Zone -->
  <div
    class="flex flex-col gap-3 overflow-y-auto kanban-scroll pr-2 pb-2 flex-1 min-h-[100px]"
    use:dndzone={{
      items,
      flipDurationMs: 200,
      dropTargetStyle: { outline: '2px dashed #27272a', borderRadius: '8px' },
    }}
    onconsider={handleConsider}
    onfinalize={handleFinalize}
  >
    {#each items as task (task.id)}
      <div>
        <TaskCard {task} {status} onclick={onTaskClick} />
      </div>
    {/each}

    {#if items.length === 0}
      <div class="h-24 border-2 border-dashed border-outline-variant rounded-lg flex items-center justify-center text-secondary text-sm">
        Drop tasks here
      </div>
    {/if}
  </div>
</div>
