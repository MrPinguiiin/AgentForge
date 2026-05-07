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
    selectedTaskIds,
    onTaskSelect,
    onSelectAll,
    onStartSelected,
  }: {
    status: TaskStatus;
    title: string;
    icon: string;
    tasks: Task[];
    onTaskClick?: (task: Task) => void;
    onDrop?: (status: TaskStatus, items: Task[]) => void;
    selectedTaskIds?: Set<string>;
    onTaskSelect?: (task: Task) => void;
    onSelectAll?: () => void;
    onStartSelected?: () => void;
  } = $props();

  // Find column config for styling
  import { COLUMN_CONFIG } from '../../types/index.js';
  const colConfig = COLUMN_CONFIG.find(c => c.id === status);
  const isHighlight = colConfig?.highlight ?? false;
  const isBacklog = status === 'backlog';

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

  let selectedCount = $derived(
    isBacklog && selectedTaskIds ? items.filter(t => selectedTaskIds.has(t.id)).length : 0
  );
</script>

<div class="flex flex-col w-[320px] shrink-0 max-h-full {isHighlight ? 'bg-primary/5 rounded-xl p-2 border border-primary/20' : ''}">
  <!-- Column Header -->
  <div class="flex items-center justify-between mb-4 px-1 sticky top-0 z-10 py-1 {isHighlight ? 'px-2' : ''}">
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full {colConfig?.dotColor ?? 'bg-muted-foreground'} {isHighlight ? 'shadow-[0_0_8px] shadow-primary/60' : ''}"></span>
      <h3 class="text-sm font-semibold tracking-wide uppercase {isHighlight ? 'font-bold ' : ''}{colConfig?.textColor ?? 'text-muted-foreground'}">{title}</h3>
      <span class="text-xs {isHighlight ? 'text-primary bg-primary/10 border border-primary/20' : 'text-muted-foreground bg-secondary'} px-1.5 py-0.5 rounded-md">
        {tasks.length}
      </span>
    </div>
    <div class="flex items-center gap-1">
      {#if isBacklog && tasks.length > 0}
        <button
          class="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
          onclick={() => onSelectAll?.()}
          title="Select all"
        >
          <span class="material-symbols-outlined text-[16px]">select_all</span>
        </button>
      {/if}
      <button class="text-muted-foreground hover:text-foreground transition-colors">
        <span class="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
    </div>
  </div>

  <!-- Batch Start Button (Backlog only) -->
  {#if isBacklog && selectedCount > 0}
    <div class="mb-3 px-1">
      <button
        class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        onclick={() => onStartSelected?.()}
      >
        <span class="material-symbols-outlined text-[16px]">rocket_launch</span>
        Start {selectedCount} {selectedCount === 1 ? 'Task' : 'Tasks'}
      </button>
    </div>
  {/if}

  <!-- Drop Zone -->
  <div
    class="flex flex-col gap-3 overflow-y-auto kanban-scroll pr-2 pb-2 flex-1 min-h-[100px]"
    use:dndzone={{
      items,
      flipDurationMs: 200,
      dropTargetStyle: { outline: '2px dashed var(--border)', borderRadius: '12px' },
    }}
    onconsider={handleConsider}
    onfinalize={handleFinalize}
  >
    {#each items as task (task.id)}
      <div>
        <TaskCard
          {task}
          {status}
          onclick={onTaskClick}
          selectable={isBacklog}
          selected={isBacklog && selectedTaskIds ? selectedTaskIds.has(task.id) : false}
          onselect={onTaskSelect}
        />
      </div>
    {/each}

    {#if items.length === 0}
      <div class="h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground text-sm">
        Drop tasks here
      </div>
    {/if}
  </div>
</div>
