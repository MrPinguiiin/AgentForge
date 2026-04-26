<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dndzone } from 'svelte-dnd-action';
  import type { Task, TaskStatus } from '../../types/index.js';
  import TaskCard from './TaskCard.svelte';

  let {
    status,
    title,
    color,
    tasks,
    onTaskClick,
    onDrop,
  }: {
    status: TaskStatus;
    title: string;
    color: string;
    tasks: Task[];
    onTaskClick?: (task: Task) => void;
    onDrop?: (status: TaskStatus, items: Task[]) => void;
  } = $props();

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

<div class="flex flex-col h-full min-w-[280px] w-[280px]">
  <!-- Column Header -->
  <div class="flex items-center justify-between px-2 py-2 mb-2">
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full {color.replace('text-', 'bg-')}"></span>
      <h3 class="text-xs font-semibold text-text uppercase tracking-wider">{title}</h3>
    </div>
    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-lighter text-text-muted font-medium">
      {tasks.length}
    </span>
  </div>

  <!-- Drop Zone -->
  <div
    class="flex-1 overflow-y-auto space-y-2 p-1 rounded-lg min-h-[100px]"
    use:dndzone={{
      items,
      flipDurationMs: 200,
      dropTargetStyle: { outline: '2px dashed var(--color-border-light)', borderRadius: '8px' },
    }}
    onconsider={handleConsider}
    onfinalize={handleFinalize}
  >
    {#each items as task (task.id)}
      <div>
        <TaskCard {task} onclick={onTaskClick} />
      </div>
    {/each}
  </div>
</div>
