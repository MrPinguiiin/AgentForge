<script lang="ts">
  import type { Task, TaskStatus } from '../../types/index.js';

  let {
    task,
    status,
    onclick,
  }: {
    task: Task;
    status?: TaskStatus;
    onclick?: (task: Task) => void;
  } = $props();

  const isInProgress = $derived(status === 'in_progress');
  const isNeedsHuman = $derived(status === 'needs_human');
  const isReady = $derived(status === 'ready');

  // Get label badges from task labels
  const labelBadges = $derived(
    task.labels?.map(l => l.value) ?? []
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="bg-card rounded-xl p-4 border transition-all duration-200 cursor-grab active:cursor-grabbing group relative overflow-hidden shadow-sm hover:shadow-md
    {isInProgress ? 'border-2 border-primary shadow-md' :
     isNeedsHuman ? 'border-destructive/30 hover:border-destructive' :
     isReady ? 'border-border hover:border-primary/50' :
     'border-border hover:border-muted-foreground/30'}"
  onclick={() => onclick?.(task)}
>
  <!-- Left accent for ready/needs_human -->
  {#if isReady}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary/30 rounded-l-xl"></div>
  {/if}
  {#if isNeedsHuman}
    <div class="absolute left-0 top-0 bottom-0 w-1 bg-destructive/50 rounded-l-xl"></div>
  {/if}

  <!-- Agent working indicator for in_progress -->
  {#if isInProgress && task.agentType}
    <div class="absolute -top-2 -right-2 bg-card border border-primary rounded-full p-1 shadow-lg flex items-center justify-center animate-pulse">
      <span class="material-symbols-outlined text-[14px] text-primary" style="font-variation-settings: 'FILL' 1;">smart_toy</span>
    </div>
  {/if}

  <!-- Card Header -->
  <div class="flex justify-between items-start mb-2 {isReady || isNeedsHuman ? 'pl-1' : ''}">
    <span class="text-xs text-muted-foreground font-mono tracking-tight">{task.id.slice(0, 8).toUpperCase()}</span>
    <div class="flex items-center gap-1">
      {#if isInProgress && task.agentType}
        <span class="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span class="material-symbols-outlined text-[12px] animate-spin">sync</span>
          Working
        </span>
      {:else if isNeedsHuman}
        <span class="material-symbols-outlined text-[14px] text-destructive">warning</span>
      {:else if isReady}
        <span class="flex items-center gap-1 text-[10px] text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded-md">
          <span class="material-symbols-outlined text-[12px]">bolt</span> Agent Task
        </span>
      {:else}
        <span class="material-symbols-outlined text-[16px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">drag_indicator</span>
      {/if}
    </div>
  </div>

  <!-- Title -->
  <h4 class="text-sm {isInProgress ? 'font-semibold' : 'font-medium'} text-card-foreground mb-2 leading-snug {isReady || isNeedsHuman ? 'pl-1' : ''}">
    {task.title}
  </h4>

  <!-- Description (if exists) -->
  {#if task.description}
    <p class="text-xs text-muted-foreground mb-3 line-clamp-2 {isReady || isNeedsHuman ? 'pl-1' : ''}">
      {task.description}
    </p>
  {/if}

  <!-- Footer: Labels + Meta -->
  <div class="flex items-center justify-between mt-auto pt-2 border-t border-border/50 {isReady || isNeedsHuman ? 'pl-1' : ''}">
    <div class="flex gap-2 flex-wrap">
      {#if labelBadges.length > 0}
        {#each labelBadges.slice(0, 3) as label}
          <span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
            {label}
          </span>
        {/each}
      {:else if task.agentType}
        <span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground">
          {task.agentType}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if task.agentType && (isInProgress || status === 'in_review')}
        <div class="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 overflow-hidden flex items-center justify-center">
          <span class="material-symbols-outlined text-[12px] text-primary">smart_toy</span>
        </div>
      {/if}
      {#if task.branch}
        <span class="material-symbols-outlined text-[14px] text-muted-foreground">merge</span>
      {/if}
    </div>
  </div>
</div>
